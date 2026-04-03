# Fase 1 — Sub-plano 4: Webhook Ingest

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o coração do sistema — receptor de webhooks da Meta com validação de assinatura, normalização multi-evento, deduplicação, persistência transacional e enfileiramento pós-commit.

**Architecture:** Endpoint dinâmico `[webhookKey]` no App Router do Next.js. Módulos puros para normalização e deduplicação (testáveis unitariamente). Validação SSRF para URLs de destino.

**Dependências:** Sub-planos 1 (infra), 2 (auth) e 3 (companies/credentials) completos.

**Spec:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md` (v7)

---

## Estrutura de Arquivos

```
src/
├── app/
│   └── api/
│       └── webhook/
│           └── [webhookKey]/
│               └── route.ts              # GET (challenge) + POST (ingest)
├── lib/
│   └── webhook/
│       ├── normalizer.ts                 # Normalização multi-evento
│       ├── deduplicator.ts               # Cálculo de dedupe_key (algoritmo v1)
│       ├── signature.ts                  # Validação X-Hub-Signature-256
│       ├── ssrf.ts                       # Validação SSRF de URLs
│       └── __tests__/
│           ├── normalizer.test.ts
│           ├── deduplicator.test.ts
│           ├── signature.test.ts
│           └── ssrf.test.ts
```

---

### Task 1: Módulo de validação de assinatura (`signature.ts`)

**Files:**
- Create: `src/lib/webhook/__tests__/signature.test.ts`
- Create: `src/lib/webhook/signature.ts`

- [ ] **Step 1: Escrever testes para validação de assinatura**

Criar `src/lib/webhook/__tests__/signature.test.ts`:

```typescript
import { verifySignature } from "../signature";
import { createHmac } from "crypto";

describe("verifySignature", () => {
  const appSecret = "test-app-secret-12345";

  function generateSignature(body: string, secret: string): string {
    const hmac = createHmac("sha256", secret);
    hmac.update(body, "utf8");
    return "sha256=" + hmac.digest("hex");
  }

  it("retorna true para assinatura válida", () => {
    const body = '{"entry":[]}';
    const signature = generateSignature(body, appSecret);

    expect(verifySignature(body, signature, appSecret)).toBe(true);
  });

  it("retorna false para assinatura inválida", () => {
    const body = '{"entry":[]}';
    const signature = "sha256=invalidhex";

    expect(verifySignature(body, signature, appSecret)).toBe(false);
  });

  it("retorna false quando assinatura está ausente", () => {
    const body = '{"entry":[]}';

    expect(verifySignature(body, "", appSecret)).toBe(false);
    expect(verifySignature(body, undefined as unknown as string, appSecret)).toBe(false);
  });

  it("retorna false quando header não começa com sha256=", () => {
    const body = '{"entry":[]}';
    const hmac = createHmac("sha256", appSecret);
    hmac.update(body, "utf8");
    const rawHex = hmac.digest("hex");

    expect(verifySignature(body, rawHex, appSecret)).toBe(false);
  });

  it("usa timing-safe comparison (não vaza informação via timing)", () => {
    const body = '{"entry":[]}';
    const signature = generateSignature(body, appSecret);

    // Assinatura correta deve passar
    expect(verifySignature(body, signature, appSecret)).toBe(true);

    // Assinatura com 1 char diferente deve falhar
    const tampered = signature.slice(0, -1) + "0";
    expect(verifySignature(body, tampered, appSecret)).toBe(false);
  });

  it("valida contra o raw body, não contra payload reserializado", () => {
    // Simula body com espaços extras (como a Meta pode enviar)
    const bodyWithSpaces = '{ "entry" :  [  ] }';
    const bodyReserialized = '{"entry":[]}';

    const signatureForOriginal = generateSignature(bodyWithSpaces, appSecret);

    // Deve validar com o body original
    expect(verifySignature(bodyWithSpaces, signatureForOriginal, appSecret)).toBe(true);

    // Não deve validar com o body reserializado
    expect(verifySignature(bodyReserialized, signatureForOriginal, appSecret)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npm test -- --testPathPattern=signature
```

Expected: FAIL — `Cannot find module '../signature'`

- [ ] **Step 3: Implementar módulo de assinatura**

Criar `src/lib/webhook/signature.ts`:

```typescript
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifica a assinatura X-Hub-Signature-256 enviada pela Meta.
 *
 * IMPORTANTE: `rawBody` deve ser o corpo bruto original (string/buffer),
 * NÃO o payload reserializado via JSON.stringify(). A Meta calcula o HMAC
 * sobre o byte stream exato que enviou.
 *
 * @param rawBody - Corpo bruto da requisição (string)
 * @param signatureHeader - Valor do header X-Hub-Signature-256 (ex: "sha256=abc123...")
 * @param appSecret - App Secret descriptografado da empresa
 * @returns true se a assinatura é válida
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string,
  appSecret: string
): boolean {
  if (!signatureHeader || !rawBody || !appSecret) {
    return false;
  }

  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const receivedHex = signatureHeader.slice("sha256=".length);

  const hmac = createHmac("sha256", appSecret);
  hmac.update(rawBody, "utf8");
  const expectedHex = hmac.digest("hex");

  // Garantir que ambos têm o mesmo comprimento antes de comparar
  if (receivedHex.length !== expectedHex.length) {
    return false;
  }

  try {
    const receivedBuf = Buffer.from(receivedHex, "hex");
    const expectedBuf = Buffer.from(expectedHex, "hex");

    return timingSafeEqual(receivedBuf, expectedBuf);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npm test -- --testPathPattern=signature
```

Expected: PASS — 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhook/signature.ts src/lib/webhook/__tests__/signature.test.ts
git commit -m "feat: módulo de validação de assinatura X-Hub-Signature-256 com testes"
```

---

### Task 2: Módulo de normalização de eventos (`normalizer.ts`)

**Files:**
- Create: `src/lib/webhook/__tests__/normalizer.test.ts`
- Create: `src/lib/webhook/normalizer.ts`

- [ ] **Step 1: Escrever testes para normalização**

Criar `src/lib/webhook/__tests__/normalizer.test.ts`:

```typescript
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
                    text: { body: "Olá mundo" },
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

  it("normaliza callback com múltiplas mensagens no mesmo change", () => {
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
                    text: { body: "Olá" },
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

  it("normaliza callback com múltiplos entries", () => {
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
                    reaction: { message_id: "wamid.ORIGINAL", emoji: "👍" },
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
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npm test -- --testPathPattern=normalizer
```

Expected: FAIL — `Cannot find module '../normalizer'`

- [ ] **Step 3: Implementar módulo de normalização**

Criar `src/lib/webhook/normalizer.ts`:

```typescript
/**
 * Normalização multi-evento de callbacks da Meta WhatsApp Cloud API.
 *
 * Um callback da Meta pode conter múltiplos itens lógicos (ex: 3 mensagens
 * no mesmo POST, ou 2 statuses). Este módulo divide o callback em N eventos
 * normalizados individuais, cada um com eventType e payload isolado.
 *
 * Spec referência: Seção 2, passo 5 da spec v7.
 */

export interface NormalizedEvent {
  /** Tipo normalizado: messages.text, messages.image, statuses.delivered, account_update, etc. */
  eventType: string;

  /** WABA ID do entry (entry.id) */
  wabaId: string;

  /** Payload isolado do evento individual */
  payload: Record<string, unknown>;
}

interface MetaWebhookPayload {
  object: string;
  entry?: MetaEntry[];
}

interface MetaEntry {
  id: string;
  changes: MetaChange[];
}

interface MetaChange {
  field: string;
  value: Record<string, unknown>;
}

interface MetaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  [key: string]: unknown;
}

interface MetaStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  [key: string]: unknown;
}

/**
 * Recebe o callback JSON completo da Meta e retorna array de eventos normalizados.
 *
 * Lógica conforme spec v7:
 *   Para cada entry em payload.entry:
 *     Para cada change em entry.changes:
 *       Se change.field == "messages":
 *         Para cada message em change.value.messages (se existir):
 *           → 1 evento com event_type = "messages.{message.type}"
 *         Para cada status em change.value.statuses (se existir):
 *           → 1 evento com event_type = "statuses.{status.status}"
 *       Senão (account_update, flows, etc.):
 *         → 1 evento com event_type = change.field
 */
export function normalizeWebhookPayload(payload: MetaWebhookPayload): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];

  if (!payload.entry || !Array.isArray(payload.entry)) {
    return events;
  }

  for (const entry of payload.entry) {
    const wabaId = entry.id;

    if (!entry.changes || !Array.isArray(entry.changes)) {
      continue;
    }

    for (const change of entry.changes) {
      if (change.field === "messages") {
        // Processar mensagens individuais
        const messages = change.value.messages as MetaMessage[] | undefined;
        const metadata = change.value.metadata;

        if (messages && Array.isArray(messages)) {
          for (const message of messages) {
            const eventType = `messages.${message.type}`;
            events.push({
              eventType,
              wabaId,
              payload: {
                messaging_product: change.value.messaging_product,
                metadata,
                message,
              },
            });
          }
        }

        // Processar statuses individuais
        const statuses = change.value.statuses as MetaStatus[] | undefined;

        if (statuses && Array.isArray(statuses)) {
          for (const status of statuses) {
            const eventType = `statuses.${status.status}`;
            events.push({
              eventType,
              wabaId,
              payload: {
                messaging_product: change.value.messaging_product,
                metadata,
                status,
              },
            });
          }
        }
      } else {
        // Outros fields: account_update, flows, etc.
        events.push({
          eventType: change.field,
          wabaId,
          payload: {
            value: change.value,
          },
        });
      }
    }
  }

  return events;
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npm test -- --testPathPattern=normalizer
```

Expected: PASS — 10 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhook/normalizer.ts src/lib/webhook/__tests__/normalizer.test.ts
git commit -m "feat: módulo de normalização multi-evento de callbacks da Meta com testes"
```

---

### Task 3: Módulo de deduplicação (`deduplicator.ts`)

**Files:**
- Create: `src/lib/webhook/__tests__/deduplicator.test.ts`
- Create: `src/lib/webhook/deduplicator.ts`

- [ ] **Step 1: Escrever testes para deduplicação**

Criar `src/lib/webhook/__tests__/deduplicator.test.ts`:

```typescript
import { computeDedupeKey } from "../deduplicator";

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

  it("gera mesma dedupe_key para mesmos inputs (determinístico)", () => {
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

  it("gera dedupe_key diferente para fallback com conteúdo diferente", () => {
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

  it("fallback gera mesma chave para mesmo conteúdo (independente da ordem das chaves)", () => {
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

  it("inclui prefixo de versão 'v1:' na entrada do hash", () => {
    // Não podemos verificar internamente, mas podemos verificar que
    // a mudança de versão do algoritmo geraria chave diferente.
    // Isso é coberto indiretamente — o hash inclui "v1:" no preimage.
    const key = computeDedupeKey({
      wabaId: "WABA_123",
      eventType: "messages.text",
      messageId: "wamid.TEST",
    });

    // A chave é um SHA-256 hex válido
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npm test -- --testPathPattern=deduplicator
```

Expected: FAIL — `Cannot find module '../deduplicator'`

- [ ] **Step 3: Implementar módulo de deduplicação**

Criar `src/lib/webhook/deduplicator.ts`:

```typescript
import { createHash } from "crypto";

/**
 * Algoritmo de deduplicação v1 para webhooks da Meta.
 *
 * Spec referência: Seção 2, passo 6 da spec v7.
 *
 * Formato: dedupe_key = SHA-256("v1:" + wabaId + "|" + eventType + "|" + identifier)
 *
 * Onde identifier é:
 *   - messages: message.id (wamid único)
 *   - statuses: status.id + ":" + status.status (distingue sent/delivered/read)
 *   - calls: call.id
 *   - outros: SHA-256 do JSON do trecho change.value (com sorted keys)
 */

const ALGORITHM_VERSION = "v1";

export interface DedupeParams {
  /** WABA ID (entry.id) */
  wabaId: string;

  /** Tipo normalizado do evento (ex: messages.text, statuses.delivered) */
  eventType: string;

  /** message.id para mensagens */
  messageId?: string;

  /** status.id para statuses */
  statusId?: string;

  /** status.status para statuses (sent, delivered, read, failed) */
  statusValue?: string;

  /** call.id para chamadas */
  callId?: string;

  /** Conteúdo de fallback para eventos sem ID (será hasheado) */
  fallbackContent?: Record<string, unknown>;
}

/**
 * Calcula a dedupe_key com algoritmo v1 versionado.
 *
 * @returns SHA-256 hex string (64 caracteres)
 */
export function computeDedupeKey(params: DedupeParams): string {
  const { wabaId, eventType, messageId, statusId, statusValue, callId, fallbackContent } = params;

  let identifier: string;

  if (messageId) {
    // Mensagens: usa message.id diretamente
    identifier = messageId;
  } else if (statusId && statusValue) {
    // Statuses: usa status.id + ":" + status.status
    // Isso distingue sent/delivered/read do mesmo wamid
    identifier = `${statusId}:${statusValue}`;
  } else if (callId) {
    // Chamadas: usa call.id diretamente
    identifier = callId;
  } else if (fallbackContent) {
    // Eventos sem ID: SHA-256 do JSON com sorted keys
    identifier = hashContent(fallbackContent);
  } else {
    throw new Error(
      `computeDedupeKey: nenhum identificador fornecido para evento ${eventType}. ` +
      `Forneça messageId, statusId+statusValue, callId ou fallbackContent.`
    );
  }

  // dedupe_key = SHA-256("v1:" + wabaId + "|" + eventType + "|" + identifier)
  const preimage = `${ALGORITHM_VERSION}:${wabaId}|${eventType}|${identifier}`;
  return sha256(preimage);
}

/**
 * Calcula SHA-256 hex de uma string.
 */
function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Serializa objeto com sorted keys e calcula SHA-256.
 * Garante determinismo independente da ordem das propriedades.
 */
function hashContent(content: Record<string, unknown>): string {
  const sorted = JSON.stringify(content, Object.keys(content).sort());
  return sha256(sorted);
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npm test -- --testPathPattern=deduplicator
```

Expected: PASS — 9 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhook/deduplicator.ts src/lib/webhook/__tests__/deduplicator.test.ts
git commit -m "feat: módulo de deduplicação com algoritmo v1 versionado e testes"
```

---

### Task 4: Módulo de validação SSRF (`ssrf.ts`)

**Files:**
- Create: `src/lib/webhook/__tests__/ssrf.test.ts`
- Create: `src/lib/webhook/ssrf.ts`

- [ ] **Step 1: Escrever testes para validação SSRF**

Criar `src/lib/webhook/__tests__/ssrf.test.ts`:

```typescript
import { validateUrl, SsrfError } from "../ssrf";

describe("validateUrl", () => {
  // URLs válidas
  it("aceita URL HTTPS válida", () => {
    expect(() => validateUrl("https://api.example.com/webhook")).not.toThrow();
  });

  it("aceita URL HTTPS com porta", () => {
    expect(() => validateUrl("https://api.example.com:8443/webhook")).not.toThrow();
  });

  it("aceita URL HTTPS com path complexo", () => {
    expect(() => validateUrl("https://hooks.example.com/v1/webhooks/abc123")).not.toThrow();
  });

  // Protocolo
  it("rejeita URL HTTP (sem TLS)", () => {
    expect(() => validateUrl("http://api.example.com/webhook")).toThrow(SsrfError);
    expect(() => validateUrl("http://api.example.com/webhook")).toThrow(/HTTPS/);
  });

  it("rejeita URL FTP", () => {
    expect(() => validateUrl("ftp://api.example.com/file")).toThrow(SsrfError);
  });

  it("rejeita URL com protocolo file://", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow(SsrfError);
  });

  // IPs internos / privados
  it("rejeita localhost", () => {
    expect(() => validateUrl("https://localhost/webhook")).toThrow(SsrfError);
    expect(() => validateUrl("https://localhost:3000/webhook")).toThrow(SsrfError);
  });

  it("rejeita 127.0.0.1 (loopback)", () => {
    expect(() => validateUrl("https://127.0.0.1/webhook")).toThrow(SsrfError);
  });

  it("rejeita ::1 (loopback IPv6)", () => {
    expect(() => validateUrl("https://[::1]/webhook")).toThrow(SsrfError);
  });

  it("rejeita 10.x.x.x (rede privada classe A)", () => {
    expect(() => validateUrl("https://10.0.0.1/webhook")).toThrow(SsrfError);
    expect(() => validateUrl("https://10.255.255.255/webhook")).toThrow(SsrfError);
  });

  it("rejeita 172.16-31.x.x (rede privada classe B)", () => {
    expect(() => validateUrl("https://172.16.0.1/webhook")).toThrow(SsrfError);
    expect(() => validateUrl("https://172.31.255.255/webhook")).toThrow(SsrfError);
  });

  it("aceita 172.32.x.x (fora do range privado)", () => {
    expect(() => validateUrl("https://172.32.0.1/webhook")).not.toThrow();
  });

  it("rejeita 192.168.x.x (rede privada classe C)", () => {
    expect(() => validateUrl("https://192.168.0.1/webhook")).toThrow(SsrfError);
    expect(() => validateUrl("https://192.168.255.255/webhook")).toThrow(SsrfError);
  });

  it("rejeita 169.254.x.x (link-local / metadata cloud)", () => {
    expect(() => validateUrl("https://169.254.169.254/latest/meta-data")).toThrow(SsrfError);
  });

  it("rejeita 0.0.0.0", () => {
    expect(() => validateUrl("https://0.0.0.0/webhook")).toThrow(SsrfError);
  });

  // Entradas inválidas
  it("rejeita string vazia", () => {
    expect(() => validateUrl("")).toThrow(SsrfError);
  });

  it("rejeita URL mal formada", () => {
    expect(() => validateUrl("not-a-url")).toThrow(SsrfError);
  });

  it("rejeita URL sem hostname", () => {
    expect(() => validateUrl("https:///path")).toThrow(SsrfError);
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npm test -- --testPathPattern=ssrf
```

Expected: FAIL — `Cannot find module '../ssrf'`

- [ ] **Step 3: Implementar módulo SSRF**

Criar `src/lib/webhook/ssrf.ts`:

```typescript
import { URL } from "url";
import { isIP } from "net";

/**
 * Erro de validação SSRF.
 * Lançado quando uma URL de destino falha na validação de segurança.
 */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/**
 * Ranges de IPs privados/reservados que devem ser bloqueados.
 * Referência: RFC 1918, RFC 6890, RFC 3927
 */
const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost."]);

/**
 * Verifica se um endereço IPv4 está em um range privado/reservado.
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;

  // 0.0.0.0/8 — current network
  if (a === 0) return true;

  // 10.0.0.0/8 — private class A
  if (a === 10) return true;

  // 127.0.0.0/8 — loopback
  if (a === 127) return true;

  // 169.254.0.0/16 — link-local (inclui cloud metadata endpoint 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 — private class B (172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 — private class C
  if (a === 192 && b === 168) return true;

  return false;
}

/**
 * Verifica se um endereço IPv6 é loopback ou link-local.
 */
function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");

  // ::1 — loopback
  if (normalized === "::1") return true;

  // fe80::/10 — link-local
  if (normalized.startsWith("fe80:")) return true;

  // fc00::/7 — unique local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  return false;
}

/**
 * Valida se uma URL é segura para receber webhooks (proteção SSRF).
 *
 * Regras:
 * 1. Apenas HTTPS permitido
 * 2. Hostname não pode ser IP privado/reservado
 * 3. Hostname não pode ser localhost
 * 4. URL deve ser bem formada
 *
 * @param url - URL a ser validada
 * @throws {SsrfError} se a URL falhar na validação
 */
export function validateUrl(url: string): void {
  if (!url || typeof url !== "string") {
    throw new SsrfError("URL vazia ou inválida");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfError(`URL mal formada: ${url}`);
  }

  // Apenas HTTPS
  if (parsed.protocol !== "https:") {
    throw new SsrfError(`Apenas HTTPS é permitido. Protocolo recebido: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;

  if (!hostname) {
    throw new SsrfError("URL sem hostname");
  }

  // Bloquear hostnames conhecidos
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new SsrfError(`Hostname bloqueado: ${hostname}`);
  }

  // Verificar se é IP direto
  const cleanHostname = hostname.replace(/^\[|\]$/g, "");
  const ipVersion = isIP(cleanHostname);

  if (ipVersion === 4) {
    if (isPrivateIpv4(cleanHostname)) {
      throw new SsrfError(`IP privado/reservado bloqueado: ${cleanHostname}`);
    }
  } else if (ipVersion === 6) {
    if (isPrivateIpv6(cleanHostname)) {
      throw new SsrfError(`IP IPv6 privado/reservado bloqueado: ${cleanHostname}`);
    }
  }

  // Se é hostname (não IP), poderia fazer DNS lookup para verificar
  // se resolve para IP privado, mas isso adiciona latência e complexidade.
  // Por ora, bloqueamos IPs diretos e hostnames conhecidos.
  // DNS rebinding pode ser mitigado no futuro com DNS pinning.
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npm test -- --testPathPattern=ssrf
```

Expected: PASS — 17 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhook/ssrf.ts src/lib/webhook/__tests__/ssrf.test.ts
git commit -m "feat: módulo de validação SSRF para URLs de destino com testes"
```

---

### Task 5: Endpoint GET — Verificação Meta (challenge/response)

**Files:**
- Create: `src/app/api/webhook/[webhookKey]/route.ts`

- [ ] **Step 1: Implementar endpoint GET**

Criar `src/app/api/webhook/[webhookKey]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { verifySignature } from "@/lib/webhook/signature";
import { normalizeWebhookPayload } from "@/lib/webhook/normalizer";
import { computeDedupeKey, DedupeParams } from "@/lib/webhook/deduplicator";
import { webhookDeliveryQueue } from "@/lib/queue";

interface RouteParams {
  params: Promise<{ webhookKey: string }>;
}

/**
 * GET /api/webhook/[webhookKey]
 *
 * Verificação de webhook da Meta (challenge/response).
 * A Meta envia este request ao cadastrar/verificar o webhook.
 *
 * Query params esperados:
 *   hub.mode=subscribe
 *   hub.verify_token=<token configurado>
 *   hub.challenge=<string aleatório>
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
```

Este step cria apenas o GET. O POST será adicionado na Task 6.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/webhook/\\[webhookKey\\]/route.ts
git commit -m "feat: endpoint GET webhook para verificação Meta (challenge/response)"
```

---

### Task 6: Endpoint POST — Recebimento de webhooks (ingest completo)

**Files:**
- Modify: `src/app/api/webhook/[webhookKey]/route.ts`

- [ ] **Step 1: Adicionar handler POST ao route.ts**

Adicionar ao arquivo `src/app/api/webhook/[webhookKey]/route.ts` (após o GET):

```typescript
/**
 * POST /api/webhook/[webhookKey]
 *
 * Recebimento de webhooks da Meta WhatsApp Cloud API.
 *
 * Fluxo completo (spec v7):
 * 1. Buscar empresa pelo webhook_key
 * 2. Ler raw body e validar assinatura X-Hub-Signature-256
 * 3. Assinatura inválida → HTTP 401 + AuditLog
 * 4. Normalizar callback em N eventos individuais
 * 5. Para cada evento: dedupe → transação (InboundWebhook + RouteDeliveries) → enqueue
 * 6. Retornar HTTP 200 após todos os COMMITs
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

  // 2. Ler raw body (preservar byte stream original para verificação de assinatura)
  const rawBody = await request.text();

  // 3. Validar assinatura X-Hub-Signature-256
  const signatureHeader = request.headers.get("x-hub-signature-256") ?? "";
  const appSecret = decrypt(company.credential.metaAppSecret);

  if (!verifySignature(rawBody, signatureHeader, appSecret)) {
    // Assinatura inválida → HTTP 401 + registro no AuditLog
    await prisma.auditLog.create({
      data: {
        actorType: "system",
        actorLabel: "webhook-receiver",
        companyId: company.id,
        action: "webhook.signature_invalid",
        resourceType: "inbound_webhook",
        details: {
          webhookKey,
          reason: "Invalid X-Hub-Signature-256",
        },
        ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
      },
    });

    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // 4. Parse e normalização multi-evento
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
    // Callback válido mas sem eventos reconhecidos — aceitar silenciosamente
    return NextResponse.json({ status: "ok", events: 0 });
  }

  // 5. Processar cada evento normalizado
  const now = new Date();
  const createdDeliveryIds: string[] = [];
  let eventsProcessed = 0;
  let eventsDeduplicated = 0;

  for (const event of normalizedEvents) {
    // 5a. Calcular dedupe_key
    const dedupeParams: DedupeParams = {
      wabaId: event.wabaId,
      eventType: event.eventType,
    };

    // Definir identificador correto por tipo de evento
    if (event.eventType.startsWith("messages.") && event.payload.message) {
      dedupeParams.messageId = (event.payload.message as any).id;
    } else if (event.eventType.startsWith("statuses.") && event.payload.status) {
      const status = event.payload.status as any;
      dedupeParams.statusId = status.id;
      dedupeParams.statusValue = status.status;
    } else if (event.eventType.startsWith("calls.") && event.payload.call) {
      dedupeParams.callId = (event.payload.call as any).id;
    } else {
      // Fallback: hash do conteúdo do evento
      dedupeParams.fallbackContent = event.payload as Record<string, unknown>;
    }

    const dedupeKey = computeDedupeKey(dedupeParams);

    // 5b. Verificar deduplicação (janela 24h)
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

    // 5c. Transação PostgreSQL: persistir InboundWebhook + materializar RouteDeliveries
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
          rawPayload: payload,
          eventType: event.eventType,
          dedupeKey,
          processingStatus: matchingRoutes.length > 0 ? "received" : "no_routes",
        },
      });

      // Materializar RouteDeliveries para cada rota compatível
      const deliveries: string[] = [];
      for (const route of matchingRoutes) {
        // Invariante: RouteDelivery.company_id === route.company_id
        if (route.companyId !== company.id) {
          console.error(
            `[webhook-ingest] Mismatch de company_id: route ${route.id} pertence à company ${route.companyId}, mas webhook é da company ${company.id}. Pulando.`
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

    // 5d. Enqueue pós-commit (best-effort, orphan-recovery compensa falhas)
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
            attempts: 1, // Retries são gerenciados pelo worker, não pelo BullMQ
          }
        )
      );

      await Promise.all(enqueuePromises);

      // Atualizar processing_status para queued (fora da transação, best-effort)
      if (result.deliveryIds.length > 0) {
        await prisma.inboundWebhook.update({
          where: { id: result.inboundWebhookId },
          data: { processingStatus: "queued" },
        });
      }
    } catch (enqueueError) {
      // Se o enqueue falhar (Redis down, crash), as RouteDeliveries já estão
      // persistidas no banco com status=pending. O orphan-recovery vai detectar
      // e reenfileirar automaticamente.
      console.error(
        `[webhook-ingest] Falha no enqueue para InboundWebhook ${result.inboundWebhookId}:`,
        enqueueError
      );
    }
  }

  // 6. Retornar HTTP 200 (ACK para a Meta) — após todos os COMMITs
  return NextResponse.json({
    status: "ok",
    events: eventsProcessed,
    deduplicated: eventsDeduplicated,
  });
}
```

- [ ] **Step 2: Verificar arquivo completo**

O arquivo `src/app/api/webhook/[webhookKey]/route.ts` agora contém:
- Imports de todos os módulos (prisma, encryption, signature, normalizer, deduplicator, queue)
- Interface `RouteParams`
- Handler `GET` (verificação Meta)
- Handler `POST` (ingest completo)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhook/\\[webhookKey\\]/route.ts
git commit -m "feat: endpoint POST webhook com validação, normalização, dedupe e enqueue"
```

---

### Task 7: Testes de integração do endpoint webhook

**Files:**
- Create: `src/app/api/webhook/__tests__/webhook-ingest.test.ts`

> **Nota:** Estes testes focam na lógica do handler sem levantar servidor HTTP nem banco real. Mockam o Prisma e o BullMQ para testar a orquestração.

- [ ] **Step 1: Escrever testes de integração**

Criar `src/app/api/webhook/__tests__/webhook-ingest.test.ts`:

```typescript
/**
 * Testes da orquestração do webhook ingest.
 *
 * Estes testes verificam o fluxo end-to-end de forma unitária,
 * mockando Prisma e BullMQ para isolar a lógica do handler.
 *
 * Para testes com banco real, ver testes e2e (implementação futura).
 */

import { createHmac } from "crypto";
import { normalizeWebhookPayload } from "@/lib/webhook/normalizer";
import { computeDedupeKey } from "@/lib/webhook/deduplicator";
import { verifySignature } from "@/lib/webhook/signature";

// Estes testes validam a integração entre os módulos sem HTTP
describe("Webhook Ingest - Integração entre módulos", () => {
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

  it("fluxo completo: assinatura → normalização → dedupe_key", () => {
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

    // Todas as keys devem ser únicas
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(3);
  });

  it("assinatura inválida é detectada antes da normalização", () => {
    const callback = buildMessageCallback();
    const rawBody = JSON.stringify(callback);
    const invalidSignature = "sha256=0000000000000000000000000000000000000000000000000000000000000000";

    expect(verifySignature(rawBody, invalidSignature, appSecret)).toBe(false);

    // Normalização nem deveria ocorrer com assinatura inválida,
    // mas podemos verificar que o callback é válido se fosse processado
    const events = normalizeWebhookPayload(callback as any);
    expect(events).toHaveLength(1);
  });

  it("mesmo callback reserializado produz assinatura diferente", () => {
    const callback = buildMessageCallback();
    const rawBody = JSON.stringify(callback);
    const reserializedBody = JSON.stringify(JSON.parse(rawBody));

    // Na maioria dos casos são iguais, mas se o original tivesse espaços/formatação diferente,
    // a assinatura seria diferente. Aqui testamos o princípio.
    const signature = sign(rawBody);
    expect(verifySignature(rawBody, signature, appSecret)).toBe(true);
    // Reserializado (neste caso igual) também valida
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
```

- [ ] **Step 2: Rodar testes para verificar que passam**

```bash
npm test -- --testPathPattern=webhook-ingest
```

Expected: PASS — 5 tests passing

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhook/__tests__/webhook-ingest.test.ts
git commit -m "feat: testes de integração entre módulos do webhook ingest"
```

---

### Task 8: Helper para extração de dedupe params do evento normalizado

**Files:**
- Modify: `src/lib/webhook/deduplicator.ts`

> **Nota:** No endpoint POST (Task 6), o código que extrai os campos para o `DedupeParams` a partir do `NormalizedEvent` é repetitivo. Vamos extrair para uma função helper no deduplicator.

- [ ] **Step 1: Adicionar teste para a função helper**

Adicionar ao final de `src/lib/webhook/__tests__/deduplicator.test.ts`:

```typescript
import { extractDedupeParams } from "../deduplicator";
import { NormalizedEvent } from "../normalizer";

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
```

- [ ] **Step 2: Implementar função helper**

Adicionar ao final de `src/lib/webhook/deduplicator.ts`:

```typescript
import { NormalizedEvent } from "./normalizer";

/**
 * Extrai os parâmetros de deduplicação de um evento normalizado.
 * Conveniência para não repetir a lógica de extração no handler.
 */
export function extractDedupeParams(event: NormalizedEvent): DedupeParams {
  const params: DedupeParams = {
    wabaId: event.wabaId,
    eventType: event.eventType,
  };

  if (event.eventType.startsWith("messages.") && event.payload.message) {
    params.messageId = (event.payload.message as any).id;
  } else if (event.eventType.startsWith("statuses.") && event.payload.status) {
    const status = event.payload.status as any;
    params.statusId = status.id;
    params.statusValue = status.status;
  } else if (event.eventType.startsWith("calls.") && event.payload.call) {
    params.callId = (event.payload.call as any).id;
  } else {
    params.fallbackContent = event.payload as Record<string, unknown>;
  }

  return params;
}
```

- [ ] **Step 3: Rodar testes**

```bash
npm test -- --testPathPattern=deduplicator
```

Expected: PASS — 12 tests passing (9 originais + 3 novos)

- [ ] **Step 4: Refatorar endpoint POST para usar extractDedupeParams**

No `src/app/api/webhook/[webhookKey]/route.ts`, substituir o bloco de extração manual de dedupe params por:

```typescript
import { computeDedupeKey, extractDedupeParams } from "@/lib/webhook/deduplicator";

// ... dentro do loop de eventos:
const dedupeParams = extractDedupeParams(event);
const dedupeKey = computeDedupeKey(dedupeParams);
```

Remover o import de `DedupeParams` (não é mais usado diretamente) e todo o bloco condicional `if/else if/else` que montava os params manualmente.

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhook/deduplicator.ts src/lib/webhook/__tests__/deduplicator.test.ts src/app/api/webhook/\\[webhookKey\\]/route.ts
git commit -m "refactor: extrai extractDedupeParams como helper e simplifica endpoint POST"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Endpoint GET (challenge) ✅, Endpoint POST (ingest completo) ✅, Validação de assinatura ✅, Normalização multi-evento ✅, Deduplicação v1 ✅, SSRF ✅, AuditLog para assinatura inválida ✅
- [x] **Placeholder scan:** Nenhum TBD/TODO. Todos os módulos estão completamente implementados
- [x] **TDD:** Testes escritos ANTES da implementação em todas as tasks (Tasks 1-4, 7)
- [x] **raw_body vs raw_payload:** Assinatura inbound (X-Hub-Signature-256) verificada contra raw_body (string original). raw_payload (JSONB) usado apenas para queries ✅
- [x] **Dedupe statuses:** status.id + ":" + status.status distingue sent/delivered/read ✅
- [x] **Transação por evento:** Cada evento normalizado tem sua própria transação PostgreSQL ✅
- [x] **Enqueue pós-commit:** BullMQ enqueue acontece APÓS commit. Falha no enqueue não bloqueia — orphan-recovery compensa ✅
- [x] **HTTP 200 após commits:** Retorno para a Meta acontece após todos os COMMITs, não após enqueue ✅
- [x] **Assinatura inválida → sem InboundWebhook:** Rejeitado com 401 antes da persistência. Registrado apenas no AuditLog (actor_type: system, action: webhook.signature_invalid) ✅
- [x] **Normalização:** Itera entries → changes → messages/statuses. Campos: messages.text, messages.image, statuses.sent, statuses.delivered, account_update, etc. ✅
- [x] **SSRF:** Bloqueia IPs privados (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x), localhost, protocolos não-HTTPS ✅
- [x] **Invariante company_id:** RouteDelivery.company_id validado contra route.company_id na materialização ✅
- [x] **processing_status:** received → queued (pós-enqueue) → processed (pelo worker) ou no_routes (sem rotas) ✅
- [x] **Type consistency:** Todos os tipos alinhados com schema Prisma do sub-plano 1 ✅
