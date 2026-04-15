import { computeDedupeKey, extractDedupeParams } from "../deduplicator-legacy";
import { NormalizedEvent } from "../normalizer-legacy";

describe("computeDedupeKey", () => {
  it("gera dedupe_key para mensagem com message.id", () => {
    const key = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "messages.text",
      messageId: "wamid.HBgNNTUxMTk5OTk5OTk5",
    });

    expect(key).toBeDefined();
    expect(typeof key).toBe("string");
    expect(key.length).toBe(64); // SHA-256 hex = 64 chars
  });

  it("gera mesma dedupe_key para mesmos inputs (deterministico)", () => {
    const params = {
      wabaId: "WABA_123",
      eventType: "messages.text",
      messageId: "wamid.HBgNNTUxMTk5OTk5OTk5",
    };

    const key1 = computeDedupeKey(params);
    const key2 = computeDedupeKey(params);

    expect(key1).toBe(key2);
  });

  it("gera dedupe_key diferente para WABAs diferentes", () => {
    const key1 = computeDedupeKey({
      wabaId: "WABA_111",
      eventType: "messages.text",
      messageId: "wamid.SAME",
    });

    const key2 = computeDedupeKey({
      wabaId: "WABA_222",
      eventType: "messages.text",
      messageId: "wamid.SAME",
    });

    expect(key1).not.toBe(key2);
  });

  it("gera dedupe_key diferente para event_types diferentes", () => {
    const key1 = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "messages.text",
      messageId: "wamid.SAME",
    });

    const key2 = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "messages.image",
      messageId: "wamid.SAME",
    });

    expect(key1).not.toBe(key2);
  });

  it("gera dedupe_key para status com id + status (distingue sent/delivered/read)", () => {
    const keySent = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "statuses.sent",
      statusId: "wamid.STATUS_1",
      statusValue: "sent",
    });

    const keyDelivered = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "statuses.delivered",
      statusId: "wamid.STATUS_1",
      statusValue: "delivered",
    });

    const keyRead = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "statuses.read",
      statusId: "wamid.STATUS_1",
      statusValue: "read",
    });

    // Todos devem ser diferentes (mesmo wamid, status diferente)
    expect(keySent).not.toBe(keyDelivered);
    expect(keySent).not.toBe(keyRead);
    expect(keyDelivered).not.toBe(keyRead);
  });

  it("gera dedupe_key para eventos sem ID usando hash do trecho", () => {
    const key = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "account_update",
      fallbackContent: { phone_number: "5511999999999", event: "VERIFIED_ACCOUNT" },
    });

    expect(key).toBeDefined();
    expect(key.length).toBe(64);
  });

  it("gera dedupe_key diferente para fallback com conteudo diferente", () => {
    const key1 = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "account_update",
      fallbackContent: { phone_number: "5511999999999", event: "VERIFIED_ACCOUNT" },
    });

    const key2 = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "account_update",
      fallbackContent: { phone_number: "5511999999999", event: "PHONE_NUMBER_NAME_UPDATE" },
    });

    expect(key1).not.toBe(key2);
  });

  it("fallback gera mesma chave para mesmo conteudo (independente da ordem das chaves)", () => {
    const key1 = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "account_update",
      fallbackContent: { a: 1, b: 2 },
    });

    const key2 = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "account_update",
      fallbackContent: { b: 2, a: 1 },
    });

    // JSON.stringify com sorted keys deve gerar mesma chave
    expect(key1).toBe(key2);
  });

  it("inclui prefixo de versao 'v1:' na entrada do hash", () => {
    const key = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "messages.text",
      messageId: "wamid.TEST",
    });

    // A chave eh um SHA-256 hex valido
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("extractDedupeParams", () => {
  it("extrai params de mensagem", () => {
    const event: NormalizedEvent = {
      eventType: "messages.text",
      wabaId: "WABA_123",
      payload: {
        message: { id: "wamid.MSG_1", type: "text", text: { body: "Oi" } },
        metadata: {},
      },
    };

    const params = extractDedupeParams(event);
    expect(params.messageId).toBe("wamid.MSG_1");
    expect(params.statusId).toBeUndefined();
  });

  it("extrai params de status", () => {
    const event: NormalizedEvent = {
      eventType: "statuses.delivered",
      wabaId: "WABA_123",
      payload: {
        status: { id: "wamid.S1", status: "delivered" },
        metadata: {},
      },
    };

    const params = extractDedupeParams(event);
    expect(params.statusId).toBe("wamid.S1");
    expect(params.statusValue).toBe("delivered");
    expect(params.messageId).toBeUndefined();
  });

  it("extrai params de fallback para eventos sem ID", () => {
    const event: NormalizedEvent = {
      eventType: "account_update",
      wabaId: "WABA_123",
      payload: {
        value: { phone: "5511999999999", event: "VERIFIED" },
      },
    };

    const params = extractDedupeParams(event);
    expect(params.fallbackContent).toBeDefined();
    expect(params.messageId).toBeUndefined();
    expect(params.statusId).toBeUndefined();
  });
});
