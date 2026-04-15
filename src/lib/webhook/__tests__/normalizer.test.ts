import { normalizeWebhookPayload } from "../normalizer";

describe("normalizeWebhookPayload (pacote)", () => {
  it("normaliza mensagem de texto com dedupeIdentifier=wamid", () => {
    const res = normalizeWebhookPayload(
      {
        entry: [
          {
            id: "WABA_1",
            changes: [
              {
                field: "messages",
                value: {
                  messages: [{ id: "wamid.A", type: "text", text: { body: "hi" } }],
                  metadata: { phone_number_id: "PNID" },
                },
              },
            ],
          },
        ],
      },
      "c1",
    );
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      eventType: "messages.text",
      sourceId: "WABA_1",
      dedupeIdentifier: "wamid.A",
    });
  });

  it("statuses usa id:status como dedupeIdentifier", () => {
    const res = normalizeWebhookPayload(
      {
        entry: [
          {
            id: "WABA_1",
            changes: [
              {
                field: "messages",
                value: {
                  statuses: [
                    { id: "wamid.S", status: "delivered", recipient_id: "5511" },
                  ],
                },
              },
            ],
          },
        ],
      },
      "c1",
    );
    expect(res[0].eventType).toBe("statuses.delivered");
    expect(res[0].dedupeIdentifier).toBe("wamid.S:delivered");
  });

  it("calls usa call.id", () => {
    const res = normalizeWebhookPayload(
      {
        entry: [
          {
            id: "WABA_1",
            changes: [
              {
                field: "calls",
                value: { calls: [{ id: "call_1", event: "ringing" }] },
              },
            ],
          },
        ],
      },
      "c1",
    );
    expect(res[0].eventType).toBe("calls.ringing");
    expect(res[0].dedupeIdentifier).toBe("call_1");
  });

  it("errors tem dedupeIdentifier=null (fallback hash no pacote)", () => {
    const res = normalizeWebhookPayload(
      {
        entry: [
          {
            id: "WABA_1",
            changes: [
              {
                field: "messages",
                value: { errors: [{ code: 131000, title: "rate_limit" }] },
              },
            ],
          },
        ],
      },
      "c1",
    );
    expect(res[0].eventType).toBe("errors.131000");
    expect(res[0].dedupeIdentifier).toBeNull();
  });

  it("sourceId fallback para companyId quando entry.id ausente", () => {
    const res = normalizeWebhookPayload(
      {
        entry: [
          {
            // sem id
            changes: [
              {
                field: "messages",
                value: { messages: [{ id: "w", type: "text" }] },
              },
            ],
          },
        ],
      },
      "company_xyz",
    );
    expect(res[0].sourceId).toBe("company_xyz");
  });

  it("payload vazio retorna []", () => {
    expect(normalizeWebhookPayload({}, "c1")).toEqual([]);
    expect(normalizeWebhookPayload({ entry: [] }, "c1")).toEqual([]);
  });

  it("multiplas mensagens geram N eventos", () => {
    const res = normalizeWebhookPayload(
      {
        entry: [
          {
            id: "WABA_1",
            changes: [
              {
                field: "messages",
                value: {
                  messages: [
                    { id: "w1", type: "text" },
                    { id: "w2", type: "image" },
                  ],
                },
              },
            ],
          },
        ],
      },
      "c1",
    );
    expect(res).toHaveLength(2);
    expect(res.map((e) => e.eventType)).toEqual(["messages.text", "messages.image"]);
  });
});
