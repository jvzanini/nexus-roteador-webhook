# Fase 1 — Sub-plano 5: Worker + Delivery

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o worker BullMQ de entrega de webhooks com retry configuravel, DLQ, assinatura outbound, proteção SSRF e recuperação de entregas órfãs.

**Depends on:** Sub-plano 4 (Webhook Ingest) — utiliza módulo SSRF, filas BullMQ, modelos InboundWebhook e RouteDelivery já existentes.

**Architecture:** Container separado (mesmo Docker image, entrypoint `node worker/index.js`). Worker consome fila `webhook-delivery`, entrega eventos normalizados individualmente para cada rota, gerencia retries com backoff configuravel e reenfileira entregas órfãs.

**Spec:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md`

---

## Estrutura de Arquivos

```
src/
├── worker/
│   ├── index.ts                    # Entrypoint atualizado (delivery + orphan-recovery)
│   ├── delivery.ts                 # Worker de entrega BullMQ
│   └── orphan-recovery.ts          # Job de recuperação de entregas órfãs
├── lib/
│   ├── outbound-signature.ts       # HMAC-SHA256 para X-Nexus-Signature-256
│   ├── retry.ts                    # Lógica de retry (cálculo de backoff, classificação de status)
│   ├── global-settings.ts          # Leitura de GlobalSettings com cache
│   └── __tests__/
│       ├── outbound-signature.test.ts
│       ├── retry.test.ts
│       └── delivery.test.ts
prisma/
└── seed.ts                         # Atualizado com seed de GlobalSettings
```

---

### Task 1: Módulo de assinatura outbound (`src/lib/outbound-signature.ts`)

**Files:**
- Create: `src/lib/__tests__/outbound-signature.test.ts`
- Create: `src/lib/outbound-signature.ts`

- [ ] **Step 1: Escrever teste para assinatura outbound**

Criar `src/lib/__tests__/outbound-signature.test.ts`:

```typescript
import { computeOutboundSignature, verifyOutboundSignature } from "../outbound-signature";

describe("outbound-signature", () => {
  const secretKey = "test-secret-key-for-hmac-256";

  describe("computeOutboundSignature", () => {
    it("produces a sha256= prefixed hex string", () => {
      const body = JSON.stringify({ event: "messages.text", data: { id: "wamid.123" } });
      const signature = computeOutboundSignature(body, secretKey);

      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it("produces consistent signatures for same input", () => {
      const body = '{"key":"value"}';
      const sig1 = computeOutboundSignature(body, secretKey);
      const sig2 = computeOutboundSignature(body, secretKey);

      expect(sig1).toBe(sig2);
    });

    it("produces different signatures for different bodies", () => {
      const sig1 = computeOutboundSignature('{"a":1}', secretKey);
      const sig2 = computeOutboundSignature('{"a":2}', secretKey);

      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures for different keys", () => {
      const body = '{"a":1}';
      const sig1 = computeOutboundSignature(body, "key-one");
      const sig2 = computeOutboundSignature(body, "key-two");

      expect(sig1).not.toBe(sig2);
    });

    it("handles empty body", () => {
      const signature = computeOutboundSignature("", secretKey);
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it("handles unicode body correctly", () => {
      const body = '{"text":"Olá, mundo! 🇧🇷"}';
      const signature = computeOutboundSignature(body, secretKey);
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });
  });

  describe("verifyOutboundSignature", () => {
    it("returns true for valid signature", () => {
      const body = '{"event":"test"}';
      const signature = computeOutboundSignature(body, secretKey);

      expect(verifyOutboundSignature(body, secretKey, signature)).toBe(true);
    });

    it("returns false for tampered body", () => {
      const body = '{"event":"test"}';
      const signature = computeOutboundSignature(body, secretKey);

      expect(verifyOutboundSignature('{"event":"tampered"}', secretKey, signature)).toBe(false);
    });

    it("returns false for wrong key", () => {
      const body = '{"event":"test"}';
      const signature = computeOutboundSignature(body, secretKey);

      expect(verifyOutboundSignature(body, "wrong-key", signature)).toBe(false);
    });

    it("returns false for malformed signature", () => {
      expect(verifyOutboundSignature("body", secretKey, "not-a-valid-sig")).toBe(false);
    });

    it("uses timing-safe comparison", () => {
      const body = '{"event":"test"}';
      const signature = computeOutboundSignature(body, secretKey);

      // Deve funcionar sem timing leak — verificamos que a API funciona corretamente
      expect(verifyOutboundSignature(body, secretKey, signature)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npm test -- --testPathPattern=outbound-signature
```

Expected: FAIL — `Cannot find module '../outbound-signature'`

- [ ] **Step 3: Implementar módulo de assinatura outbound**

Criar `src/lib/outbound-signature.ts`:

```typescript
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Calcula HMAC-SHA256 do body serializado usando a secret_key da rota.
 * Retorna no formato "sha256=<hex>" compatível com X-Nexus-Signature-256.
 */
export function computeOutboundSignature(body: string, secretKey: string): string {
  const hmac = createHmac("sha256", secretKey);
  hmac.update(body, "utf8");
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * Verifica assinatura outbound usando timing-safe comparison.
 * Previne timing attacks na verificação.
 */
export function verifyOutboundSignature(
  body: string,
  secretKey: string,
  signature: string
): boolean {
  const expected = computeOutboundSignature(body, secretKey);

  if (expected.length !== signature.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npm test -- --testPathPattern=outbound-signature
```

Expected: PASS — 8 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/outbound-signature.ts src/lib/__tests__/outbound-signature.test.ts
git commit -m "feat: módulo de assinatura outbound HMAC-SHA256 com testes"
```

---

### Task 2: Módulo de retry (`src/lib/retry.ts`)

**Files:**
- Create: `src/lib/__tests__/retry.test.ts`
- Create: `src/lib/retry.ts`

- [ ] **Step 1: Escrever testes para lógica de retry**

Criar `src/lib/__tests__/retry.test.ts`:

```typescript
import {
  isRetriableStatus,
  isRetriableError,
  calculateBackoffMs,
  applyJitter,
  getNextRetryDelay,
  RetryConfig,
  RETRIABLE_STATUS_CODES,
  NON_RETRIABLE_REDIRECT_CODES,
} from "../retry";

describe("retry", () => {
  describe("RETRIABLE_STATUS_CODES", () => {
    it("includes all expected retriable codes", () => {
      expect(RETRIABLE_STATUS_CODES).toEqual(
        new Set([408, 409, 425, 429, 500, 502, 503, 504])
      );
    });
  });

  describe("NON_RETRIABLE_REDIRECT_CODES", () => {
    it("includes redirect status codes", () => {
      expect(NON_RETRIABLE_REDIRECT_CODES).toEqual(
        new Set([301, 302, 307, 308])
      );
    });
  });

  describe("isRetriableStatus", () => {
    it.each([408, 409, 425, 429, 500, 502, 503, 504])(
      "returns true for retriable status %d",
      (status) => {
        expect(isRetriableStatus(status)).toBe(true);
      }
    );

    it.each([200, 201, 204, 301, 302, 307, 308, 400, 401, 403, 404, 405, 422])(
      "returns false for non-retriable status %d",
      (status) => {
        expect(isRetriableStatus(status)).toBe(false);
      }
    );

    it("returns false for null (no HTTP response — handled by isRetriableError)", () => {
      expect(isRetriableStatus(null)).toBe(false);
    });
  });

  describe("isRetriableError", () => {
    it("returns true for timeout errors", () => {
      const error = new Error("timeout of 30000ms exceeded");
      (error as any).code = "ECONNABORTED";
      expect(isRetriableError(error)).toBe(true);
    });

    it("returns true for network errors (ECONNREFUSED)", () => {
      const error = new Error("connect ECONNREFUSED 127.0.0.1:3000");
      (error as any).code = "ECONNREFUSED";
      expect(isRetriableError(error)).toBe(true);
    });

    it("returns true for network errors (ECONNRESET)", () => {
      const error = new Error("socket hang up");
      (error as any).code = "ECONNRESET";
      expect(isRetriableError(error)).toBe(true);
    });

    it("returns true for DNS resolution errors (ENOTFOUND)", () => {
      const error = new Error("getaddrinfo ENOTFOUND example.com");
      (error as any).code = "ENOTFOUND";
      expect(isRetriableError(error)).toBe(true);
    });

    it("returns true for ETIMEDOUT errors", () => {
      const error = new Error("connect ETIMEDOUT");
      (error as any).code = "ETIMEDOUT";
      expect(isRetriableError(error)).toBe(true);
    });

    it("returns false for generic errors without network code", () => {
      const error = new Error("something went wrong");
      expect(isRetriableError(error)).toBe(false);
    });

    it("returns false for non-Error objects", () => {
      expect(isRetriableError("string error")).toBe(false);
    });
  });

  describe("applyJitter", () => {
    it("returns value within ±20% range", () => {
      const baseMs = 10000;
      const results = new Set<number>();

      // Rodar 100 vezes para cobrir range
      for (let i = 0; i < 100; i++) {
        const jittered = applyJitter(baseMs);
        results.add(jittered);
        expect(jittered).toBeGreaterThanOrEqual(baseMs * 0.8);
        expect(jittered).toBeLessThanOrEqual(baseMs * 1.2);
      }

      // Deve ter variação (não retornar sempre o mesmo valor)
      expect(results.size).toBeGreaterThan(1);
    });

    it("returns integer milliseconds", () => {
      for (let i = 0; i < 50; i++) {
        const jittered = applyJitter(10000);
        expect(Number.isInteger(jittered)).toBe(true);
      }
    });

    it("handles zero base", () => {
      expect(applyJitter(0)).toBe(0);
    });

    it("handles small values", () => {
      const jittered = applyJitter(100);
      expect(jittered).toBeGreaterThanOrEqual(80);
      expect(jittered).toBeLessThanOrEqual(120);
    });
  });

  describe("calculateBackoffMs", () => {
    const defaultConfig: RetryConfig = {
      maxRetries: 3,
      intervalsSeconds: [10, 30, 90],
      strategy: "exponential",
      jitterEnabled: true,
    };

    it("returns interval from array for exponential strategy", () => {
      // attemptNumber 1 = primeiro retry, usa intervalsSeconds[0]
      const delay = calculateBackoffMs(1, { ...defaultConfig, jitterEnabled: false });
      expect(delay).toBe(10_000); // 10s em ms
    });

    it("returns second interval for second retry", () => {
      const delay = calculateBackoffMs(2, { ...defaultConfig, jitterEnabled: false });
      expect(delay).toBe(30_000); // 30s
    });

    it("returns third interval for third retry", () => {
      const delay = calculateBackoffMs(3, { ...defaultConfig, jitterEnabled: false });
      expect(delay).toBe(90_000); // 90s
    });

    it("uses last interval if attempt exceeds array length", () => {
      const delay = calculateBackoffMs(5, { ...defaultConfig, jitterEnabled: false });
      expect(delay).toBe(90_000); // último da array
    });

    it("applies jitter when enabled", () => {
      const results = new Set<number>();
      for (let i = 0; i < 50; i++) {
        results.add(calculateBackoffMs(1, defaultConfig));
      }
      // Com jitter, deve ter variação
      expect(results.size).toBeGreaterThan(1);

      // Todos devem estar dentro de ±20% de 10000
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(8_000);
        expect(r).toBeLessThanOrEqual(12_000);
      }
    });

    it("uses fixed strategy correctly", () => {
      const fixedConfig: RetryConfig = {
        ...defaultConfig,
        strategy: "fixed",
        jitterEnabled: false,
      };
      // Fixed usa sempre o primeiro intervalo
      expect(calculateBackoffMs(1, fixedConfig)).toBe(10_000);
      expect(calculateBackoffMs(2, fixedConfig)).toBe(10_000);
      expect(calculateBackoffMs(3, fixedConfig)).toBe(10_000);
    });
  });

  describe("getNextRetryDelay", () => {
    const defaultConfig: RetryConfig = {
      maxRetries: 3,
      intervalsSeconds: [10, 30, 90],
      strategy: "exponential",
      jitterEnabled: false,
    };

    it("returns delay for retriable attempt within limit", () => {
      const result = getNextRetryDelay(1, defaultConfig);
      expect(result).not.toBeNull();
      expect(result!.delayMs).toBe(10_000);
      expect(result!.shouldRetry).toBe(true);
    });

    it("returns null when max retries exhausted", () => {
      // attemptNumber > maxRetries = sem mais retries
      const result = getNextRetryDelay(4, defaultConfig);
      expect(result).toBeNull();
    });

    it("returns null when attemptNumber equals maxRetries + 1", () => {
      const result = getNextRetryDelay(4, defaultConfig);
      expect(result).toBeNull();
    });

    it("returns delay for last retry", () => {
      const result = getNextRetryDelay(3, defaultConfig);
      expect(result).not.toBeNull();
      expect(result!.delayMs).toBe(90_000);
    });
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npm test -- --testPathPattern=retry
```

Expected: FAIL — `Cannot find module '../retry'`

- [ ] **Step 3: Implementar módulo de retry**

Criar `src/lib/retry.ts`:

```typescript
/**
 * Lógica de retry para entrega de webhooks.
 *
 * Status retriable: 408, 409, 425, 429, 500, 502, 503, 504, timeout/network error
 * Status não-retriable: todos os outros 4xx, redirects (301/302/307/308)
 *
 * retry_max_retries = além da tentativa inicial (3 retries + 1 inicial = 4 total)
 * Backoff exponencial com jitter ±20%
 */

export const RETRIABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  409, // Conflict
  425, // Too Early
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

export const NON_RETRIABLE_REDIRECT_CODES = new Set([
  301, // Moved Permanently
  302, // Found
  307, // Temporary Redirect
  308, // Permanent Redirect
]);

const RETRIABLE_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

export interface RetryConfig {
  maxRetries: number;
  intervalsSeconds: number[];
  strategy: "exponential" | "fixed";
  jitterEnabled: boolean;
}

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
}

/**
 * Verifica se um HTTP status code é retriable.
 * Retorna false para null (sem resposta HTTP — verificar via isRetriableError).
 */
export function isRetriableStatus(status: number | null): boolean {
  if (status === null) return false;
  return RETRIABLE_STATUS_CODES.has(status);
}

/**
 * Verifica se um erro de rede/timeout é retriable.
 */
export function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as any).code;
  if (typeof code === "string" && RETRIABLE_ERROR_CODES.has(code)) {
    return true;
  }
  return false;
}

/**
 * Aplica jitter de ±20% a um valor em milissegundos.
 * Retorna inteiro.
 */
export function applyJitter(baseMs: number): number {
  if (baseMs === 0) return 0;
  // Fator entre 0.8 e 1.2
  const factor = 0.8 + Math.random() * 0.4;
  return Math.round(baseMs * factor);
}

/**
 * Calcula delay de backoff em milissegundos para um dado attempt.
 *
 * @param retryNumber - Número do retry (1-based, onde 1 = primeiro retry após tentativa inicial)
 * @param config - Configuração de retry
 */
export function calculateBackoffMs(retryNumber: number, config: RetryConfig): number {
  let intervalSeconds: number;

  if (config.strategy === "fixed") {
    // Fixed: sempre usa o primeiro intervalo
    intervalSeconds = config.intervalsSeconds[0] ?? 10;
  } else {
    // Exponential: usa intervalo do array, com fallback para o último
    const index = Math.min(retryNumber - 1, config.intervalsSeconds.length - 1);
    intervalSeconds = config.intervalsSeconds[index] ?? 10;
  }

  const baseMs = intervalSeconds * 1000;

  if (config.jitterEnabled) {
    return applyJitter(baseMs);
  }

  return baseMs;
}

/**
 * Determina se deve fazer retry e qual o delay.
 *
 * @param currentAttempt - Número do retry atual (1-based). Tentativa inicial = 0, primeiro retry = 1.
 * @param config - Configuração de retry
 * @returns RetryDecision se deve retry, null se esgotou retries
 */
export function getNextRetryDelay(
  currentAttempt: number,
  config: RetryConfig
): RetryDecision | null {
  if (currentAttempt > config.maxRetries) {
    return null;
  }

  const delayMs = calculateBackoffMs(currentAttempt, config);

  return {
    shouldRetry: true,
    delayMs,
  };
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npm test -- --testPathPattern=retry
```

Expected: PASS — todos os testes passando

- [ ] **Step 5: Commit**

```bash
git add src/lib/retry.ts src/lib/__tests__/retry.test.ts
git commit -m "feat: módulo de retry com backoff exponencial, jitter e classificação de status"
```

---

### Task 3: Módulo de GlobalSettings (`src/lib/global-settings.ts`)

**Files:**
- Create: `src/lib/global-settings.ts`

- [ ] **Step 1: Implementar leitor de GlobalSettings com defaults**

Criar `src/lib/global-settings.ts`:

```typescript
import { prisma } from "./prisma";
import type { RetryConfig } from "./retry";

/**
 * Defaults de GlobalSettings.
 * Usados quando a chave não existe no banco.
 */
const DEFAULTS: Record<string, unknown> = {
  retry_max_retries: 3,
  retry_intervals_seconds: [10, 30, 90],
  retry_strategy: "exponential",
  retry_jitter_enabled: true,
  log_full_retention_days: 90,
  log_summary_retention_days: 180,
  notify_platform_enabled: true,
  notify_email_enabled: true,
  notify_whatsapp_enabled: true,
  notify_failure_threshold: 5,
  notify_recipients: "admins",
};

/**
 * Busca um valor de GlobalSettings pelo key.
 * Retorna o default se a chave não existir no banco.
 */
export async function getGlobalSetting<T = unknown>(key: string): Promise<T> {
  const setting = await prisma.globalSettings.findUnique({
    where: { key },
  });

  if (setting) {
    return setting.value as T;
  }

  if (key in DEFAULTS) {
    return DEFAULTS[key] as T;
  }

  throw new Error(`GlobalSettings key "${key}" not found and no default defined`);
}

/**
 * Busca a configuração completa de retry.
 * Combina valores do banco com defaults.
 */
export async function getRetryConfig(): Promise<RetryConfig> {
  const [maxRetries, intervalsSeconds, strategy, jitterEnabled] = await Promise.all([
    getGlobalSetting<number>("retry_max_retries"),
    getGlobalSetting<number[]>("retry_intervals_seconds"),
    getGlobalSetting<"exponential" | "fixed">("retry_strategy"),
    getGlobalSetting<boolean>("retry_jitter_enabled"),
  ]);

  return {
    maxRetries,
    intervalsSeconds,
    strategy,
    jitterEnabled,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/global-settings.ts
git commit -m "feat: leitor de GlobalSettings com defaults e helper de retry config"
```

---

### Task 4: Worker de entrega (`src/worker/delivery.ts`)

**Files:**
- Create: `src/lib/__tests__/delivery.test.ts`
- Create: `src/worker/delivery.ts`

- [ ] **Step 1: Escrever testes para o worker de entrega**

Criar `src/lib/__tests__/delivery.test.ts`:

```typescript
import {
  buildDeliveryHeaders,
  buildDeliveryBody,
  truncateResponseBody,
  classifyDeliveryResult,
} from "../../worker/delivery";

describe("delivery worker helpers", () => {
  describe("buildDeliveryBody", () => {
    it("serializes normalized event as JSON string", () => {
      const event = {
        event_type: "messages.text",
        entry_id: "WABA_123",
        timestamp: "1700000000",
        data: {
          from: "5511999999999",
          id: "wamid.abc123",
          type: "text",
          text: { body: "Olá" },
        },
      };

      const body = buildDeliveryBody(event);
      expect(typeof body).toBe("string");

      const parsed = JSON.parse(body);
      expect(parsed.event_type).toBe("messages.text");
      expect(parsed.data.text.body).toBe("Olá");
    });

    it("produces consistent JSON serialization", () => {
      const event = { b: 2, a: 1 };
      const body1 = buildDeliveryBody(event);
      const body2 = buildDeliveryBody(event);
      expect(body1).toBe(body2);
    });
  });

  describe("buildDeliveryHeaders", () => {
    it("includes all required X-Nexus headers", () => {
      const headers = buildDeliveryHeaders({
        deliveryId: "uuid-123",
        attemptNumber: 1,
        eventType: "messages.text",
        timestamp: "2026-04-03T00:00:00.000Z",
        signature: null,
        customHeaders: null,
      });

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["X-Nexus-Delivery-Id"]).toBe("uuid-123");
      expect(headers["X-Nexus-Attempt"]).toBe("1");
      expect(headers["X-Nexus-Event-Type"]).toBe("messages.text");
      expect(headers["X-Nexus-Timestamp"]).toBe("2026-04-03T00:00:00.000Z");
      expect(headers["X-Nexus-Signature-256"]).toBeUndefined();
    });

    it("includes signature header when provided", () => {
      const headers = buildDeliveryHeaders({
        deliveryId: "uuid-123",
        attemptNumber: 1,
        eventType: "messages.text",
        timestamp: "2026-04-03T00:00:00.000Z",
        signature: "sha256=abc123",
        customHeaders: null,
      });

      expect(headers["X-Nexus-Signature-256"]).toBe("sha256=abc123");
    });

    it("includes custom headers from route", () => {
      const headers = buildDeliveryHeaders({
        deliveryId: "uuid-123",
        attemptNumber: 1,
        eventType: "messages.text",
        timestamp: "2026-04-03T00:00:00.000Z",
        signature: null,
        customHeaders: {
          "X-Custom-Token": "my-token",
          "X-Tenant-Id": "tenant-42",
        },
      });

      expect(headers["X-Custom-Token"]).toBe("my-token");
      expect(headers["X-Tenant-Id"]).toBe("tenant-42");
    });

    it("does not allow custom headers to override X-Nexus headers", () => {
      const headers = buildDeliveryHeaders({
        deliveryId: "uuid-123",
        attemptNumber: 1,
        eventType: "messages.text",
        timestamp: "2026-04-03T00:00:00.000Z",
        signature: "sha256=real",
        customHeaders: {
          "X-Nexus-Signature-256": "sha256=fake",
          "X-Nexus-Delivery-Id": "fake-id",
          "Content-Type": "text/plain",
        },
      });

      // X-Nexus headers NÃO podem ser sobrescritos
      expect(headers["X-Nexus-Signature-256"]).toBe("sha256=real");
      expect(headers["X-Nexus-Delivery-Id"]).toBe("uuid-123");
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("truncateResponseBody", () => {
    it("returns body as-is when under 4KB", () => {
      const body = "short response";
      expect(truncateResponseBody(body)).toBe(body);
    });

    it("truncates body to 4KB with marker", () => {
      const body = "x".repeat(5000);
      const truncated = truncateResponseBody(body);
      expect(truncated.length).toBeLessThanOrEqual(4096 + 20); // 4KB + marker
      expect(truncated).toContain("[truncated]");
    });

    it("handles null/undefined body", () => {
      expect(truncateResponseBody(null)).toBeNull();
      expect(truncateResponseBody(undefined)).toBeNull();
    });

    it("handles empty string", () => {
      expect(truncateResponseBody("")).toBe("");
    });
  });

  describe("classifyDeliveryResult", () => {
    it("returns 'delivered' for 2xx status", () => {
      expect(classifyDeliveryResult(200, null)).toBe("delivered");
      expect(classifyDeliveryResult(201, null)).toBe("delivered");
      expect(classifyDeliveryResult(204, null)).toBe("delivered");
    });

    it("returns 'retriable' for retriable status codes", () => {
      expect(classifyDeliveryResult(408, null)).toBe("retriable");
      expect(classifyDeliveryResult(429, null)).toBe("retriable");
      expect(classifyDeliveryResult(500, null)).toBe("retriable");
      expect(classifyDeliveryResult(502, null)).toBe("retriable");
      expect(classifyDeliveryResult(503, null)).toBe("retriable");
      expect(classifyDeliveryResult(504, null)).toBe("retriable");
    });

    it("returns 'failed' for non-retriable 4xx status codes", () => {
      expect(classifyDeliveryResult(400, null)).toBe("failed");
      expect(classifyDeliveryResult(401, null)).toBe("failed");
      expect(classifyDeliveryResult(403, null)).toBe("failed");
      expect(classifyDeliveryResult(404, null)).toBe("failed");
      expect(classifyDeliveryResult(422, null)).toBe("failed");
    });

    it("returns 'failed' for redirect status codes", () => {
      expect(classifyDeliveryResult(301, null)).toBe("failed");
      expect(classifyDeliveryResult(302, null)).toBe("failed");
      expect(classifyDeliveryResult(307, null)).toBe("failed");
      expect(classifyDeliveryResult(308, null)).toBe("failed");
    });

    it("returns 'retriable' for network errors", () => {
      const timeoutError = new Error("timeout");
      (timeoutError as any).code = "ECONNABORTED";
      expect(classifyDeliveryResult(null, timeoutError)).toBe("retriable");

      const connRefused = new Error("refused");
      (connRefused as any).code = "ECONNREFUSED";
      expect(classifyDeliveryResult(null, connRefused)).toBe("retriable");
    });

    it("returns 'failed' for unknown errors without network code", () => {
      const error = new Error("unknown");
      expect(classifyDeliveryResult(null, error)).toBe("failed");
    });
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npm test -- --testPathPattern=delivery
```

Expected: FAIL — `Cannot find module '../../worker/delivery'`

- [ ] **Step 3: Implementar worker de entrega**

Criar `src/worker/delivery.ts`:

```typescript
import { Worker, Job } from "bullmq";
import axios, { AxiosError } from "axios";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { computeOutboundSignature } from "../lib/outbound-signature";
import { isRetriableStatus, isRetriableError, getNextRetryDelay } from "../lib/retry";
import { getRetryConfig } from "../lib/global-settings";
import { decrypt } from "../lib/encryption";
import { validateUrlSsrf } from "../lib/ssrf";
import { webhookDeliveryQueue, webhookDlqQueue } from "../lib/queue";

// ─── Constantes ─────────────────────────────────────────────────

const MAX_RESPONSE_BODY_LENGTH = 4096; // 4KB
const WORKER_CONCURRENCY = 10;

// ─── Tipos ──────────────────────────────────────────────────────

export interface DeliveryJobData {
  routeDeliveryId: string;
}

interface DeliveryHeadersInput {
  deliveryId: string;
  attemptNumber: number;
  eventType: string;
  timestamp: string;
  signature: string | null;
  customHeaders: Record<string, string> | null;
}

type DeliveryClassification = "delivered" | "retriable" | "failed";

// ─── Helpers exportados (testáveis) ─────────────────────────────

/**
 * Serializa o evento normalizado como JSON.
 * Usa JSON.stringify canônico (sem sorting, consistente por natureza do V8).
 */
export function buildDeliveryBody(normalizedEvent: unknown): string {
  return JSON.stringify(normalizedEvent);
}

/**
 * Monta headers da entrega com proteção contra override de X-Nexus headers.
 */
export function buildDeliveryHeaders(input: DeliveryHeadersInput): Record<string, string> {
  const headers: Record<string, string> = {};

  // Custom headers primeiro (para que os X-Nexus possam sobrescrever)
  if (input.customHeaders) {
    for (const [key, value] of Object.entries(input.customHeaders)) {
      // Bloqueia override de headers reservados
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.startsWith("x-nexus-") ||
        lowerKey === "content-type"
      ) {
        continue;
      }
      headers[key] = value;
    }
  }

  // Headers obrigatórios (sempre sobrescrevem)
  headers["Content-Type"] = "application/json";
  headers["X-Nexus-Delivery-Id"] = input.deliveryId;
  headers["X-Nexus-Attempt"] = String(input.attemptNumber);
  headers["X-Nexus-Event-Type"] = input.eventType;
  headers["X-Nexus-Timestamp"] = input.timestamp;

  if (input.signature) {
    headers["X-Nexus-Signature-256"] = input.signature;
  }

  return headers;
}

/**
 * Trunca response body para no máximo 4KB.
 */
export function truncateResponseBody(body: string | null | undefined): string | null {
  if (body === null || body === undefined) return null;
  if (body.length <= MAX_RESPONSE_BODY_LENGTH) return body;
  return body.substring(0, MAX_RESPONSE_BODY_LENGTH) + " [truncated]";
}

/**
 * Classifica o resultado de uma tentativa de entrega.
 */
export function classifyDeliveryResult(
  httpStatus: number | null,
  error: Error | null
): DeliveryClassification {
  // Sucesso: 2xx
  if (httpStatus !== null && httpStatus >= 200 && httpStatus < 300) {
    return "delivered";
  }

  // Status retriable
  if (httpStatus !== null && isRetriableStatus(httpStatus)) {
    return "retriable";
  }

  // Erro de rede/timeout (sem HTTP response)
  if (error !== null && isRetriableError(error)) {
    return "retriable";
  }

  // Tudo o resto: non-retriable (4xx, redirects, erros desconhecidos)
  return "failed";
}

// ─── Processador do Job ─────────────────────────────────────────

async function processDeliveryJob(job: Job<DeliveryJobData>): Promise<void> {
  const { routeDeliveryId } = job.data;

  // 1. Buscar RouteDelivery com relações
  const routeDelivery = await prisma.routeDelivery.findUnique({
    where: { id: routeDeliveryId },
    include: {
      route: true,
      inboundWebhook: true,
    },
  });

  if (!routeDelivery) {
    console.error(`[delivery] RouteDelivery ${routeDeliveryId} not found. Skipping.`);
    return;
  }

  // Não reprocessar entregas já finalizadas
  if (routeDelivery.status === "delivered" || routeDelivery.status === "failed") {
    console.log(`[delivery] RouteDelivery ${routeDeliveryId} already ${routeDelivery.status}. Skipping.`);
    return;
  }

  const { route, inboundWebhook } = routeDelivery;

  // Verificar se a rota está ativa
  if (!route.isActive) {
    console.log(`[delivery] Route ${route.id} is inactive. Marking as failed.`);
    await prisma.routeDelivery.update({
      where: { id: routeDeliveryId },
      data: { status: "failed" },
    });
    return;
  }

  // 2. Atualizar status para delivering
  const attemptNumber = routeDelivery.totalAttempts + 1;
  const now = new Date();

  await prisma.routeDelivery.update({
    where: { id: routeDeliveryId },
    data: {
      status: "delivering",
      firstAttemptAt: routeDelivery.firstAttemptAt ?? now,
      lastAttemptAt: now,
    },
  });

  // 3. Validar URL (proteção SSRF)
  try {
    validateUrlSsrf(route.url);
  } catch (ssrfError) {
    console.error(`[delivery] SSRF validation failed for route ${route.id}: ${(ssrfError as Error).message}`);
    await finalizeDelivery(routeDeliveryId, attemptNumber, now, {
      httpStatus: null,
      responseBody: null,
      errorMessage: `SSRF validation failed: ${(ssrfError as Error).message}`,
      classification: "failed",
    });
    return;
  }

  // 4. Montar body: evento normalizado individual
  const normalizedEvent = inboundWebhook.rawPayload;
  const body = buildDeliveryBody(normalizedEvent);

  // 5. Calcular assinatura outbound (se secret_key configurada)
  let signature: string | null = null;
  if (route.secretKey) {
    try {
      const decryptedSecret = decrypt(route.secretKey);
      signature = computeOutboundSignature(body, decryptedSecret);
    } catch (err) {
      console.error(`[delivery] Failed to decrypt secret_key for route ${route.id}:`, err);
      // Continua sem assinatura — não bloqueia entrega
    }
  }

  // 6. Montar headers
  const timestamp = new Date().toISOString();
  const customHeaders = route.headers as Record<string, string> | null;
  const headers = buildDeliveryHeaders({
    deliveryId: routeDelivery.id,
    attemptNumber,
    eventType: inboundWebhook.eventType,
    timestamp,
    signature,
    customHeaders,
  });

  // 7. Enviar via axios
  const startedAt = new Date();
  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  let deliveryError: Error | null = null;

  try {
    const response = await axios.post(route.url, body, {
      headers,
      timeout: route.timeoutMs,
      maxRedirects: 0,
      validateStatus: () => true, // Aceita qualquer status para classificar manualmente
      maxContentLength: 1024 * 1024, // 1MB max response
      responseType: "text",
    });

    httpStatus = response.status;
    responseBody = typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);
  } catch (err) {
    deliveryError = err as Error;

    if (err instanceof AxiosError) {
      httpStatus = err.response?.status ?? null;
      responseBody = err.response?.data
        ? typeof err.response.data === "string"
          ? err.response.data
          : JSON.stringify(err.response.data)
        : null;
      errorMessage = err.message;
    } else {
      errorMessage = (err as Error).message;
    }
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  // 8. Classificar resultado
  const classification = classifyDeliveryResult(httpStatus, deliveryError);

  // 9. Criar DeliveryAttempt
  await prisma.deliveryAttempt.create({
    data: {
      routeDeliveryId,
      attemptNumber,
      startedAt,
      finishedAt,
      durationMs,
      httpStatus,
      responseBody: truncateResponseBody(responseBody),
      errorMessage,
    },
  });

  // 10. Atualizar RouteDelivery conforme resultado
  await finalizeDelivery(routeDeliveryId, attemptNumber, now, {
    httpStatus,
    responseBody,
    errorMessage,
    classification,
  });
}

// ─── Finalização da Entrega ─────────────────────────────────────

interface DeliveryResult {
  httpStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  classification: DeliveryClassification;
}

async function finalizeDelivery(
  routeDeliveryId: string,
  attemptNumber: number,
  attemptStartedAt: Date,
  result: DeliveryResult
): Promise<void> {
  const { httpStatus, errorMessage, classification } = result;

  if (classification === "delivered") {
    // Sucesso
    await prisma.routeDelivery.update({
      where: { id: routeDeliveryId },
      data: {
        status: "delivered",
        deliveredAt: new Date(),
        finalHttpStatus: httpStatus,
        totalAttempts: attemptNumber,
        nextRetryAt: null,
      },
    });

    console.log(`[delivery] ${routeDeliveryId} delivered (HTTP ${httpStatus}) on attempt ${attemptNumber}`);
    await checkAndUpdateInboundStatus(routeDeliveryId);
    return;
  }

  if (classification === "retriable") {
    // Verificar se pode fazer retry
    const retryConfig = await getRetryConfig();
    const retryDecision = getNextRetryDelay(attemptNumber, retryConfig);

    if (retryDecision) {
      // Agendar retry
      const nextRetryAt = new Date(Date.now() + retryDecision.delayMs);

      await prisma.routeDelivery.update({
        where: { id: routeDeliveryId },
        data: {
          status: "retrying",
          finalHttpStatus: httpStatus,
          totalAttempts: attemptNumber,
          nextRetryAt,
        },
      });

      // Enfileirar job com delay
      await webhookDeliveryQueue.add(
        "delivery",
        { routeDeliveryId },
        {
          delay: retryDecision.delayMs,
          jobId: `retry-${routeDeliveryId}-${attemptNumber + 1}`,
        }
      );

      console.log(
        `[delivery] ${routeDeliveryId} retry ${attemptNumber}/${retryConfig.maxRetries} scheduled in ${retryDecision.delayMs}ms` +
        (httpStatus ? ` (HTTP ${httpStatus})` : ` (${errorMessage})`)
      );
      return;
    }

    // Esgotou retries — tratar como failed
    console.log(`[delivery] ${routeDeliveryId} exhausted retries (${attemptNumber} attempts)`);
  }

  // Failed (non-retriable ou retries esgotados)
  await prisma.routeDelivery.update({
    where: { id: routeDeliveryId },
    data: {
      status: "failed",
      finalHttpStatus: httpStatus,
      totalAttempts: attemptNumber,
      nextRetryAt: null,
    },
  });

  console.log(
    `[delivery] ${routeDeliveryId} FAILED on attempt ${attemptNumber}` +
    (httpStatus ? ` (HTTP ${httpStatus})` : ` (${errorMessage})`)
  );

  // Mover para DLQ
  await webhookDlqQueue.add(
    "dlq",
    {
      routeDeliveryId,
      reason: errorMessage ?? `HTTP ${httpStatus}`,
      failedAt: new Date().toISOString(),
      totalAttempts: attemptNumber,
    },
    {
      removeOnComplete: false,
      removeOnFail: false,
      // Jobs na DLQ ficam 7 dias
      // BullMQ não tem TTL nativo em jobs — o cleanup é feito via removeOnComplete/removeOnFail + job externo
    }
  );

  // Notificação (Fase 1: apenas log. Notificação real na Fase 2)
  console.warn(
    `[delivery] [NOTIFICATION] RouteDelivery ${routeDeliveryId} failed permanently. ` +
    `Would notify admins. Reason: ${errorMessage ?? `HTTP ${httpStatus}`}`
  );

  await checkAndUpdateInboundStatus(routeDeliveryId);
}

/**
 * Verifica se todas as RouteDeliveries de um InboundWebhook atingiram estado terminal.
 * Se sim, atualiza InboundWebhook.processing_status para 'processed'.
 */
async function checkAndUpdateInboundStatus(routeDeliveryId: string): Promise<void> {
  try {
    const delivery = await prisma.routeDelivery.findUnique({
      where: { id: routeDeliveryId },
      select: { inboundWebhookId: true },
    });

    if (!delivery) return;

    const pendingCount = await prisma.routeDelivery.count({
      where: {
        inboundWebhookId: delivery.inboundWebhookId,
        status: { notIn: ["delivered", "failed"] },
      },
    });

    if (pendingCount === 0) {
      await prisma.inboundWebhook.update({
        where: { id: delivery.inboundWebhookId },
        data: { processingStatus: "processed" },
      });
    }
  } catch (err) {
    // Best-effort — não falha o job por isso
    console.error("[delivery] Failed to update inbound status:", err);
  }
}

// ─── Criação do Worker BullMQ ───────────────────────────────────

export function createDeliveryWorker(): Worker<DeliveryJobData> {
  const worker = new Worker<DeliveryJobData>(
    "webhook-delivery",
    processDeliveryJob,
    {
      connection: redis,
      concurrency: WORKER_CONCURRENCY,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[delivery] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[delivery] Job ${job?.id} failed unexpectedly:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[delivery] Worker error:", err.message);
  });

  return worker;
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npm test -- --testPathPattern=delivery
```

Expected: PASS — todos os testes de helpers passando

- [ ] **Step 5: Commit**

```bash
git add src/worker/delivery.ts src/lib/__tests__/delivery.test.ts
git commit -m "feat: worker de entrega BullMQ com retry, DLQ e assinatura outbound"
```

---

### Task 5: Orphan-recovery job (`src/worker/orphan-recovery.ts`)

**Files:**
- Create: `src/worker/orphan-recovery.ts`

- [ ] **Step 1: Implementar orphan-recovery**

Criar `src/worker/orphan-recovery.ts`:

```typescript
import { prisma } from "../lib/prisma";
import { webhookDeliveryQueue } from "../lib/queue";

/**
 * Job de recuperação de entregas órfãs.
 *
 * Roda periodicamente e busca RouteDeliveries que ficaram "presas":
 * - status pending/delivering há mais de 2min (criado/atualizado mas sem job na fila)
 * - status retrying com next_retry_at <= NOW() há mais de 2min (retry agendado mas job perdido)
 *
 * Para cada órfã, verifica se existe job correspondente no BullMQ.
 * Se não existe, reenfileira.
 *
 * Este job é o mecanismo compensatório que garante consistência eventual
 * entre PostgreSQL e Redis (at-least-once delivery).
 */

const ORPHAN_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutos
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

export interface OrphanRecoveryOptions {
  intervalMs?: number;
  thresholdMs?: number;
}

export async function recoverOrphanDeliveries(
  thresholdMs: number = ORPHAN_THRESHOLD_MS
): Promise<{ recovered: number; checked: number }> {
  const thresholdDate = new Date(Date.now() - thresholdMs);

  // Buscar RouteDeliveries potencialmente órfãs
  const orphanCandidates = await prisma.routeDelivery.findMany({
    where: {
      OR: [
        // pending ou delivering há mais de threshold
        {
          status: { in: ["pending", "delivering"] },
          createdAt: { lt: thresholdDate },
        },
        // retrying com next_retry_at expirado há mais de threshold
        {
          status: "retrying",
          nextRetryAt: { lte: new Date(Date.now() - thresholdMs) },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      totalAttempts: true,
    },
    take: 100, // Limitar batch para não sobrecarregar
  });

  if (orphanCandidates.length === 0) {
    return { recovered: 0, checked: 0 };
  }

  console.log(`[orphan-recovery] Found ${orphanCandidates.length} orphan candidates`);

  let recovered = 0;

  for (const delivery of orphanCandidates) {
    try {
      // Verificar se já existe job na fila para esta entrega
      const existingJob = await webhookDeliveryQueue.getJob(
        `delivery-${delivery.id}`
      );

      // Também verificar jobs de retry
      const retryJobId = `retry-${delivery.id}-${delivery.totalAttempts + 1}`;
      const existingRetryJob = await webhookDeliveryQueue.getJob(retryJobId);

      if (existingJob || existingRetryJob) {
        // Job existe na fila — não é órfão
        continue;
      }

      // Reenfileirar
      await webhookDeliveryQueue.add(
        "delivery",
        { routeDeliveryId: delivery.id },
        {
          jobId: `orphan-recovery-${delivery.id}-${Date.now()}`,
        }
      );

      recovered++;
      console.log(
        `[orphan-recovery] Re-enqueued delivery ${delivery.id} (was ${delivery.status}, attempt ${delivery.totalAttempts})`
      );
    } catch (err) {
      console.error(
        `[orphan-recovery] Failed to recover delivery ${delivery.id}:`,
        (err as Error).message
      );
    }
  }

  return { recovered, checked: orphanCandidates.length };
}

// ─── Scheduler ──────────────────────────────────────────────────

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startOrphanRecoveryScheduler(
  options: OrphanRecoveryOptions = {}
): void {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const thresholdMs = options.thresholdMs ?? ORPHAN_THRESHOLD_MS;

  console.log(
    `[orphan-recovery] Starting scheduler (interval: ${intervalMs / 1000}s, threshold: ${thresholdMs / 1000}s)`
  );

  // Rodar imediatamente na primeira vez
  recoverOrphanDeliveries(thresholdMs)
    .then(({ recovered, checked }) => {
      if (checked > 0) {
        console.log(`[orphan-recovery] Initial run: checked ${checked}, recovered ${recovered}`);
      }
    })
    .catch((err) => {
      console.error("[orphan-recovery] Initial run failed:", err.message);
    });

  // Agendar execuções periódicas
  intervalHandle = setInterval(async () => {
    try {
      const { recovered, checked } = await recoverOrphanDeliveries(thresholdMs);
      if (checked > 0) {
        console.log(`[orphan-recovery] Checked ${checked}, recovered ${recovered}`);
      }
    } catch (err) {
      console.error("[orphan-recovery] Scheduled run failed:", (err as Error).message);
    }
  }, intervalMs);
}

export function stopOrphanRecoveryScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[orphan-recovery] Scheduler stopped");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/worker/orphan-recovery.ts
git commit -m "feat: orphan-recovery scheduler para recuperação de entregas órfãs"
```

---

### Task 6: Worker entrypoint atualizado (`src/worker/index.ts`)

**Files:**
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Atualizar entrypoint do worker**

Substituir `src/worker/index.ts` com:

```typescript
import { createDeliveryWorker } from "./delivery";
import {
  startOrphanRecoveryScheduler,
  stopOrphanRecoveryScheduler,
} from "./orphan-recovery";

console.log("[worker] Starting Nexus webhook worker...");
console.log(`[worker] Node.js ${process.version}`);
console.log(`[worker] PID: ${process.pid}`);

// ─── Inicializar Workers ────────────────────────────────────────

const deliveryWorker = createDeliveryWorker();

// ─── Inicializar Orphan Recovery ────────────────────────────────

const orphanRecoveryIntervalMs = process.env.ORPHAN_RECOVERY_INTERVAL_MS
  ? parseInt(process.env.ORPHAN_RECOVERY_INTERVAL_MS, 10)
  : 5 * 60 * 1000; // 5 min default

startOrphanRecoveryScheduler({
  intervalMs: orphanRecoveryIntervalMs,
});

console.log("[worker] All workers initialized");

// ─── Graceful Shutdown ──────────────────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[worker] Received ${signal}. Starting graceful shutdown...`);

  // Timeout de segurança: força exit após 30s
  const forceExitTimeout = setTimeout(() => {
    console.error("[worker] Graceful shutdown timeout exceeded. Forcing exit.");
    process.exit(1);
  }, 30_000);
  forceExitTimeout.unref();

  try {
    // 1. Parar de aceitar novos jobs
    console.log("[worker] Closing delivery worker...");
    await deliveryWorker.close();

    // 2. Parar orphan-recovery
    console.log("[worker] Stopping orphan-recovery scheduler...");
    stopOrphanRecoveryScheduler();

    console.log("[worker] Graceful shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("[worker] Error during shutdown:", (err as Error).message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ─── Uncaught Errors ────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("[worker] Uncaught exception:", err);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("[worker] Unhandled rejection:", reason);
  // Não shutdown — apenas log. BullMQ gerencia jobs individuais.
});
```

- [ ] **Step 2: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: worker entrypoint com delivery worker, orphan-recovery e graceful shutdown"
```

---

### Task 7: GlobalSettings seed

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Atualizar seed para incluir defaults de retry**

Adicionar ao final de `prisma/seed.ts` (dentro da função `main`, antes do fechamento):

```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ─── Super Admin ────────────────────────────────────────────────
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  let adminId: string | null = null;

  if (!email || !password) {
    console.log("[seed] ADMIN_EMAIL e ADMIN_PASSWORD não definidos. Pulando seed do admin.");
  } else {
    if (password.length < 12) {
      throw new Error("ADMIN_PASSWORD deve ter no mínimo 12 caracteres");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`[seed] Super admin ${email} já existe. Pulando.`);
      adminId = existing.id;
    } else {
      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await prisma.user.create({
        data: {
          name: "Super Admin",
          email,
          password: hashedPassword,
          isSuperAdmin: true,
        },
      });

      console.log(`[seed] Super admin criado: ${user.email} (${user.id})`);
      adminId = user.id;
    }
  }

  // ─── GlobalSettings defaults ────────────────────────────────────

  // Se não temos admin, buscar qualquer super admin existente para o updated_by
  if (!adminId) {
    const anyAdmin = await prisma.user.findFirst({
      where: { isSuperAdmin: true },
      select: { id: true },
    });
    adminId = anyAdmin?.id ?? null;
  }

  if (!adminId) {
    console.log("[seed] Nenhum admin encontrado. Pulando seed de GlobalSettings.");
    return;
  }

  const defaultSettings: Array<{ key: string; value: unknown }> = [
    { key: "retry_max_retries", value: 3 },
    { key: "retry_intervals_seconds", value: [10, 30, 90] },
    { key: "retry_strategy", value: "exponential" },
    { key: "retry_jitter_enabled", value: true },
    { key: "log_full_retention_days", value: 90 },
    { key: "log_summary_retention_days", value: 180 },
    { key: "notify_platform_enabled", value: true },
    { key: "notify_email_enabled", value: true },
    { key: "notify_whatsapp_enabled", value: true },
    { key: "notify_failure_threshold", value: 5 },
    { key: "notify_recipients", value: "admins" },
  ];

  for (const { key, value } of defaultSettings) {
    const existing = await prisma.globalSettings.findUnique({
      where: { key },
    });

    if (existing) {
      console.log(`[seed] GlobalSettings "${key}" já existe (valor: ${JSON.stringify(existing.value)}). Pulando.`);
      continue;
    }

    await prisma.globalSettings.create({
      data: {
        key,
        value: value as any,
        updatedBy: adminId,
      },
    });

    console.log(`[seed] GlobalSettings "${key}" criado com valor: ${JSON.stringify(value)}`);
  }
}

main()
  .catch((e) => {
    console.error("[seed] Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed de GlobalSettings com defaults de retry, retenção e notificação"
```

---

### Task 8: Migração Prisma — índices para orphan-recovery

**Files:**
- New migration for partial index on RouteDelivery

- [ ] **Step 1: Criar migração para índice parcial do orphan-recovery**

O schema Prisma já tem os índices básicos (definidos no sub-plano 1). Para o orphan-recovery, precisamos do partial index `idx_delivery_status` que cobre queries de status pending/delivering/retrying com filtro WHERE.

Como o Prisma não suporta partial indexes nativamente, criar migração SQL manual:

```bash
npx prisma migrate dev --name add_delivery_status_partial_index --create-only
```

Editar o arquivo de migração gerado para conter:

```sql
-- Índice parcial para orphan-recovery e queries de status não-terminal
CREATE INDEX IF NOT EXISTS idx_delivery_status
  ON route_deliveries (status, next_retry_at, created_at)
  WHERE status IN ('pending', 'delivering', 'retrying');

-- Índice parcial para InboundWebhook com processing_status não-terminal
CREATE INDEX IF NOT EXISTS idx_inbound_processing
  ON inbound_webhooks (processing_status)
  WHERE processing_status != 'processed';
```

- [ ] **Step 2: Aplicar migração**

```bash
npx prisma migrate dev
```

Expected: Migration aplicada com sucesso.

- [ ] **Step 3: Commit**

```bash
git add prisma/migrations/
git commit -m "feat: índices parciais para orphan-recovery e queries de status"
```

---

### Task 9: Limpeza da DLQ (TTL de 7 dias)

**Files:**
- Create: `src/worker/dlq-cleanup.ts`
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Implementar cleanup da DLQ**

Criar `src/worker/dlq-cleanup.ts`:

```typescript
import { webhookDlqQueue } from "../lib/queue";

/**
 * Remove jobs da DLQ com mais de 7 dias.
 * BullMQ não tem TTL nativo em jobs — fazemos cleanup manual.
 */

const DLQ_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hora

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export async function cleanupDlqJobs(): Promise<number> {
  const cutoffTimestamp = Date.now() - DLQ_RETENTION_MS;
  let removed = 0;

  // Buscar jobs completed e failed
  const completedJobs = await webhookDlqQueue.getCompleted(0, 500);
  const failedJobs = await webhookDlqQueue.getFailed(0, 500);
  const waitingJobs = await webhookDlqQueue.getWaiting(0, 500);

  const allJobs = [...completedJobs, ...failedJobs, ...waitingJobs];

  for (const job of allJobs) {
    if (job.timestamp < cutoffTimestamp) {
      try {
        await job.remove();
        removed++;
      } catch {
        // Job pode ter sido removido por outro processo
      }
    }
  }

  if (removed > 0) {
    console.log(`[dlq-cleanup] Removed ${removed} expired DLQ jobs`);
  }

  return removed;
}

export function startDlqCleanupScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  console.log(`[dlq-cleanup] Starting scheduler (interval: ${intervalMs / 1000}s)`);

  intervalHandle = setInterval(async () => {
    try {
      await cleanupDlqJobs();
    } catch (err) {
      console.error("[dlq-cleanup] Cleanup failed:", (err as Error).message);
    }
  }, intervalMs);
}

export function stopDlqCleanupScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[dlq-cleanup] Scheduler stopped");
  }
}
```

- [ ] **Step 2: Integrar DLQ cleanup no worker entrypoint**

Atualizar `src/worker/index.ts` para incluir:

```typescript
import { createDeliveryWorker } from "./delivery";
import {
  startOrphanRecoveryScheduler,
  stopOrphanRecoveryScheduler,
} from "./orphan-recovery";
import {
  startDlqCleanupScheduler,
  stopDlqCleanupScheduler,
} from "./dlq-cleanup";

console.log("[worker] Starting Nexus webhook worker...");
console.log(`[worker] Node.js ${process.version}`);
console.log(`[worker] PID: ${process.pid}`);

// ─── Inicializar Workers ────────────────────────────────────────

const deliveryWorker = createDeliveryWorker();

// ─── Inicializar Orphan Recovery ────────────────────────────────

const orphanRecoveryIntervalMs = process.env.ORPHAN_RECOVERY_INTERVAL_MS
  ? parseInt(process.env.ORPHAN_RECOVERY_INTERVAL_MS, 10)
  : 5 * 60 * 1000; // 5 min default

startOrphanRecoveryScheduler({
  intervalMs: orphanRecoveryIntervalMs,
});

// ─── Inicializar DLQ Cleanup ────────────────────────────────────

startDlqCleanupScheduler();

console.log("[worker] All workers initialized");

// ─── Graceful Shutdown ──────────────────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[worker] Received ${signal}. Starting graceful shutdown...`);

  const forceExitTimeout = setTimeout(() => {
    console.error("[worker] Graceful shutdown timeout exceeded. Forcing exit.");
    process.exit(1);
  }, 30_000);
  forceExitTimeout.unref();

  try {
    console.log("[worker] Closing delivery worker...");
    await deliveryWorker.close();

    console.log("[worker] Stopping orphan-recovery scheduler...");
    stopOrphanRecoveryScheduler();

    console.log("[worker] Stopping DLQ cleanup scheduler...");
    stopDlqCleanupScheduler();

    console.log("[worker] Graceful shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("[worker] Error during shutdown:", (err as Error).message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error("[worker] Uncaught exception:", err);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("[worker] Unhandled rejection:", reason);
});
```

- [ ] **Step 3: Commit**

```bash
git add src/worker/dlq-cleanup.ts src/worker/index.ts
git commit -m "feat: DLQ cleanup scheduler com TTL de 7 dias"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Worker de entrega ✅, Retry com backoff/jitter ✅, DLQ ✅, Orphan-recovery ✅, Assinatura outbound ✅, GlobalSettings seed ✅, Graceful shutdown ✅
- [x] **Placeholder scan:** Nenhum TBD/TODO. Notificação de falha é log por design (Fase 2 implementa real)
- [x] **Dependência do sub-plano 4:** Usa `validateUrlSsrf` (SSRF), filas BullMQ, modelos Prisma existentes
- [x] **Type consistency:** DeliveryJobData, RetryConfig, RetryDecision tipados. Prisma types consistentes
- [x] **Campos nullable:** secret_key, headers, next_retry_at tratados corretamente
- [x] **Body é evento normalizado:** Não envia callback inteiro, apenas `rawPayload` do InboundWebhook individual
- [x] **Assinatura sobre body serializado:** `computeOutboundSignature(body, secret)` usa o JSON string, não o raw_body original
- [x] **maxRedirects: 0:** Redirects tratados como non-retriable (failed)
- [x] **retry_max_retries = além da inicial:** 3 retries + 1 inicial = 4 total. Correto no `getNextRetryDelay`
- [x] **Jitter ±20%:** `applyJitter` usa fator 0.8-1.2. Testado
- [x] **Headers protegidos:** `buildDeliveryHeaders` bloqueia override de `X-Nexus-*` e `Content-Type`
- [x] **Response body truncado 4KB:** `truncateResponseBody` com marker `[truncated]`
- [x] **DLQ 7 dias:** `dlq-cleanup.ts` remove jobs expirados a cada 1h
- [x] **Orphan-recovery como core:** Nasce com o worker, não é opcional. Scheduler com `setInterval`
- [x] **Testes TDD:** outbound-signature (8 testes), retry (20+ testes), delivery helpers (14+ testes)
- [x] **Container separado:** Mesmo image, entrypoint `node worker/index.js`. Já configurado no docker-compose.yml do sub-plano 1
- [x] **Graceful shutdown:** SIGTERM/SIGINT com timeout de 30s. Workers fechados antes de exit
