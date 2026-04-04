import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { verifySignature } from "@/lib/webhook/signature";
import { normalizeWebhookPayload } from "@/lib/webhook/normalizer";
import { computeDedupeKey, extractDedupeParams } from "@/lib/webhook/deduplicator";
import { webhookDeliveryQueue } from "@/lib/queue";
import { logAudit } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ webhookKey: string }>;
}

/**
 * GET /api/webhook/[webhookKey]
 *
 * Verificacao de webhook da Meta (challenge/response).
 * A Meta envia este request ao cadastrar/verificar o webhook.
 *
 * Query params esperados:
 *   hub.mode=subscribe
 *   hub.verify_token=<token configurado>
 *   hub.challenge=<string aleatorio>
 *
 * Se o verify_token corresponder, retorna o challenge como plain text.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { webhookKey } = await params;

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return NextResponse.json(
      { error: "Missing required query parameters" },
      { status: 400 }
    );
  }

  // Buscar empresa pelo webhook_key
  const company = await prisma.company.findUnique({
    where: { webhookKey },
    include: { credential: true },
  });

  if (!company || !company.isActive || !company.credential) {
    return NextResponse.json(
      { error: "Webhook not found" },
      { status: 404 }
    );
  }

  // Descriptografar verify_token e comparar
  const decryptedVerifyToken = decrypt(company.credential.verifyToken);

  if (token !== decryptedVerifyToken) {
    return NextResponse.json(
      { error: "Invalid verify token" },
      { status: 403 }
    );
  }

  // Retorna o challenge como plain text (a Meta espera isso)
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * POST /api/webhook/[webhookKey]
 *
 * Recebimento de webhooks da Meta WhatsApp Cloud API.
 *
 * Fluxo completo (spec v7):
 * 1. Buscar empresa pelo webhook_key
 * 2. Ler raw body e validar assinatura X-Hub-Signature-256
 * 3. Assinatura invalida -> HTTP 401 + AuditLog
 * 4. Normalizar callback em N eventos individuais
 * 5. Para cada evento: dedupe -> transacao (InboundWebhook + RouteDeliveries) -> enqueue
 * 6. Retornar HTTP 200 apos todos os COMMITs
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { webhookKey } = await params;

  // 1. Buscar empresa pelo webhook_key
  const company = await prisma.company.findUnique({
    where: { webhookKey },
    include: { credential: true },
  });

  if (!company || !company.isActive || !company.credential) {
    return NextResponse.json(
      { error: "Webhook not found" },
      { status: 404 }
    );
  }

  // 2. Ler raw body (preservar byte stream original para verificacao de assinatura)
  const rawBody = await request.text();

  // 3. Validar assinatura X-Hub-Signature-256
  const signatureHeader = request.headers.get("x-hub-signature-256") ?? "";
  const appSecret = decrypt(company.credential.metaAppSecret);

  if (!verifySignature(rawBody, signatureHeader, appSecret)) {
    // Assinatura invalida -> HTTP 401 + registro no AuditLog
    await logAudit({
      actorType: "system",
      actorLabel: "webhook-ingest",
      companyId: company.id,
      action: "auth.invalid_signature",
      resourceType: "InboundWebhook",
      details: {
        webhookKey,
        reason: "Assinatura X-Hub-Signature-256 invalida",
      },
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // 4. Parse e normalizacao multi-evento
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const normalizedEvents = normalizeWebhookPayload(payload as any);

  if (normalizedEvents.length === 0) {
    // Callback valido mas sem eventos reconhecidos -- aceitar silenciosamente
    return NextResponse.json({ status: "ok", events: 0 });
  }

  // 5. Processar cada evento normalizado
  const now = new Date();
  const createdDeliveryIds: string[] = [];
  let eventsProcessed = 0;
  let eventsDeduplicated = 0;

  for (const event of normalizedEvents) {
    // 5a. Calcular dedupe_key usando helper
    const dedupeParams = extractDedupeParams(event);
    const dedupeKey = computeDedupeKey(dedupeParams);

    // 5b. Verificar deduplicacao (janela 24h)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const existing = await prisma.inboundWebhook.findFirst({
      where: {
        dedupeKey,
        createdAt: { gt: twentyFourHoursAgo },
      },
      select: { id: true },
    });

    if (existing) {
      eventsDeduplicated++;
      continue; // Pula este evento, os demais continuam
    }

    // 5c. Transacao PostgreSQL: persistir InboundWebhook + materializar RouteDeliveries
    const activeRoutes = await prisma.webhookRoute.findMany({
      where: {
        companyId: company.id,
        isActive: true,
      },
    });

    // Filtrar rotas que aceitam este event_type
    const matchingRoutes = activeRoutes.filter((route) => {
      const events = route.events as string[];
      if (!Array.isArray(events)) return false;
      // Aceita se a rota tem o eventType exato OU wildcard "*"
      return events.includes(event.eventType) || events.includes("*");
    });

    const result = await prisma.$transaction(async (tx) => {
      // Persistir InboundWebhook
      const inboundWebhook = await tx.inboundWebhook.create({
        data: {
          companyId: company.id,
          receivedAt: now,
          rawBody: rawBody,
          rawPayload: payload as object,
          eventType: event.eventType,
          dedupeKey,
          processingStatus: matchingRoutes.length > 0 ? "received" : "no_routes",
        },
      });

      // Materializar RouteDeliveries para cada rota compativel
      const deliveries: string[] = [];
      for (const route of matchingRoutes) {
        // Invariante: RouteDelivery.company_id === route.company_id
        if (route.companyId !== company.id) {
          console.error(
            `[webhook-ingest] Mismatch de company_id: route ${route.id} pertence a company ${route.companyId}, mas webhook eh da company ${company.id}. Pulando.`
          );
          continue;
        }

        const delivery = await tx.routeDelivery.create({
          data: {
            inboundWebhookId: inboundWebhook.id,
            routeId: route.id,
            companyId: company.id,
            status: "pending",
          },
        });
        deliveries.push(delivery.id);
      }

      return { inboundWebhookId: inboundWebhook.id, deliveryIds: deliveries };
    });

    createdDeliveryIds.push(...result.deliveryIds);
    eventsProcessed++;

    // 5d. Enqueue pos-commit (best-effort, orphan-recovery compensa falhas)
    try {
      const enqueuePromises = result.deliveryIds.map((deliveryId) =>
        webhookDeliveryQueue.add(
          "deliver",
          {
            routeDeliveryId: deliveryId,
            inboundWebhookId: result.inboundWebhookId,
            companyId: company.id,
          },
          {
            jobId: `delivery-${deliveryId}`,
            attempts: 1, // Retries sao gerenciados pelo worker, nao pelo BullMQ
          }
        )
      );

      await Promise.all(enqueuePromises);

      // Atualizar processing_status para queued (fora da transacao, best-effort)
      if (result.deliveryIds.length > 0) {
        await prisma.inboundWebhook.update({
          where: { id: result.inboundWebhookId },
          data: { processingStatus: "queued" },
        });
      }
    } catch (enqueueError) {
      // Se o enqueue falhar (Redis down, crash), as RouteDeliveries ja estao
      // persistidas no banco com status=pending. O orphan-recovery vai detectar
      // e reenfileirar automaticamente.
      console.error(
        `[webhook-ingest] Falha no enqueue para InboundWebhook ${result.inboundWebhookId}:`,
        enqueueError
      );
    }
  }

  // 6. Retornar HTTP 200 (ACK para a Meta) -- apos todos os COMMITs
  return NextResponse.json({
    status: "ok",
    events: eventsProcessed,
    deduplicated: eventsDeduplicated,
  });
}
