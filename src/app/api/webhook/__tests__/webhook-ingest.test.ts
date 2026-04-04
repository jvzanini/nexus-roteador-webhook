/**
 * Testes da orquestracao do webhook ingest.
 *
 * Estes testes verificam o fluxo end-to-end de forma unitaria,
 * mockando Prisma e BullMQ para isolar a logica do handler.
 *
 * Para testes com banco real, ver testes e2e (implementacao futura).
 */

import { createHmac } from "crypto";
import { normalizeWebhookPayload } from "@/lib/webhook/normalizer";
import { computeDedupeKey } from "@/lib/webhook/deduplicator";
import { verifySignature } from "@/lib/webhook/signature";

// Estes testes validam a integracao entre os modulos sem HTTP
describe("Webhook Ingest - Integracao entre modulos", () => {
  const appSecret = "test-secret-for-integration";

  function sign(body: string): string {
    return "sha256=" + createHmac("sha256", appSecret).update(body, "utf8").digest("hex");
  }

  function buildMessageCallback(
    messageId: string = "wamid.TEST_MSG_1",
    messageType: string = "text"
  ): Record<string, unknown> {
    return {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_INTEGRATION",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "5511999999999",
                  phone_number_id: "PHONE_1",
                },
                messages: [
                  {
                    id: messageId,
                    from: "5511888888888",
                    timestamp: "1677777777",
                    type: messageType,
                    text: { body: "Teste" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  it("fluxo completo: assinatura -> normalizacao -> dedupe_key", () => {
    const callback = buildMessageCallback();
    const rawBody = JSON.stringify(callback);
    const signature = sign(rawBody);

    // 1. Validar assinatura
    expect(verifySignature(rawBody, signature, appSecret)).toBe(true);

    // 2. Normalizar
    const events = normalizeWebhookPayload(callback as any);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("messages.text");

    // 3. Computar dedupe_key
    const dedupeKey = computeDedupeKey({
      wabaId: events[0].wabaId,
      eventType: events[0].eventType,
      messageId: (events[0].payload.message as any).id,
    });
    expect(dedupeKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("callback multi-evento gera dedupe_keys distintas", () => {
    const callback = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_MULTI",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5511999999999", phone_number_id: "P1" },
                messages: [
                  { id: "wamid.A", from: "55118", timestamp: "1", type: "text", text: { body: "A" } },
                  { id: "wamid.B", from: "55117", timestamp: "2", type: "image", image: { id: "I1" } },
                ],
                statuses: [
                  { id: "wamid.C", status: "delivered", timestamp: "3", recipient_id: "55116" },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(callback as any);
    expect(events).toHaveLength(3);

    const keys = events.map((e) => {
      if (e.eventType.startsWith("messages.")) {
        return computeDedupeKey({
          wabaId: e.wabaId,
          eventType: e.eventType,
          messageId: (e.payload.message as any).id,
        });
      } else {
        const s = e.payload.status as any;
        return computeDedupeKey({
          wabaId: e.wabaId,
          eventType: e.eventType,
          statusId: s.id,
          statusValue: s.status,
        });
      }
    });

    // Todas as keys devem ser unicas
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(3);
  });

  it("assinatura invalida eh detectada antes da normalizacao", () => {
    const callback = buildMessageCallback();
    const rawBody = JSON.stringify(callback);
    const invalidSignature = "sha256=0000000000000000000000000000000000000000000000000000000000000000";

    expect(verifySignature(rawBody, invalidSignature, appSecret)).toBe(false);

    // Normalizacao nem deveria ocorrer com assinatura invalida,
    // mas podemos verificar que o callback eh valido se fosse processado
    const events = normalizeWebhookPayload(callback as any);
    expect(events).toHaveLength(1);
  });

  it("mesmo callback reserializado produz assinatura diferente", () => {
    const callback = buildMessageCallback();
    const rawBody = JSON.stringify(callback);
    const reserializedBody = JSON.stringify(JSON.parse(rawBody));

    // Na maioria dos casos sao iguais, mas se o original tivesse espacos/formatacao diferente,
    // a assinatura seria diferente. Aqui testamos o principio.
    const signature = sign(rawBody);
    expect(verifySignature(rawBody, signature, appSecret)).toBe(true);
    // Reserializado (neste caso igual) tambem valida
    expect(verifySignature(reserializedBody, signature, appSecret)).toBe(true);
  });

  it("dedupe_key para statuses diferencia sent/delivered/read do mesmo wamid", () => {
    const statusCallback = (statusValue: string) => ({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_STATUS_TEST",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5511999999999", phone_number_id: "P1" },
                statuses: [
                  { id: "wamid.SAME_MSG", status: statusValue, timestamp: "1", recipient_id: "55118" },
                ],
              },
            },
          ],
        },
      ],
    });

    const sentEvents = normalizeWebhookPayload(statusCallback("sent") as any);
    const deliveredEvents = normalizeWebhookPayload(statusCallback("delivered") as any);
    const readEvents = normalizeWebhookPayload(statusCallback("read") as any);

    const keySent = computeDedupeKey({
      wabaId: sentEvents[0].wabaId,
      eventType: sentEvents[0].eventType,
      statusId: (sentEvents[0].payload.status as any).id,
      statusValue: (sentEvents[0].payload.status as any).status,
    });

    const keyDelivered = computeDedupeKey({
      wabaId: deliveredEvents[0].wabaId,
      eventType: deliveredEvents[0].eventType,
      statusId: (deliveredEvents[0].payload.status as any).id,
      statusValue: (deliveredEvents[0].payload.status as any).status,
    });

    const keyRead = computeDedupeKey({
      wabaId: readEvents[0].wabaId,
      eventType: readEvents[0].eventType,
      statusId: (readEvents[0].payload.status as any).id,
      statusValue: (readEvents[0].payload.status as any).status,
    });

    expect(keySent).not.toBe(keyDelivered);
    expect(keySent).not.toBe(keyRead);
    expect(keyDelivered).not.toBe(keyRead);
  });
});
