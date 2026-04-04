import { normalizeWebhookPayload, NormalizedEvent } from "../normalizer";

describe("normalizeWebhookPayload", () => {
  it("normaliza callback com uma mensagem de texto", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_123",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "5511999999999",
                  phone_number_id: "PHONE_ID_1",
                },
                messages: [
                  {
                    id: "wamid.HBgNNTUxMTk5OTk5OTk5",
                    from: "5511888888888",
                    timestamp: "1677777777",
                    type: "text",
                    text: { body: "Ola mundo" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(payload);

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("messages.text");
    expect(events[0].wabaId).toBe("WABA_ID_123");
    expect(events[0].payload.message.id).toBe("wamid.HBgNNTUxMTk5OTk5OTk5");
    expect(events[0].payload.message.type).toBe("text");
    expect(events[0].payload.metadata).toBeDefined();
  });

  it("normaliza callback com multiplas mensagens no mesmo change", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_123",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "5511999999999",
                  phone_number_id: "PHONE_ID_1",
                },
                messages: [
                  {
                    id: "wamid.MSG_1",
                    from: "5511888888888",
                    timestamp: "1677777777",
                    type: "text",
                    text: { body: "Msg 1" },
                  },
                  {
                    id: "wamid.MSG_2",
                    from: "5511888888888",
                    timestamp: "1677777778",
                    type: "image",
                    image: { id: "IMG_1", mime_type: "image/jpeg" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(payload);

    expect(events).toHaveLength(2);
    expect(events[0].eventType).toBe("messages.text");
    expect(events[0].payload.message.id).toBe("wamid.MSG_1");
    expect(events[1].eventType).toBe("messages.image");
    expect(events[1].payload.message.id).toBe("wamid.MSG_2");
  });

  it("normaliza callback com statuses", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_123",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "5511999999999",
                  phone_number_id: "PHONE_ID_1",
                },
                statuses: [
                  {
                    id: "wamid.STATUS_1",
                    status: "delivered",
                    timestamp: "1677777777",
                    recipient_id: "5511888888888",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(payload);

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("statuses.delivered");
    expect(events[0].payload.status.id).toBe("wamid.STATUS_1");
    expect(events[0].payload.status.status).toBe("delivered");
  });

  it("normaliza callback com mensagens E statuses no mesmo change", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_123",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "5511999999999",
                  phone_number_id: "PHONE_ID_1",
                },
                messages: [
                  {
                    id: "wamid.MSG_1",
                    from: "5511888888888",
                    timestamp: "1677777777",
                    type: "text",
                    text: { body: "Ola" },
                  },
                ],
                statuses: [
                  {
                    id: "wamid.STATUS_1",
                    status: "sent",
                    timestamp: "1677777776",
                    recipient_id: "5511888888888",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(payload);

    expect(events).toHaveLength(2);
    const types = events.map((e) => e.eventType);
    expect(types).toContain("messages.text");
    expect(types).toContain("statuses.sent");
  });

  it("normaliza callback com multiplos entries", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5511999999999", phone_number_id: "P1" },
                messages: [
                  { id: "wamid.A", from: "5511888888888", timestamp: "1677777777", type: "text", text: { body: "A" } },
                ],
              },
            },
          ],
        },
        {
          id: "WABA_ID_2",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5511777777777", phone_number_id: "P2" },
                messages: [
                  { id: "wamid.B", from: "5511666666666", timestamp: "1677777778", type: "text", text: { body: "B" } },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(payload);

    expect(events).toHaveLength(2);
    expect(events[0].wabaId).toBe("WABA_ID_1");
    expect(events[1].wabaId).toBe("WABA_ID_2");
  });

  it("normaliza change.field diferente de messages (ex: account_update)", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_123",
          changes: [
            {
              field: "account_update",
              value: {
                phone_number: "5511999999999",
                event: "VERIFIED_ACCOUNT",
              },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(payload);

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("account_update");
    expect(events[0].payload.value).toEqual({
      phone_number: "5511999999999",
      event: "VERIFIED_ACCOUNT",
    });
  });

  it("normaliza mensagem do tipo reaction", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_123",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5511999999999", phone_number_id: "P1" },
                messages: [
                  {
                    id: "wamid.REACTION_1",
                    from: "5511888888888",
                    timestamp: "1677777777",
                    type: "reaction",
                    reaction: { message_id: "wamid.ORIGINAL", emoji: "\u{1F44D}" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(payload);

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("messages.reaction");
  });

  it("retorna array vazio para payload sem entries", () => {
    expect(normalizeWebhookPayload({ object: "whatsapp_business_account", entry: [] })).toEqual([]);
    expect(normalizeWebhookPayload({ object: "whatsapp_business_account" } as any)).toEqual([]);
  });

  it("retorna array vazio para change.field=messages sem messages nem statuses", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_123",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5511999999999", phone_number_id: "P1" },
                // Sem messages e sem statuses (ex: errors, contacts)
              },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(payload);
    expect(events).toEqual([]);
  });

  it("normaliza mensagens de tipos variados (audio, video, document, location, contacts, sticker)", () => {
    const types = ["audio", "video", "document", "location", "contacts", "sticker"];
    const messages = types.map((type, i) => ({
      id: `wamid.${type.toUpperCase()}_${i}`,
      from: "5511888888888",
      timestamp: String(1677777777 + i),
      type,
      [type]: { id: `${type}_data` },
    }));

    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID_123",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "5511999999999", phone_number_id: "P1" },
                messages,
              },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(payload);

    expect(events).toHaveLength(6);
    types.forEach((type, i) => {
      expect(events[i].eventType).toBe(`messages.${type}`);
    });
  });
});
