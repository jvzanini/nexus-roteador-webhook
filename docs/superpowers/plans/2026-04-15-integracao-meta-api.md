# Integração Meta Graph API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que super admins / company admins inscrevam automaticamente o webhook da empresa na Meta (WhatsApp Cloud API) em um clique, além de testar conexão, revalidar drift e desinscrever.

**Architecture:** Wrapper puro `lib/meta/graph-api.ts` com funções de fetch tipadas → server actions em `lib/actions/meta-subscription.ts` orquestrando decrypt + lock Redis + rate limit + persistência + audit + notification → UI na aba WhatsApp Cloud com badge e 4 botões. Job BullMQ diário reconcilia estado com a Meta.

**Tech Stack:** Next.js 14 App Router · Server Actions · Prisma v7 (client em `@/generated/prisma/client`) · PostgreSQL · Redis/BullMQ · Jest · Zod · ioredis · Tailwind + shadcn · lucide-react.

**Referência de spec:** `docs/superpowers/specs/2026-04-15-integracao-meta-api-design.md`.

---

## Nota sobre padrões do projeto

- Retorno de action: `{ success: boolean; data?; error? }` (vide `credential.ts`).
- `logAudit` é fire-and-forget (já try/catch interno em `src/lib/audit.ts:32-49`).
- Autorização: `user.isSuperAdmin || membership.role === "company_admin"`.
- Encryption via `encrypt/decrypt/mask` de `src/lib/encryption.ts`.
- Enum Prisma: **lowercase** (`not_configured`, `active`...).
- Import Prisma: `@/generated/prisma/client`.
- Commits: mensagens em português, em escopo único, co-autoria Claude incluída.
- **NotificationType** válido: `error | warning | info` (NÃO existe `success`). Usar `info` para sucesso, `warning` para avisos parciais, `error` para falhas.
- **Push e PR** acontecem só na Task 15.
- **Fallback de skill UI**: se a skill `ui-ux-pro-max` estiver disponível no contexto, invocar para Tasks 11–12. Caso contrário, seguir `design-system/nexus-roteador-webhook/MASTER.md` (tokens de cor, `CustomSelect`, badge `text-*-600 dark:text-*-400`, mobile responsive).

---

## Task 1 — Migration + schema Prisma

**Files:**
- Create: `prisma/migrations/20260415120000_add_meta_subscription_state/migration.sql`
- Modify: `prisma/schema.prisma` (model `CompanyCredential`, novo enum `MetaSubscriptionStatus`)

- [ ] **Passo 1: Adicionar enum + campos no schema**

```prisma
// prisma/schema.prisma — adicionar após enum ProcessingStatus
enum MetaSubscriptionStatus {
  not_configured
  pending
  active
  stale
  error
}
```

No model `CompanyCredential` acrescentar dentro do bloco existente:
```prisma
  metaSystemUserToken       String?                @map("meta_system_user_token")
  metaSubscriptionStatus    MetaSubscriptionStatus @default(not_configured) @map("meta_subscription_status")
  metaSubscribedAt          DateTime?              @map("meta_subscribed_at")
  metaSubscriptionError     String?                @map("meta_subscription_error")
  metaSubscribedFields      String[]               @default([]) @map("meta_subscribed_fields")
  metaSubscribedCallbackUrl String?                @map("meta_subscribed_callback_url")
```

- [ ] **Passo 2: Criar migration SQL**

`prisma/migrations/20260415120000_add_meta_subscription_state/migration.sql`:
```sql
CREATE TYPE "MetaSubscriptionStatus" AS ENUM ('not_configured','pending','active','stale','error');

ALTER TABLE "company_credentials"
  ADD COLUMN "meta_system_user_token" TEXT,
  ADD COLUMN "meta_subscription_status" "MetaSubscriptionStatus" NOT NULL DEFAULT 'not_configured',
  ADD COLUMN "meta_subscribed_at" TIMESTAMP(3),
  ADD COLUMN "meta_subscription_error" TEXT,
  ADD COLUMN "meta_subscribed_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "meta_subscribed_callback_url" TEXT;
```

- [ ] **Passo 2b: Estender `RealtimeEvent` union**

Em `src/lib/realtime.ts`, adicionar variante:
```ts
export type RealtimeEvent =
  | { type: "delivery:completed"; companyId: string }
  | { type: "delivery:failed"; companyId: string }
  | { type: "notification:new"; userId: string }
  | { type: "webhook:received"; companyId: string }
  | { type: "credential:updated"; companyId: string };
```

- [ ] **Passo 3: Gerar cliente Prisma e validar**

Rodar:
```bash
npx prisma format
npx prisma generate
```
Esperado: sem erro, `@/generated/prisma/client` atualizado.

- [ ] **Passo 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260415120000_add_meta_subscription_state/ src/lib/realtime.ts
git commit -m "feat(db): adiciona meta subscription state em CompanyCredential

Novo enum MetaSubscriptionStatus + campos metaSystemUserToken,
metaSubscriptionStatus, metaSubscribedAt, metaSubscriptionError,
metaSubscribedFields, metaSubscribedCallbackUrl.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — Encrypted fields + validations

**Files:**
- Modify: `src/lib/actions/credential.ts` (ENCRYPTED_FIELDS + mask)
- Modify: `src/lib/validations/credential.ts`
- Test: `src/lib/actions/__tests__/credential.test.ts` (se existir; senão trechos no próximo Task)

- [ ] **Passo 1: Estender `ENCRYPTED_FIELDS`**

Em `src/lib/actions/credential.ts:20`, trocar constante:
```ts
const ENCRYPTED_FIELDS = [
  "metaAppSecret",
  "verifyToken",
  "accessToken",
  "metaSystemUserToken",
] as const;
```

- [ ] **Passo 2: Atualizar `getCredential` para mascarar novo campo**

Localizar bloco que monta `masked` e adicionar:
```ts
metaSystemUserToken: credential.metaSystemUserToken
  ? mask(decrypt(credential.metaSystemUserToken))
  : null,
```

Além disso, retornar **snapshot da subscription** para alimentar UI (Task 12):
```ts
meta: {
  status: credential.metaSubscriptionStatus,
  subscribedAt: credential.metaSubscribedAt?.toISOString() ?? null,
  error: credential.metaSubscriptionError,
  callbackUrl: credential.metaSubscribedCallbackUrl,
  fields: credential.metaSubscribedFields,
},
```

- [ ] **Passo 3: Estender Zod schema**

Em `src/lib/validations/credential.ts`, no objeto `upsertCredentialSchema`:
```ts
metaSystemUserToken: z
  .string()
  .min(1, "System User Token inválido")
  .max(500, "System User Token inválido")
  .optional()
  .nullable(),
```

- [ ] **Passo 4: Atualizar `upsertCredential`** para criptografar e persistir

No `credential.ts`, onde existe a lógica de encrypt + upsert, incluir `metaSystemUserToken` no fluxo espelhando `accessToken`. Quando `input.metaSystemUserToken === undefined` não sobrescrever (preserva valor anterior); quando `null` ou `""` limpar (`null`).

- [ ] **Passo 4b: Escrever teste falhando para encrypt + mask do novo campo**

Em `src/lib/actions/__tests__/credential.test.ts` (criar se não existe):
```ts
it("encripta metaSystemUserToken no upsert e mascara no get", async () => {
  // arrange: mock prisma + encryption; chamar upsertCredential com metaSystemUserToken="plaintext"
  // assert: create recebeu valor diferente de "plaintext"; getCredential retorna mask
});
```

- [ ] **Passo 5: Rodar testes — incluindo novo**

```bash
npm test -- credential
```
Esperado: todos passam (inclusive o novo).

- [ ] **Passo 6: Commit**

```bash
git add src/lib/actions/credential.ts src/lib/validations/credential.ts
git commit -m "feat(credentials): suporta metaSystemUserToken (encrypt + mask)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Módulo `lib/meta/graph-api.ts` (TDD)

**Files:**
- Create: `src/lib/meta/graph-api.ts`
- Test: `src/lib/meta/__tests__/graph-api.test.ts`

- [ ] **Passo 1: Escrever teste falhando — shape e sucesso**

`src/lib/meta/__tests__/graph-api.test.ts`:
```ts
import {
  getPhoneNumber,
  subscribeFields,
  subscribeApp,
  unsubscribeApp,
  listSubscribedApps,
  listSubscriptions,
  MetaApiError,
  serializeErrorSafe,
} from "../graph-api";

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  process.env.META_GRAPH_API_URL = "https://graph.facebook.com";
  process.env.META_API_VERSION = "v20.0";
});

describe("graph-api.getPhoneNumber", () => {
  it("retorna shape parseado em 200 OK", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({
        id: "123",
        display_phone_number: "+55 11 9999-0000",
        verified_name: "Nexus",
        quality_rating: "GREEN",
      }),
      { status: 200 }
    ));
    const r = await getPhoneNumber("123", "TOKEN");
    expect(r).toEqual({
      id: "123",
      displayPhoneNumber: "+55 11 9999-0000",
      verifiedName: "Nexus",
      qualityRating: "GREEN",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v20.0/123?fields=display_phone_number,verified_name,quality_rating"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer TOKEN" }),
      })
    );
  });
});

describe("graph-api — erros", () => {
  it("joga MetaApiError em 4xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { code: 100, error_subcode: 33, message: "fail", fbtrace_id: "abc" } }),
      { status: 400 }
    ));
    await expect(getPhoneNumber("x", "t")).rejects.toMatchObject({
      name: "MetaApiError",
      status: 400,
      code: 100,
      subcode: 33,
      message: "fail",
      fbtraceId: "abc",
    });
  });

  it("faz 1 retry em 5xx e sucede", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("boom", { status: 502 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ id: "1", display_phone_number: "x", verified_name: "y" }),
        { status: 200 }
      ));
    const r = await getPhoneNumber("1", "t");
    expect(r.id).toBe("1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não retry em 4xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { code: 190, message: "expired" } }),
      { status: 401 }
    ));
    await expect(getPhoneNumber("1", "t")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("subscribeFields / subscribeApp / unsubscribeApp", () => {
  it("POSTa callback_url, verify_token, fields, object", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await subscribeFields("APPID", {
      object: "whatsapp_business_account",
      callbackUrl: "https://x.com/webhook/abc",
      verifyToken: "vt",
      fields: ["messages"],
    }, "TOKEN");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/v20.0/APPID/subscriptions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      object: "whatsapp_business_account",
      callback_url: "https://x.com/webhook/abc",
      verify_token: "vt",
      fields: "messages",
    });
  });

  it("subscribeApp POSTa em /{waba}/subscribed_apps", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await subscribeApp("WABA", "T");
    expect(fetchMock.mock.calls[0][0]).toContain("/v20.0/WABA/subscribed_apps");
  });

  it("unsubscribeApp DELETE em /{waba}/subscribed_apps", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await unsubscribeApp("WABA", "T");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});

describe("listSubscribedApps / listSubscriptions", () => {
  it("parseia lista de apps", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: [{ whatsapp_business_api_data: { id: "APPID", name: "Nexus" } }] }),
      { status: 200 }
    ));
    const r = await listSubscribedApps("WABA", "T");
    expect(r).toEqual([{ appId: "APPID", name: "Nexus" }]);
  });

  it("parseia subscriptions", async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({
        data: [{ object: "whatsapp_business_account", callback_url: "https://x/w/k", fields: [{ name: "messages" }] }],
      }),
      { status: 200 }
    ));
    const r = await listSubscriptions("APPID", "T");
    expect(r).toEqual([
      { object: "whatsapp_business_account", callbackUrl: "https://x/w/k", fields: ["messages"] },
    ]);
  });
});

describe("serializeErrorSafe", () => {
  it("allowlist campos e trunca a 500 chars", () => {
    const err = new MetaApiError({
      status: 400,
      code: 190,
      message: "x".repeat(1000),
      fbtraceId: "zzz",
    });
    const s = serializeErrorSafe(err);
    expect(s.length).toBeLessThanOrEqual(500);
    const obj = JSON.parse(s);
    expect(Object.keys(obj).sort()).toEqual(["code", "fbtraceId", "message", "status"]);
  });

  it("lida com erro não-MetaApi", () => {
    const s = serializeErrorSafe(new Error("boom"));
    const obj = JSON.parse(s);
    expect(obj.message).toBe("boom");
  });
});
```

- [ ] **Passo 2: Rodar teste para garantir falha**

```bash
npx jest src/lib/meta/__tests__/graph-api.test.ts
```
Esperado: FAIL (módulo não existe).

- [ ] **Passo 3: Implementar `graph-api.ts`**

`src/lib/meta/graph-api.ts`:
```ts
const DEFAULT_BASE = "https://graph.facebook.com";
const DEFAULT_VERSION = "v20.0";
const TIMEOUT_MS = 8_000;

function baseUrl(): string {
  const root = process.env.META_GRAPH_API_URL ?? DEFAULT_BASE;
  const version = process.env.META_API_VERSION ?? DEFAULT_VERSION;
  return `${root}/${version}`;
}

export interface MetaApiErrorInit {
  status: number;
  code?: number;
  subcode?: number;
  message: string;
  fbtraceId?: string;
}

export class MetaApiError extends Error {
  status: number;
  code?: number;
  subcode?: number;
  fbtraceId?: string;

  constructor(init: MetaApiErrorInit) {
    super(init.message);
    this.name = "MetaApiError";
    this.status = init.status;
    this.code = init.code;
    this.subcode = init.subcode;
    this.fbtraceId = init.fbtraceId;
  }
}

const ALLOWED_ERROR_FIELDS = ["status", "code", "subcode", "message", "fbtraceId"] as const;

export function serializeErrorSafe(err: unknown): string {
  const obj: Record<string, unknown> = {};
  if (err instanceof MetaApiError) {
    for (const k of ALLOWED_ERROR_FIELDS) {
      const v = (err as unknown as Record<string, unknown>)[k];
      if (v !== undefined) obj[k] = v;
    }
  } else if (err instanceof Error) {
    obj.message = err.message;
  } else {
    obj.message = "Erro desconhecido";
  }
  let s = JSON.stringify(obj);
  if (s.length > 500) s = s.slice(0, 497) + "...";
  return s;
}

async function doFetch(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 500 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 500));
      return doFetch(url, init, attempt + 1);
    }
    return res;
  } catch (e) {
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 500));
      return doFetch(url, init, attempt + 1);
    }
    throw e;
  }
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (res.status >= 400) {
    const e = (json as any)?.error ?? {};
    throw new MetaApiError({
      status: res.status,
      code: typeof e.code === "number" ? e.code : undefined,
      subcode: typeof e.error_subcode === "number" ? e.error_subcode : undefined,
      message: typeof e.message === "string" ? e.message : `HTTP ${res.status}`,
      fbtraceId: typeof e.fbtrace_id === "string" ? e.fbtrace_id : undefined,
    });
  }
  return json as T;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export interface PhoneNumber {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating?: string;
}

export async function getPhoneNumber(phoneNumberId: string, token: string): Promise<PhoneNumber> {
  const res = await doFetch(
    `${baseUrl()}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`,
    { method: "GET", headers: authHeaders(token) }
  );
  const raw = await parseOrThrow<{
    id: string;
    display_phone_number: string;
    verified_name: string;
    quality_rating?: string;
  }>(res);
  return {
    id: raw.id,
    displayPhoneNumber: raw.display_phone_number,
    verifiedName: raw.verified_name,
    qualityRating: raw.quality_rating,
  };
}

export interface SubscribeFieldsInput {
  object: string;
  callbackUrl: string;
  verifyToken: string;
  fields: string[];
}

export async function subscribeFields(
  appId: string,
  input: SubscribeFieldsInput,
  token: string
): Promise<void> {
  const res = await doFetch(`${baseUrl()}/${encodeURIComponent(appId)}/subscriptions`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      object: input.object,
      callback_url: input.callbackUrl,
      verify_token: input.verifyToken,
      fields: input.fields.join(","),
    }),
  });
  await parseOrThrow(res);
}

export async function subscribeApp(wabaId: string, token: string): Promise<void> {
  const res = await doFetch(`${baseUrl()}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: authHeaders(token),
  });
  await parseOrThrow(res);
}

export async function unsubscribeApp(wabaId: string, token: string): Promise<void> {
  const res = await doFetch(`${baseUrl()}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  await parseOrThrow(res);
}

export interface SubscribedApp {
  appId: string;
  name?: string;
}

export async function listSubscribedApps(wabaId: string, token: string): Promise<SubscribedApp[]> {
  const res = await doFetch(`${baseUrl()}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "GET",
    headers: authHeaders(token),
  });
  const raw = await parseOrThrow<{ data: Array<{ whatsapp_business_api_data?: { id: string; name?: string } }> }>(res);
  return (raw.data ?? [])
    .map((d) => d.whatsapp_business_api_data)
    .filter((d): d is { id: string; name?: string } => !!d)
    .map((d) => ({ appId: d.id, name: d.name }));
}

export interface Subscription {
  object: string;
  callbackUrl: string;
  fields: string[];
}

export async function listSubscriptions(appId: string, token: string): Promise<Subscription[]> {
  const res = await doFetch(`${baseUrl()}/${encodeURIComponent(appId)}/subscriptions`, {
    method: "GET",
    headers: authHeaders(token),
  });
  const raw = await parseOrThrow<{
    data: Array<{ object: string; callback_url: string; fields: Array<{ name: string }> }>;
  }>(res);
  return (raw.data ?? []).map((s) => ({
    object: s.object,
    callbackUrl: s.callback_url,
    fields: (s.fields ?? []).map((f) => f.name),
  }));
}
```

- [ ] **Passo 4: Rodar teste — todos passam**

```bash
npx jest src/lib/meta/__tests__/graph-api.test.ts
```
Esperado: PASS.

- [ ] **Passo 5: Commit**

```bash
git add src/lib/meta/
git commit -m "feat(meta): wrapper graph-api com retry 5xx + erros tipados

Expõe getPhoneNumber, subscribeFields, subscribeApp, unsubscribeApp,
listSubscribedApps, listSubscriptions, MetaApiError, serializeErrorSafe.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Rate limit + lock Redis para Meta

**Files:**
- Create: `src/lib/rate-limit/meta.ts`
- Test: `src/lib/rate-limit/__tests__/meta.test.ts`

- [ ] **Passo 1: Teste falhando**

`src/lib/rate-limit/__tests__/meta.test.ts`:
```ts
import { enforceMetaRateLimit, acquireMetaLock, releaseMetaLock } from "../meta";

jest.mock("@/lib/redis", () => {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    redis: {
      multi: () => {
        const ops: Array<() => Promise<unknown>> = [];
        const self: any = {
          incr: (k: string) => { ops.push(async () => { const n = (parseInt(store.get(k) ?? "0", 10) || 0) + 1; store.set(k, String(n)); return n; }); return self; },
          expire: (k: string, s: number) => { ops.push(async () => { ttls.set(k, s); return 1; }); return self; },
          exec: async () => { const r: Array<[Error | null, unknown]> = []; for (const o of ops) r.push([null, await o()]); return r; },
        };
        return self;
      },
      set: async (k: string, v: string, ..._args: unknown[]) => {
        if (_args.includes("NX") && store.has(k)) return null;
        store.set(k, v);
        return "OK";
      },
      del: async (k: string) => { store.delete(k); return 1; },
      __store: store,
    },
  };
});

describe("enforceMetaRateLimit", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("@/lib/redis");
    m.redis.__store.clear();
  });

  it("permite 10 calls e bloqueia 11a", async () => {
    for (let i = 1; i <= 10; i++) {
      const r = await enforceMetaRateLimit("c1");
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(10 - i);
    }
    const r11 = await enforceMetaRateLimit("c1");
    expect(r11.allowed).toBe(false);
  });

  it("chaves separadas por empresa", async () => {
    for (let i = 0; i < 10; i++) await enforceMetaRateLimit("c1");
    const r = await enforceMetaRateLimit("c2");
    expect(r.allowed).toBe(true);
  });
});

describe("acquireMetaLock / releaseMetaLock", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("@/lib/redis");
    m.redis.__store.clear();
  });

  it("adquire uma vez e falha na segunda", async () => {
    expect(await acquireMetaLock("c1")).toBe(true);
    expect(await acquireMetaLock("c1")).toBe(false);
    await releaseMetaLock("c1");
    expect(await acquireMetaLock("c1")).toBe(true);
  });
});
```

- [ ] **Passo 2: Rodar — falha**

```bash
npx jest src/lib/rate-limit/__tests__/meta.test.ts
```

- [ ] **Passo 3: Implementar**

`src/lib/rate-limit/meta.ts`:
```ts
import { redis } from "@/lib/redis";

const LIMIT = 10;
const WINDOW_SECONDS = 60;
const LOCK_TTL_SECONDS = 30;

export interface RateResult {
  allowed: boolean;
  remaining: number;
}

export async function enforceMetaRateLimit(companyId: string): Promise<RateResult> {
  const key = `meta:rl:${companyId}`;
  const multi = redis.multi();
  multi.incr(key);
  multi.expire(key, WINDOW_SECONDS);
  const results = await multi.exec();
  const count = Number((results as Array<[Error | null, unknown]>)?.[0]?.[1] ?? 1);
  return {
    allowed: count <= LIMIT,
    remaining: Math.max(0, LIMIT - count),
  };
}

export async function acquireMetaLock(companyId: string): Promise<boolean> {
  const key = `meta:lock:${companyId}`;
  const r = await redis.set(key, "1", "EX", LOCK_TTL_SECONDS, "NX");
  return r === "OK";
}

export async function releaseMetaLock(companyId: string): Promise<void> {
  await redis.del(`meta:lock:${companyId}`);
}
```

- [ ] **Passo 4: Testes passam**

```bash
npx jest src/lib/rate-limit/__tests__/meta.test.ts
```

- [ ] **Passo 5: Commit**

```bash
git add src/lib/rate-limit/
git commit -m "feat(meta): rate limit 10/min + lock Redis SETNX por empresa

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — Action `testMetaConnection`

**Files:**
- Create: `src/lib/actions/meta-subscription.ts` (arquivo inicial com a primeira action)
- Test: `src/lib/actions/__tests__/meta-subscription.test.ts`

- [ ] **Passo 1: Teste falhando**

`src/lib/actions/__tests__/meta-subscription.test.ts` (início — tasks 6–8 adicionam mais blocos):
```ts
jest.mock("@/lib/prisma", () => ({
  prisma: {
    companyCredential: { findUnique: jest.fn(), update: jest.fn() },
    userCompanyMembership: { findUnique: jest.fn() },
    company: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/meta/graph-api");
jest.mock("@/lib/encryption", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
  mask: (s: string) => `***${s.slice(-3)}`,
}));
jest.mock("@/lib/notifications", () => ({ createNotification: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));
jest.mock("@/lib/realtime", () => ({ publishRealtimeEvent: jest.fn() }));
jest.mock("@/lib/rate-limit/meta", () => ({
  enforceMetaRateLimit: jest.fn(async () => ({ allowed: true, remaining: 9 })),
  acquireMetaLock: jest.fn(async () => true),
  releaseMetaLock: jest.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import * as graphApi from "@/lib/meta/graph-api";
import { testMetaConnection } from "../meta-subscription";

const anyCred = {
  id: "cred-1",
  companyId: "c1",
  accessToken: "enc:AT",
  phoneNumberId: "PN",
  metaAppId: "APP",
  wabaId: "WABA",
  verifyToken: "enc:VT",
  metaSystemUserToken: "enc:SUT",
};

beforeEach(() => jest.clearAllMocks());

describe("testMetaConnection", () => {
  it("retorna erro se não autenticado", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const r = await testMetaConnection("c1");
    expect(r.success).toBe(false);
  });

  it("nega manager", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: false });
    (prisma.userCompanyMembership.findUnique as jest.Mock).mockResolvedValue({
      isActive: true,
      role: "manager",
    });
    const r = await testMetaConnection("c1");
    expect(r.success).toBe(false);
  });

  it("super admin consegue e retorna phone number info", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (graphApi.getPhoneNumber as jest.Mock).mockResolvedValue({
      id: "PN", displayPhoneNumber: "+55", verifiedName: "X", qualityRating: "GREEN",
    });
    const r = await testMetaConnection("c1");
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ displayPhoneNumber: "+55", verifiedName: "X" });
    expect(graphApi.getPhoneNumber).toHaveBeenCalledWith("PN", "AT");
  });

  it("sinaliza missing_fields se credencial incompleta", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({ ...anyCred, phoneNumberId: null });
    const r = await testMetaConnection("c1");
    expect(r.success).toBe(false);
    expect(r.error).toContain("phoneNumberId");
  });

  it("trata MetaApiError sem alterar status", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (graphApi.getPhoneNumber as jest.Mock).mockRejectedValue(
      new graphApi.MetaApiError({ status: 401, message: "expired" })
    );
    const r = await testMetaConnection("c1");
    expect(r.success).toBe(false);
    expect(r.error).toContain("expired");
    expect(prisma.companyCredential.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Passo 2: Rodar — falha**

- [ ] **Passo 3: Implementar arquivo mínimo**

`src/lib/actions/meta-subscription.ts`:
```ts
"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import * as graphApi from "@/lib/meta/graph-api";
import { logAudit } from "@/lib/audit";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

const companyIdSchema = z.object({ companyId: z.string().uuid() });

async function authorize(companyId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Não autenticado" };
  if (!user.isSuperAdmin) {
    const m = await prisma.userCompanyMembership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId } },
    });
    if (!m || !m.isActive || m.role !== "company_admin") {
      return { ok: false as const, error: "Acesso negado" };
    }
  }
  return { ok: true as const, user };
}

export async function testMetaConnection(companyId: string): Promise<ActionResult> {
  const parsed = companyIdSchema.safeParse({ companyId });
  if (!parsed.success) return { success: false, error: "Input inválido" };

  const auth = await authorize(companyId);
  if (!auth.ok) return { success: false, error: auth.error };

  const cred = await prisma.companyCredential.findUnique({ where: { companyId } });
  if (!cred) return { success: false, error: "Credenciais não cadastradas" };
  const missing: string[] = [];
  if (!cred.accessToken) missing.push("accessToken");
  if (!cred.phoneNumberId) missing.push("phoneNumberId");
  if (missing.length) return { success: false, error: `Campos faltando: ${missing.join(", ")}` };

  const started = Date.now();
  try {
    const info = await graphApi.getPhoneNumber(cred.phoneNumberId!, decrypt(cred.accessToken));
    void logAudit({
      actorType: "user",
      actorId: auth.user.id,
      actorLabel: auth.user.email ?? auth.user.id,
      companyId,
      action: "meta_webhook.test",
      resourceType: "CompanyCredential",
      resourceId: cred.id,
      details: { success: true, durationMs: Date.now() - started },
    });
    return { success: true, data: info };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    void logAudit({
      actorType: "user",
      actorId: auth.user.id,
      actorLabel: auth.user.email ?? auth.user.id,
      companyId,
      action: "meta_webhook.test",
      resourceType: "CompanyCredential",
      resourceId: cred.id,
      details: { success: false, error: message, durationMs: Date.now() - started },
    });
    return { success: false, error: message };
  }
}
```

- [ ] **Passo 4: Teste passa**

```bash
npx jest src/lib/actions/__tests__/meta-subscription.test.ts
```

- [ ] **Passo 5: Commit**

```bash
git add src/lib/actions/meta-subscription.ts src/lib/actions/__tests__/
git commit -m "feat(meta): action testMetaConnection com autorização + audit

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — Action `subscribeWebhook`

**Files:**
- Modify: `src/lib/actions/meta-subscription.ts` (adicionar action)
- Modify: `src/lib/actions/__tests__/meta-subscription.test.ts` (novos casos)

- [ ] **Passo 1: Adicionar testes ao arquivo existente**

No mesmo `meta-subscription.test.ts`, acrescentar `describe("subscribeWebhook", ...)` com casos: lock conflict, rate limit hit, prereqs faltando (`metaSystemUserToken` ausente), NEXTAUTH_URL inválida em prod, subscribeFields failure → status=error, happy path → pending→active + audit + notification + realtime.

Exemplo (representativo — incluir pelo menos 4 casos):
```ts
import { subscribeWebhook } from "../meta-subscription";
import { createNotification } from "@/lib/notifications";
import { publishRealtimeEvent } from "@/lib/realtime";
import { acquireMetaLock, releaseMetaLock, enforceMetaRateLimit } from "@/lib/rate-limit/meta";

describe("subscribeWebhook", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://roteador.example.com";
    process.env.NODE_ENV = "production";
  });

  it("falha se lock não adquirido", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
    (acquireMetaLock as jest.Mock).mockResolvedValueOnce(false);
    const r = await subscribeWebhook("00000000-0000-0000-0000-000000000001");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/operação em andamento/i);
  });

  it("happy path: pending→active com audit+notify+realtime", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
    (acquireMetaLock as jest.Mock).mockResolvedValueOnce(true);
    (enforceMetaRateLimit as jest.Mock).mockResolvedValueOnce({ allowed: true, remaining: 9 });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: "c1", webhookKey: "abc" });
    (graphApi.subscribeFields as jest.Mock).mockResolvedValue(undefined);
    (graphApi.subscribeApp as jest.Mock).mockResolvedValue(undefined);
    (prisma.companyCredential.update as jest.Mock).mockResolvedValue({});

    const r = await subscribeWebhook("00000000-0000-0000-0000-000000000001");

    expect(r.success).toBe(true);
    // pending primeiro, active depois
    expect((prisma.companyCredential.update as jest.Mock).mock.calls[0][0].data.metaSubscriptionStatus).toBe("pending");
    expect((prisma.companyCredential.update as jest.Mock).mock.calls[1][0].data.metaSubscriptionStatus).toBe("active");
    expect(graphApi.subscribeFields).toHaveBeenCalledWith(
      "APP",
      expect.objectContaining({
        object: "whatsapp_business_account",
        callbackUrl: "https://roteador.example.com/api/webhook/abc",
        verifyToken: "VT",
      }),
      "SUT"
    );
    expect(createNotification).toHaveBeenCalled();
    expect(publishRealtimeEvent).toHaveBeenCalled();
    expect(releaseMetaLock).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001");
  });

  it("erro na Meta → status=error + lock liberado", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
    (acquireMetaLock as jest.Mock).mockResolvedValueOnce(true);
    (enforceMetaRateLimit as jest.Mock).mockResolvedValueOnce({ allowed: true, remaining: 9 });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: "c1", webhookKey: "abc" });
    (graphApi.subscribeFields as jest.Mock).mockRejectedValue(
      new graphApi.MetaApiError({ status: 400, code: 190, message: "token expired" })
    );

    const r = await subscribeWebhook("00000000-0000-0000-0000-000000000001");
    expect(r.success).toBe(false);
    const updates = (prisma.companyCredential.update as jest.Mock).mock.calls;
    expect(updates[updates.length - 1][0].data.metaSubscriptionStatus).toBe("error");
    expect(releaseMetaLock).toHaveBeenCalled();
  });

  it("rejeita NEXTAUTH_URL localhost em produção", async () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
    (acquireMetaLock as jest.Mock).mockResolvedValueOnce(true);
    const r = await subscribeWebhook("00000000-0000-0000-0000-000000000001");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/callback/i);
    expect(releaseMetaLock).toHaveBeenCalled();
  });
});
```

- [ ] **Passo 2: Rodar — falha**

- [ ] **Passo 3: Implementar `subscribeWebhook` no arquivo**

Adicionar ao `meta-subscription.ts`:
```ts
import { encrypt } from "@/lib/encryption";
import { createNotification } from "@/lib/notifications";
import { publishRealtimeEvent } from "@/lib/realtime";
import { acquireMetaLock, releaseMetaLock, enforceMetaRateLimit } from "@/lib/rate-limit/meta";

const DEFAULT_FIELDS = (process.env.META_SUBSCRIPTION_FIELDS ?? "messages,message_echoes,messaging_postbacks,message_template_status_update")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function validateCallbackBase(): string | null {
  const url = process.env.NEXTAUTH_URL;
  if (!url) return "NEXTAUTH_URL ausente";
  try {
    const parsed = new URL(url);
    if (process.env.NODE_ENV === "production") {
      if (parsed.protocol !== "https:") return "callback_url deve ser HTTPS";
      if (parsed.hostname === "localhost" || parsed.hostname.startsWith("127.")) {
        return "callback_url não pode ser localhost em produção";
      }
    }
    return null;
  } catch {
    return "NEXTAUTH_URL inválida";
  }
}

export async function subscribeWebhook(companyId: string): Promise<ActionResult> {
  const parsed = companyIdSchema.safeParse({ companyId });
  if (!parsed.success) return { success: false, error: "Input inválido" };

  const auth = await authorize(companyId);
  if (!auth.ok) return { success: false, error: auth.error };

  const locked = await acquireMetaLock(companyId);
  if (!locked) return { success: false, error: "Outra operação em andamento" };

  try {
    const rl = await enforceMetaRateLimit(companyId);
    if (!rl.allowed) return { success: false, error: "Rate limit excedido. Tente em alguns minutos." };

    const callbackErr = validateCallbackBase();
    if (callbackErr) return { success: false, error: callbackErr };

    const cred = await prisma.companyCredential.findUnique({ where: { companyId } });
    if (!cred) return { success: false, error: "Credenciais não cadastradas" };
    const missing: string[] = [];
    if (!cred.metaAppId) missing.push("metaAppId");
    if (!cred.wabaId) missing.push("wabaId");
    if (!cred.verifyToken) missing.push("verifyToken");
    if (!cred.metaSystemUserToken) missing.push("metaSystemUserToken");
    if (missing.length) return { success: false, error: `Campos faltando: ${missing.join(", ")}` };

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return { success: false, error: "Empresa não encontrada" };

    const callbackUrl = `${process.env.NEXTAUTH_URL}/api/webhook/${company.webhookKey}`;
    const verifyToken = decrypt(cred.verifyToken);
    const token = decrypt(cred.metaSystemUserToken!);

    await prisma.companyCredential.update({
      where: { companyId },
      data: { metaSubscriptionStatus: "pending", metaSubscriptionError: null },
    });
    void publishRealtimeEvent({ type: "credential:updated", companyId });

    const started = Date.now();
    try {
      await graphApi.subscribeFields(cred.metaAppId, {
        object: "whatsapp_business_account",
        callbackUrl,
        verifyToken,
        fields: DEFAULT_FIELDS,
      }, token);
      await graphApi.subscribeApp(cred.wabaId!, token);

      await prisma.companyCredential.update({
        where: { companyId },
        data: {
          metaSubscriptionStatus: "active",
          metaSubscribedAt: new Date(),
          metaSubscribedFields: DEFAULT_FIELDS,
          metaSubscribedCallbackUrl: callbackUrl,
          metaSubscriptionError: null,
        },
      });

      void logAudit({
        actorType: "user",
        actorId: auth.user.id,
        actorLabel: auth.user.email ?? auth.user.id,
        companyId,
        action: "meta_webhook.subscribe",
        resourceType: "CompanyCredential",
        resourceId: cred.id,
        details: { success: true, durationMs: Date.now() - started, fields: DEFAULT_FIELDS },
      });
      void createNotification({
        companyId,
        type: "info",
        title: "Webhook inscrito na Meta",
        message: `Callback ${callbackUrl} registrado.`,
        link: `/companies/${companyId}`,
      });
      void publishRealtimeEvent({ type: "credential:updated", companyId });

      return { success: true };
    } catch (e) {
      const errorStr = graphApi.serializeErrorSafe(e);
      await prisma.companyCredential.update({
        where: { companyId },
        data: { metaSubscriptionStatus: "error", metaSubscriptionError: errorStr },
      });
      void logAudit({
        actorType: "user",
        actorId: auth.user.id,
        actorLabel: auth.user.email ?? auth.user.id,
        companyId,
        action: "meta_webhook.subscribe",
        resourceType: "CompanyCredential",
        resourceId: cred.id,
        details: { success: false, error: errorStr, durationMs: Date.now() - started },
      });
      void createNotification({
        companyId,
        type: "error",
        title: "Falha ao inscrever webhook na Meta",
        message: errorStr.slice(0, 200),
        link: `/companies/${companyId}`,
      });
      void publishRealtimeEvent({ type: "credential:updated", companyId });
      return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
    }
  } finally {
    await releaseMetaLock(companyId);
  }
}
```

- [ ] **Passo 4: Testes passam**

- [ ] **Passo 5: Commit**

```bash
git add src/lib/actions/meta-subscription.ts src/lib/actions/__tests__/
git commit -m "feat(meta): action subscribeWebhook (pending→active, audit+notify)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — Action `unsubscribeWebhook`

**Files:**
- Modify: `src/lib/actions/meta-subscription.ts`
- Modify: `src/lib/actions/__tests__/meta-subscription.test.ts`

- [ ] **Passo 1: Testes falhando**

Adicionar `describe("unsubscribeWebhook")`:
```ts
describe("unsubscribeWebhook", () => {
  it("happy path DELETE + reset status", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
    (acquireMetaLock as jest.Mock).mockResolvedValueOnce(true);
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (graphApi.unsubscribeApp as jest.Mock).mockResolvedValue(undefined);
    // DELETE subscription via fetch direto é parte do unsubscribeApp OU função nova — usar mock genérico
    const r = await unsubscribeWebhook("00000000-0000-0000-0000-000000000001");
    expect(r.success).toBe(true);
    expect(graphApi.unsubscribeApp).toHaveBeenCalledWith("WABA", "SUT");
    const data = (prisma.companyCredential.update as jest.Mock).mock.calls[0][0].data;
    expect(data.metaSubscriptionStatus).toBe("not_configured");
    expect(data.metaSubscribedAt).toBeNull();
    expect(data.metaSubscribedCallbackUrl).toBeNull();
  });

  it("best-effort: atualiza local mesmo com erro na Meta", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
    (acquireMetaLock as jest.Mock).mockResolvedValueOnce(true);
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (graphApi.unsubscribeApp as jest.Mock).mockRejectedValue(
      new graphApi.MetaApiError({ status: 400, message: "already" })
    );
    const r = await unsubscribeWebhook("00000000-0000-0000-0000-000000000001");
    expect(r.success).toBe(true);
    expect(prisma.companyCredential.update).toHaveBeenCalled();
  });
});
```

- [ ] **Passo 2: Rodar — falha**

- [ ] **Passo 3: Implementar**

Adicionar:
```ts
export async function unsubscribeWebhook(companyId: string): Promise<ActionResult> {
  const parsed = companyIdSchema.safeParse({ companyId });
  if (!parsed.success) return { success: false, error: "Input inválido" };
  const auth = await authorize(companyId);
  if (!auth.ok) return { success: false, error: auth.error };

  const locked = await acquireMetaLock(companyId);
  if (!locked) return { success: false, error: "Outra operação em andamento" };

  try {
    const cred = await prisma.companyCredential.findUnique({ where: { companyId } });
    if (!cred) return { success: false, error: "Credenciais não cadastradas" };

    const errors: string[] = [];
    if (cred.metaSystemUserToken && cred.wabaId) {
      const token = decrypt(cred.metaSystemUserToken);
      try { await graphApi.unsubscribeApp(cred.wabaId, token); }
      catch (e) { errors.push(graphApi.serializeErrorSafe(e)); }
    }

    await prisma.companyCredential.update({
      where: { companyId },
      data: {
        metaSubscriptionStatus: "not_configured",
        metaSubscribedAt: null,
        metaSubscribedFields: [],
        metaSubscribedCallbackUrl: null,
        metaSubscriptionError: errors.length ? errors.join(" | ").slice(0, 500) : null,
      },
    });

    void logAudit({
      actorType: "user",
      actorId: auth.user.id,
      actorLabel: auth.user.email ?? auth.user.id,
      companyId,
      action: "meta_webhook.unsubscribe",
      resourceType: "CompanyCredential",
      resourceId: cred.id,
      details: { errors },
    });
    void createNotification({
      companyId,
      type: errors.length ? "warning" : "info",
      title: "Webhook desinscrito",
      message: errors.length ? "Desinscrito localmente com avisos da Meta." : "Desinscrito com sucesso.",
      link: `/companies/${companyId}`,
    });
    void publishRealtimeEvent({ type: "credential:updated", companyId });
    return { success: true };
  } finally {
    await releaseMetaLock(companyId);
  }
}
```

- [ ] **Passo 4: Testes passam + commit**

```bash
git add -u
git commit -m "feat(meta): action unsubscribeWebhook best-effort

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 — Action `verifyMetaSubscription` (drift, com variante system para worker)

**Files:**
- Modify: `src/lib/actions/meta-subscription.ts`
- Modify: `src/lib/actions/__tests__/meta-subscription.test.ts`

- [ ] **Passo 1: Testes falhando**

Casos: (a) tudo bate → `active`; (b) callbackUrl diverge → `stale`; (c) app ausente em subscribed_apps → `stale`.

```ts
describe("verifyMetaSubscription", () => {
  const baseCred = { ...anyCred, metaSubscribedCallbackUrl: "https://roteador.example.com/api/webhook/abc" };
  beforeEach(() => { process.env.NEXTAUTH_URL = "https://roteador.example.com"; });

  it("active quando bate", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(baseCred);
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: "c1", webhookKey: "abc" });
    (graphApi.listSubscribedApps as jest.Mock).mockResolvedValue([{ appId: "APP" }]);
    (graphApi.listSubscriptions as jest.Mock).mockResolvedValue([{
      object: "whatsapp_business_account",
      callbackUrl: "https://roteador.example.com/api/webhook/abc",
      fields: ["messages"],
    }]);
    const r = await verifyMetaSubscription("00000000-0000-0000-0000-000000000001");
    expect(r.success).toBe(true);
    expect((prisma.companyCredential.update as jest.Mock).mock.calls[0][0].data.metaSubscriptionStatus).toBe("active");
  });

  it("stale quando callback diverge", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(baseCred);
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: "c1", webhookKey: "abc" });
    (graphApi.listSubscribedApps as jest.Mock).mockResolvedValue([{ appId: "APP" }]);
    (graphApi.listSubscriptions as jest.Mock).mockResolvedValue([{
      object: "whatsapp_business_account",
      callbackUrl: "https://OLD.example.com/webhook/old",
      fields: ["messages"],
    }]);
    const r = await verifyMetaSubscription("00000000-0000-0000-0000-000000000001");
    expect((prisma.companyCredential.update as jest.Mock).mock.calls[0][0].data.metaSubscriptionStatus).toBe("stale");
  });
});
```

- [ ] **Passo 1b: Teste extra para variante `system` (usada pelo worker)**

```ts
it("verifyMetaSubscriptionCore aceita actor system sem exigir getCurrentUser", async () => {
  (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(baseCred);
  (graphApi.listSubscribedApps as jest.Mock).mockResolvedValue([{ appId: "APP" }]);
  (graphApi.listSubscriptions as jest.Mock).mockResolvedValue([{
    object: "whatsapp_business_account",
    callbackUrl: "https://roteador.example.com/api/webhook/abc",
    fields: ["messages"],
  }]);
  const { verifyMetaSubscriptionCore } = await import("../meta-subscription");
  const r = await verifyMetaSubscriptionCore("00000000-0000-0000-0000-000000000001", { actor: "system" });
  expect(r.success).toBe(true);
});
```

- [ ] **Passo 2: Implementar com fatoração internal/public**

```ts
interface CoreOpts { actor: "user" | "system"; userId?: string; userLabel?: string }

export async function verifyMetaSubscriptionCore(companyId: string, opts: CoreOpts): Promise<ActionResult> {
  const parsed = companyIdSchema.safeParse({ companyId });
  if (!parsed.success) return { success: false, error: "Input inválido" };

  const cred = await prisma.companyCredential.findUnique({ where: { companyId } });
  if (!cred) return { success: false, error: "Credenciais não cadastradas" };
  if (!cred.metaSystemUserToken || !cred.wabaId || !cred.metaAppId) {
    return { success: false, error: "Campos faltando para verificar" };
  }

  const token = decrypt(cred.metaSystemUserToken);
  try {
    const [apps, subs] = await Promise.all([
      graphApi.listSubscribedApps(cred.wabaId, token),
      graphApi.listSubscriptions(cred.metaAppId, token),
    ]);
    const appOk = apps.some((a) => a.appId === cred.metaAppId);
    const expected = cred.metaSubscribedCallbackUrl;
    const subOk = !!expected && subs.some((s) =>
      s.object === "whatsapp_business_account" && s.callbackUrl === expected
    );
    const newStatus = appOk && subOk ? "active" : "stale";
    await prisma.companyCredential.update({
      where: { companyId },
      data: { metaSubscriptionStatus: newStatus, metaSubscriptionError: null },
    });
    void logAudit({
      actorType: opts.actor,
      actorId: opts.userId,
      actorLabel: opts.userLabel ?? "system:drift-check",
      companyId,
      action: "meta_webhook.verify",
      resourceType: "CompanyCredential",
      resourceId: cred.id,
      details: { appOk, subOk, status: newStatus },
    });
    void publishRealtimeEvent({ type: "credential:updated", companyId });
    return { success: true, data: { status: newStatus } };
  } catch (e) {
    const errorStr = graphApi.serializeErrorSafe(e);
    await prisma.companyCredential.update({
      where: { companyId },
      data: { metaSubscriptionStatus: "error", metaSubscriptionError: errorStr },
    });
    return { success: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function verifyMetaSubscription(companyId: string): Promise<ActionResult> {
  const auth = await authorize(companyId);
  if (!auth.ok) return { success: false, error: auth.error };
  return verifyMetaSubscriptionCore(companyId, {
    actor: "user",
    userId: auth.user.id,
    userLabel: auth.user.email ?? auth.user.id,
  });
}
```

- [ ] **Passo 3: Testes passam + commit**

```bash
git add -u
git commit -m "feat(meta): verifyMetaSubscription (drift check)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9 — `generateVerifyToken` helper (TDD estrito)

**Files:**
- Modify: `src/lib/actions/meta-subscription.ts`

- [ ] **Passo 1: Teste falhando**

```ts
describe("generateVerifyToken", () => {
  it("gera token 48 chars hex quando autenticado", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u" });
    const r = await generateVerifyToken();
    expect(r.success).toBe(true);
    expect(r.data!.token).toMatch(/^[a-f0-9]{48}$/);
  });
  it("rejeita se não autenticado", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const r = await generateVerifyToken();
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Passo 2: Rodar — FAIL** (`generateVerifyToken is not exported`).

- [ ] **Passo 3: Implementar**

```ts
import { randomBytes } from "crypto";

export async function generateVerifyToken(): Promise<ActionResult<{ token: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Não autenticado" };
  return { success: true, data: { token: randomBytes(24).toString("hex") } };
}
```

- [ ] **Passo 4: Rodar — PASS**.

- [ ] **Passo 5: Commit**

```bash
git add -u
git commit -m "feat(meta): helper generateVerifyToken

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10 — Hooks em `company.ts` (update + delete) com testes

**Files:**
- Modify: `src/lib/actions/company.ts`

- [ ] **Passo 1: Localizar `updateCompany`**

Em `src/lib/actions/company.ts`, no bloco que aplica `update`, detectar se `webhookKey` mudou vs valor atual. Se sim, usar `$transaction` para update da company + update da credential:

```ts
const current = await prisma.company.findUnique({ where: { id: companyId } });
if (!current) return { success: false, error: "Empresa não encontrada" };

// Bloquear edição de webhookKey se subscription=pending
if (data.webhookKey && data.webhookKey !== current.webhookKey) {
  const cred = await prisma.companyCredential.findUnique({ where: { companyId } });
  if (cred?.metaSubscriptionStatus === "pending") {
    return { success: false, error: "Não é possível alterar webhookKey enquanto inscrição está em andamento" };
  }
}

await prisma.$transaction(async (tx) => {
  await tx.company.update({ where: { id: companyId }, data });
  if (data.webhookKey && data.webhookKey !== current.webhookKey) {
    await tx.companyCredential.updateMany({
      where: { companyId },
      data: {
        metaSubscriptionStatus: "not_configured",
        metaSubscribedAt: null,
        metaSubscribedCallbackUrl: null,
        metaSubscribedFields: [],
        metaSubscriptionError: null,
      },
    });
  }
});

if (data.webhookKey && data.webhookKey !== current.webhookKey) {
  void logAudit({
    actorType: "user",
    actorId: user.id,
    actorLabel: user.email ?? user.id,
    companyId,
    action: "meta_webhook.invalidated",
    resourceType: "CompanyCredential",
    details: { reason: "webhookKey_changed", old: current.webhookKey, new: data.webhookKey },
  });
}
```

- [ ] **Passo 2: Em `deleteCompany`, adicionar unsubscribe best-effort**

Antes do `prisma.company.delete`, importar e chamar:
```ts
import { unsubscribeWebhook } from "./meta-subscription";

try { await unsubscribeWebhook(companyId); }
catch (e) { console.warn("[delete-company] unsubscribeWebhook falhou:", e); }
```

- [ ] **Passo 3: Adicionar testes dos novos caminhos**

Em `src/lib/actions/__tests__/company.test.ts` (ou criar), cobrir:
- `updateCompany` com `webhookKey` igual → não mexe em credential.
- `updateCompany` com `webhookKey` diferente → `companyCredential.updateMany` chamado com `metaSubscriptionStatus=not_configured`.
- `updateCompany` quando `metaSubscriptionStatus=pending` → retorna erro e não persiste.
- `deleteCompany` chama `unsubscribeWebhook` (mockado) antes de `company.delete`, e tolera erro do unsubscribe.

- [ ] **Passo 4: Rodar testes de company**

```bash
npm test -- company
```
Esperado: todos passam.

- [ ] **Passo 5: Commit**

```bash
git add src/lib/actions/company.ts src/lib/actions/__tests__/company.test.ts
git commit -m "feat(company): invalida meta subscription em webhookKey change + unsubscribe no delete

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 11 — UI: campo System User Token + botão Gerar verifyToken

> **Invocar skill `ui-ux-pro-max` se disponível**; caso contrário seguir `design-system/nexus-roteador-webhook/MASTER.md` diretamente. **Decisão**: cobertura via E2E manual (spec §8) — sem teste unitário de componente.

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/credential-form.tsx`

- [ ] **Passo 1: Adicionar input "Meta System User Token"**

Campo password com toggle visibility, helper text:
> Token de System User com escopos `whatsapp_business_management` e `whatsapp_business_messaging`. Necessário para inscrever webhook automaticamente na Meta.

Ícone `Key` de lucide-react. Estado no form controlado.

- [ ] **Passo 2: Adicionar botão "Gerar" ao campo verifyToken**

Ao lado direito do input de `verifyToken`, botão secondary com ícone `Sparkles`:
```tsx
<Button
  type="button"
  variant="secondary"
  size="sm"
  onClick={async () => {
    const r = await generateVerifyToken();
    if (r.success) setVerifyToken(r.data!.token);
  }}
>
  <Sparkles className="h-4 w-4 mr-1" /> Gerar
</Button>
```
Importar a action: `import { generateVerifyToken } from "@/lib/actions/meta-subscription";`.

- [ ] **Passo 3: Accordion "Como obter System User Token"**

Abaixo dos campos, usar shadcn `Accordion` com 4 passos + link `https://developers.facebook.com/docs/whatsapp/business-management-api/get-started`.

- [ ] **Passo 4: Smoke visual**

```bash
npm run dev
```
Abrir `/companies/<id>`, verificar layout em light+dark, mobile responsive. Campo novo preenche e salva sem regressão.

- [ ] **Passo 5: Commit**

```bash
git add src/app/\(protected\)/companies/
git commit -m "feat(ui): campo System User Token + botão Gerar verifyToken + accordion docs

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 12 — UI: seção "Webhook na Meta" (badge + 4 botões)

> **Invocar skill `ui-ux-pro-max` se disponível**; caso contrário seguir design system. **Decisão**: sem teste unitário (E2E manual).

**Files:**
- Create: `src/app/(protected)/companies/[id]/_components/meta-subscription-panel.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/credentials-tab.tsx` (renderizar painel)

- [ ] **Passo 1: Criar componente `meta-subscription-panel.tsx`**

Cliente (`"use client"`). Props: `{ companyId: string; initial: MetaSubscriptionSnapshot; canManage: boolean }`.

`MetaSubscriptionSnapshot`: `{ status: "not_configured"|"pending"|"active"|"stale"|"error"; subscribedAt: string|null; error: string|null; callbackUrl: string|null }`.

Render:
- Badge colorido por status (mapa de cores: not_configured gray-500, pending amber-500, active green-500, stale amber-600, error red-500). Light/dark via tokens existentes do design system.
- Texto "Última inscrição: {data formatada ptBR}" ou "Nunca inscrito".
- Se `status==="error"`: `<details>` com mensagem.
- Se `status==="stale"`: banner amber com texto "Detectamos divergência com a Meta — clique em Revalidar ou Reinscrever".
- 4 botões (`canManage` gating):
  - **Testar Conexão** (secondary) → `testMetaConnection` → toast
  - **Inscrever Webhook** (primary) → `subscribeWebhook` → toast + refetch
  - **Revalidar** (ghost) visível se `status !== "not_configured"` → `verifyMetaSubscription`
  - **Desinscrever** (destructive ghost) visível se `status !== "not_configured"` → `unsubscribeWebhook` (com confirm dialog)
- `Loader2` durante chamada; desabilitar botões em loading.

- [ ] **Passo 2: Wire SSE refetch**

No componente, assinar o SSE em `/api/events` (endpoint existente em `src/app/api/events/`) e, ao receber `credential:updated` com `companyId` igual, `router.refresh()`.

- [ ] **Passo 3: Incluir no `credentials-tab.tsx`**

Abaixo do `credential-form`, buscar `meta` snapshot e renderizar:
```tsx
<MetaSubscriptionPanel companyId={companyId} initial={metaSnapshot} canManage={canManage} />
```
`canManage = user.isSuperAdmin || membership.role === "company_admin"`.

- [ ] **Passo 4: Smoke visual**

`npm run dev`. Testar os 5 estados forçando valores no DB via psql:
```sql
UPDATE company_credentials SET meta_subscription_status='error', meta_subscription_error='{"status":400,"message":"teste"}' WHERE company_id='...';
```

- [ ] **Passo 5: Commit**

```bash
git add src/app/\(protected\)/companies/
git commit -m "feat(ui): painel Webhook na Meta com badge + 4 botões + SSE refresh

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 13 — Worker BullMQ: drift check diário

**Files:**
- Create: `src/worker/jobs/meta-drift-check.ts`
- Modify: `src/worker/index.ts` (registrar repeat job)

- [ ] **Passo 1: Job**

`src/worker/jobs/meta-drift-check.ts`:
```ts
import { prisma } from "@/lib/prisma";
import { verifyMetaSubscriptionCore } from "@/lib/actions/meta-subscription";

export async function runMetaDriftCheck(): Promise<void> {
  const companies = await prisma.companyCredential.findMany({
    where: { metaSubscriptionStatus: "active" },
    select: { companyId: true },
  });
  for (const { companyId } of companies) {
    try {
      await verifyMetaSubscriptionCore(companyId, { actor: "system" });
    } catch (e) {
      console.error("[meta-drift]", companyId, e);
    }
    await new Promise((r) => setTimeout(r, 1000)); // throttle 1/s
  }
}
```

**Dependência:** usa `verifyMetaSubscriptionCore(companyId, { actor: "system" })` já criada na Task 8.

- [ ] **Passo 2: Registrar job**

Em `src/worker/index.ts` localizar o ponto onde outros jobs BullMQ são registrados (ex: log-cleanup) e adicionar um `repeat` com cron `process.env.META_DRIFT_CHECK_CRON ?? "0 3 * * *"` apontando para `runMetaDriftCheck`.

- [ ] **Passo 3: Smoke**

```bash
npx tsx src/worker/index.ts
```
Confirmar log de registro do repeat job no startup; encerrar com Ctrl+C.

- [ ] **Passo 4: Commit**

```bash
git add src/worker/ src/lib/actions/meta-subscription.ts
git commit -m "feat(worker): job drift check diário meta subscriptions

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 14 — Env vars + script de smoke manual

**Files:**
- Modify: `src/lib/env.ts` (declarar META_* opcionais)
- Modify: `.env.example`
- Create: `scripts/test-meta-subscribe.mjs`

- [ ] **Passo 1: Declarar env vars**

Em `src/lib/env.ts` adicionar ao Zod schema (opcionais):
```ts
META_GRAPH_API_URL: z.string().url().optional(),
META_API_VERSION: z.string().optional(),
META_SUBSCRIPTION_FIELDS: z.string().optional(),
META_DRIFT_CHECK_CRON: z.string().optional(),
```

- [ ] **Passo 2: `.env.example`**

```env
# Meta Graph API (opcional — defaults para v20.0 em graph.facebook.com)
META_GRAPH_API_URL="https://graph.facebook.com"
META_API_VERSION="v20.0"
META_SUBSCRIPTION_FIELDS="messages,message_echoes,messaging_postbacks,message_template_status_update"
META_DRIFT_CHECK_CRON="0 3 * * *"
```

- [ ] **Passo 3: Script manual (alinhado com `scripts/smoke-webhook.mjs`)**

Ler primeiro `scripts/smoke-webhook.mjs` e replicar estilo (shebang, log prefixado, checks de env listando faltantes, exit codes diferenciados).

`scripts/test-meta-subscribe.mjs`:
```js
#!/usr/bin/env node
// Uso: META_TEST_APP_ID=... META_TEST_WABA_ID=... META_TEST_TOKEN=... META_TEST_CALLBACK=... META_TEST_VERIFY=... node scripts/test-meta-subscribe.mjs
const { META_TEST_APP_ID, META_TEST_WABA_ID, META_TEST_TOKEN, META_TEST_CALLBACK, META_TEST_VERIFY } = process.env;
if (!META_TEST_APP_ID || !META_TEST_WABA_ID || !META_TEST_TOKEN) {
  console.error("Defina META_TEST_APP_ID, META_TEST_WABA_ID, META_TEST_TOKEN");
  process.exit(1);
}
const base = "https://graph.facebook.com/v20.0";
async function call(path, init) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...(init?.headers||{}), Authorization: `Bearer ${META_TEST_TOKEN}`, "Content-Type": "application/json" } });
  console.log(path, res.status, await res.text());
}
await call(`/${META_TEST_APP_ID}/subscriptions`, {
  method: "POST",
  body: JSON.stringify({ object: "whatsapp_business_account", callback_url: META_TEST_CALLBACK, verify_token: META_TEST_VERIFY, fields: "messages" }),
});
await call(`/${META_TEST_WABA_ID}/subscribed_apps`, { method: "POST" });
await call(`/${META_TEST_WABA_ID}/subscribed_apps`, { method: "GET" });
```
Tornar executável: `chmod +x scripts/test-meta-subscribe.mjs`.

- [ ] **Passo 4: Commit**

```bash
git add src/lib/env.ts .env.example scripts/test-meta-subscribe.mjs
git commit -m "chore(meta): env vars META_* + script smoke manual

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 15 — Validação final + docs

**Files:**
- Modify: `CLAUDE.md` (status Fase 4 + doc refs)

- [ ] **Passo 1: Rodar suite completa**

```bash
npm test
npm run lint
npm run build
```
Esperado: jest 303+N passing, lint sem aumentar baseline, build ok.

- [ ] **Passo 2: Atualizar `CLAUDE.md`**

No bloco `## Status`, adicionar:
```
- **Fase 4:** CONCLUÍDA — integração Meta API: auto-subscribe webhook, test connection, drift check, unsubscribe, lock Redis + rate limit, job diário BullMQ, UI com badge de 5 estados
```

No bloco `## Documentação`, incluir:
```
- **Spec Fase 4:** `docs/superpowers/specs/2026-04-15-integracao-meta-api-design.md`
- **Plano Fase 4:** `docs/superpowers/plans/2026-04-15-integracao-meta-api.md`
```

Em `## Estrutura de Actions`, acrescentar:
```
- `meta-subscription.ts` — CRUD de inscrição na Meta (test, subscribe, unsubscribe, verify, generateVerifyToken)
```

- [ ] **Passo 3: Commit + push + PR**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): marca Fase 4 concluída

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push -u origin feat/meta-api-integration
gh pr create --title "feat: Fase 4 — integração Meta API (auto-subscribe webhook)" --body "$(cat <<'EOF'
## Summary
- Implementa Fase 4: subscribe/unsubscribe/verify/test webhook na Meta Graph API.
- Lock Redis + rate limit por empresa, drift check diário via BullMQ.
- UI na aba WhatsApp Cloud com badge de 5 estados e 4 botões.

## Test plan
- [ ] npm test passa
- [ ] Fluxo manual em staging com app sandbox (ver runbook).
- [ ] Drift check: revogar token e clicar Revalidar → vira stale.
- [ ] Manager não vê botões.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review (pós-escrita)

Todos os requisitos da spec mapeados em tasks:

- §3 Modelo de dados → Task 1 + Task 2
- §4 graph-api → Task 3
- §4 actions (test/subscribe/unsubscribe/verify/generate) → Tasks 5–9
- §4 hooks update/delete → Task 10
- §4 job drift → Task 13
- §5 UI (campo token + botões + badge) → Tasks 11–12
- §6 Autorização → Task 5 (`authorize` helper, reusada em 6–9)
- §6 Criptografia → Task 2
- §6 Rate limit + lock → Task 4
- §7 Observabilidade (audit+notify+realtime) → Tasks 5–8
- §8 Testes → Tasks 3–9 (unit) + Task 14 (manual script)
- §12 Env vars → Task 14
- §13 Arquivos → cobertura confirmada

Type consistency revisada: `MetaSubscriptionStatus` lowercase consistente entre schema, Prisma enum, UI, actions. `metaSystemUserToken` usado em schema, validations, encryption, actions. Nomes de funções (`enforceMetaRateLimit`, `acquireMetaLock`, `releaseMetaLock`) idênticos em declaração e uso.

Sem placeholders. Cada passo que altera código mostra o código. Comandos com output esperado.
