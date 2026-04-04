import {
  createWebhookRouteSchema,
  updateWebhookRouteSchema,
  customHeaderSchema,
} from "../schemas/webhook-route";

describe("createWebhookRouteSchema", () => {
  const validRoute = {
    name: "Minha Rota",
    icon: "Webhook",
    url: "https://api.example.com/webhook",
    events: ["messages.text", "statuses.delivered"],
  };

  it("aceita uma rota valida com campos obrigatorios", () => {
    const result = createWebhookRouteSchema.safeParse(validRoute);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeoutMs).toBe(30000); // default
    }
  });

  it("aceita uma rota com todos os campos opcionais", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      secretKey: "my-secret-key-123",
      timeoutMs: 15000,
      headers: [
        { key: "X-Custom-Header", value: "valor" },
        { key: "X-Api-Key", value: "abc123" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita URL sem HTTPS", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      url: "http://api.example.com/webhook",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("HTTPS");
    }
  });

  it("rejeita URL invalida", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita nome vazio", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita nome com mais de 100 caracteres", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita array de eventos vazio", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      events: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("pelo menos 1 evento");
    }
  });

  it("rejeita evento invalido", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      events: ["messages.text", "evento.invalido"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita timeout fora do range (< 1000ms)", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      timeoutMs: 500,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita timeout fora do range (> 60000ms)", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      timeoutMs: 120000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita header bloqueado (Host)", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      headers: [{ key: "Host", value: "evil.com" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("bloqueado");
    }
  });

  it("rejeita header bloqueado (Authorization)", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      headers: [{ key: "Authorization", value: "Bearer xxx" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita header bloqueado case-insensitive (host)", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      headers: [{ key: "host", value: "evil.com" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita header com chave vazia", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      headers: [{ key: "", value: "value" }],
    });
    expect(result.success).toBe(false);
  });

  it("aceita no maximo 20 headers", () => {
    const headers = Array.from({ length: 21 }, (_, i) => ({
      key: `X-Header-${i}`,
      value: `value-${i}`,
    }));
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      headers,
    });
    expect(result.success).toBe(false);
  });

  it("remove duplicatas de eventos", () => {
    const result = createWebhookRouteSchema.safeParse({
      ...validRoute,
      events: ["messages.text", "messages.text", "statuses.sent"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.events).toEqual(["messages.text", "statuses.sent"]);
    }
  });
});

describe("updateWebhookRouteSchema", () => {
  it("aceita atualizacao parcial (somente nome)", () => {
    const result = updateWebhookRouteSchema.safeParse({
      name: "Novo Nome",
    });
    expect(result.success).toBe(true);
  });

  it("aceita atualizacao parcial (somente eventos)", () => {
    const result = updateWebhookRouteSchema.safeParse({
      events: ["messages.text"],
    });
    expect(result.success).toBe(true);
  });

  it("aplica mesmas validacoes de URL", () => {
    const result = updateWebhookRouteSchema.safeParse({
      url: "http://not-https.com",
    });
    expect(result.success).toBe(false);
  });
});

describe("customHeaderSchema", () => {
  it("aceita header valido", () => {
    const result = customHeaderSchema.safeParse({
      key: "X-Custom",
      value: "abc",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita header com chave vazia", () => {
    const result = customHeaderSchema.safeParse({
      key: "",
      value: "abc",
    });
    expect(result.success).toBe(false);
  });
});
