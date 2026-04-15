# Embedded Signup Meta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) tracking. Branch: `feat/embedded-signup-meta` (rebased sobre `feat/meta-api-integration`).

**Goal:** Permitir onboarding automático de WhatsApp Business via popup Meta ("Login com Facebook") em vez de colagem manual de tokens.

**Architecture:** Botão FB SDK abre popup Embedded Signup → retorna `code` + `wabaId` + `phoneNumberId` → callback Next.js `POST /api/meta/oauth/callback` → exchange OAuth → upsert credencial → `subscribeWebhookUnlocked` → toast+refresh.

**Tech Stack:** Facebook JS SDK v20 · Meta Graph API · NextAuth 5 (sessão já existente — **não** usamos NextAuth provider) · Redis (state CSRF) · Prisma v7.

**Referência spec:** `docs/superpowers/specs/2026-04-15-embedded-signup-meta-design.md`.

---

## Convenções

- `ActionResult<T> = { success; data?; error? }`.
- Commits em português, co-autoria Claude.
- `NotificationType`: `info|warning|error` (sem `success`).
- Push/PR apenas na última task.
- UI: seguir `design-system/nexus-roteador-webhook/MASTER.md`; invocar `ui-ux-pro-max` se disponível.

---

## Task 1 — Refator: extrair variantes "Unlocked" de subscribe/unsubscribe

**Files:** Modify `src/lib/actions/meta-subscription.ts` + `src/lib/actions/__tests__/meta-subscription.test.ts`

Objetivo: o callback OAuth precisa chamar subscribe/unsubscribe **dentro** de um lock que ele mesmo adquiriu. Lock não-reentrante. Por isso separamos a lógica central em variantes sem lock.

**Escopo preciso do refator (NÃO deixar pra Task 5):**
- Assinatura: `subscribeWebhookUnlocked(companyId, actor: { actor: "user"|"system"; userId?: string; userLabel?: string }): Promise<ActionResult>`. Idêntica ao `CoreOpts` de `verifyMetaSubscriptionCore`.
- Mover TODA a lógica do `subscribeWebhook` atual (validateCallbackBase, prereqs, rate limit, upserts pending/active/error, logAudit × 2, createNotification × 2, publishRealtimeEvent × 2, decrypt/graphApi calls) pra variante Unlocked.
- Substituir `auth.user.id/email` por `actor.userId/actor.userLabel ?? "system"` nos 2 `logAudit`.
- Wrapper público `subscribeWebhook(companyId)`: `authorize` → `acquireMetaLock` → `subscribeWebhookUnlocked(companyId, { actor:"user", userId:auth.user.id, userLabel:auth.user.email ?? auth.user.id })` → `releaseMetaLock` em finally.

- [ ] **Passo 1**: Refatorar `subscribeWebhook` conforme escopo acima.
- [ ] **Passo 2**: Mesmo escopo completo para `unsubscribeWebhook` → `unsubscribeWebhookUnlocked`.
- [ ] **Passo 3**: Garantir `export` das variantes Unlocked (o callback importará).
- [ ] **Passo 4**: Ajustar testes existentes que continuam passando; adicionar 2 testes novos que passam `actor=system` às variantes Unlocked sem `getCurrentUser` mockado.
- [ ] **Passo 5**: `npm test -- --silent meta-subscription` deve ficar verde.
- [ ] **Passo 6**: Commit:

```bash
git add -u
git commit -m "$(cat <<'EOF'
refactor(meta): extrai subscribe/unsubscribeWebhookUnlocked

Variantes sem lock, consumíveis pelo callback OAuth (Fase 5) que
adquire lock próprio. Actions públicas viram wrappers com lock.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Migration + schema

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20260415130000_add_embedded_signup_fields/migration.sql`

- [ ] **Passo 1**: Adicionar ao model `CompanyCredential`:
```prisma
  accessTokenExpiresAt       DateTime? @map("access_token_expires_at")
  connectedViaEmbeddedSignup Boolean   @default(false) @map("connected_via_embedded_signup")
  connectedAt                DateTime? @map("connected_at")
```

- [ ] **Passo 2**: Migration SQL:
```sql
ALTER TABLE "company_credentials"
  ADD COLUMN "access_token_expires_at" TIMESTAMP(3),
  ADD COLUMN "connected_via_embedded_signup" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "connected_at" TIMESTAMP(3);
```

- [ ] **Passo 3**: `npx prisma format && npx prisma generate` sem erro.

- [ ] **Passo 4**: Commit:
```bash
git add prisma/
git commit -m "feat(db): embedded signup fields em CompanyCredential

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Env vars

**Files:** Modify `src/lib/env.ts`, `.env.example`

- [ ] **Passo 1**: Em `src/lib/env.ts`, adicionar ao Zod schema:
```ts
META_APP_ID: z.string().optional(),
META_APP_SECRET: z.string().optional(),
META_EMBEDDED_SIGNUP_CONFIG_ID: z.string().optional(),
```

- [ ] **Passo 2**: `.env.example`:
```env
# Embedded Signup Meta (opcional — habilita fluxo OAuth)
META_APP_ID=""
META_APP_SECRET=""
META_EMBEDDED_SIGNUP_CONFIG_ID=""
```

- [ ] **Passo 3**: Commit.

---

## Task 4 — `lib/meta/oauth.ts` (TDD)

**Files:** Create `src/lib/meta/oauth.ts` + `src/lib/meta/__tests__/oauth.test.ts`

Expor:
- `exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; tokenType: string; expiresIn?: number }>`
- `exchangeForLongLivedToken(shortToken: string): Promise<{ accessToken: string; expiresIn: number }>`
- `validateBusinessAccess(token: string, wabaId: string, phoneNumberId: string): Promise<void>` — throws `MetaApiError` se falhar.

Base URL/versão reutilizar helpers de `graph-api.ts` (importar `baseUrl` ou replicar lógica mínima).

- [ ] **Passo 1**: Criar teste com mocks de `fetch` cobrindo:
  - `exchangeCode` happy path (POST `/oauth/access_token` com body `{ client_id, client_secret, redirect_uri, code }` → 200).
  - `exchangeForLongLivedToken` (GET `/oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token=...`) → 200.
  - `validateBusinessAccess` sucesso (GET `/me/businesses` contém WABA, `/{phone}` retorna 200).
  - Falha `validateBusinessAccess` quando WABA não listado → `MetaApiError`.
  - Falha 4xx exchange → `MetaApiError`.

- [ ] **Passo 2**: Rodar FAIL.

- [ ] **Passo 3**: Implementar. Exemplo:
```ts
import { MetaApiError } from "./graph-api";

const DEFAULT_BASE = "https://graph.facebook.com";
const DEFAULT_VERSION = "v20.0";

function baseUrl(): string {
  return `${process.env.META_GRAPH_API_URL ?? DEFAULT_BASE}/${process.env.META_API_VERSION ?? DEFAULT_VERSION}`;
}

function appCreds() {
  const id = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!id || !secret) throw new Error("META_APP_ID / META_APP_SECRET ausentes");
  return { id, secret };
}

async function parseOrThrow(res: Response): Promise<unknown> {
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (res.status >= 400) {
    const e = (json as { error?: { code?: number; message?: string; fbtrace_id?: string } } | null)?.error ?? {};
    throw new MetaApiError({
      status: res.status,
      code: typeof e.code === "number" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : `HTTP ${res.status}`,
      fbtraceId: typeof e.fbtrace_id === "string" ? e.fbtrace_id : undefined,
    });
  }
  return json;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { id, secret } = appCreds();
  const url = new URL(`${baseUrl()}/oauth/access_token`);
  url.searchParams.set("client_id", id);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);
  const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
  const raw = (await parseOrThrow(res)) as { access_token: string; token_type?: string; expires_in?: number };
  return { accessToken: raw.access_token, tokenType: raw.token_type ?? "bearer", expiresIn: raw.expires_in };
}

export async function exchangeForLongLivedToken(shortToken: string) {
  const { id, secret } = appCreds();
  const url = new URL(`${baseUrl()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", id);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("fb_exchange_token", shortToken);
  const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
  const raw = (await parseOrThrow(res)) as { access_token: string; expires_in: number };
  return { accessToken: raw.access_token, expiresIn: raw.expires_in };
}

export async function validateBusinessAccess(token: string, wabaId: string, phoneNumberId: string): Promise<void> {
  // Duas chamadas diretas O(1): se 200 OK, o token tem acesso a esses recursos.
  const wabaRes = await fetch(`${baseUrl()}/${encodeURIComponent(wabaId)}?fields=id,name`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  await parseOrThrow(wabaRes);

  const phoneRes = await fetch(`${baseUrl()}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  await parseOrThrow(phoneRes);
}
```

- [ ] **Passo 4**: PASS + commit.

---

## Task 5 — `POST /api/meta/oauth/callback`

**Files:** Create `src/app/api/meta/oauth/callback/route.ts` + `__tests__/route.test.ts`

Implementa o fluxo §6 da spec. Ponto crítico: usa `subscribeWebhookUnlocked` / `unsubscribeWebhookUnlocked`.

- [ ] **Passo 1**: Testes (mock `lib/meta/oauth`, prisma, lib/auth, rate-limit, lib/meta/graph-api):
  - 401 sem sessão.
  - 403 se user não é admin/super.
  - 403 se state Redis ausente/divergente.
  - 403 se Origin header mismatch.
  - 409 se lock não adquirido.
  - Happy path: exchange → exchangeLongLived → validate → upsert → subscribe → retorno `{ wabaId, phoneNumberId }`.
  - Reconexão com WABA diferente chama `unsubscribeWebhookUnlocked` antes do upsert.

- [ ] **Passo 2**: Implementar route handler. Esqueleto:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/encryption";
import { exchangeCode, exchangeForLongLivedToken, validateBusinessAccess } from "@/lib/meta/oauth";
import { acquireMetaLock, releaseMetaLock, enforceMetaRateLimit } from "@/lib/rate-limit/meta";
import { subscribeWebhookUnlocked, unsubscribeWebhookUnlocked } from "@/lib/actions/meta-subscription";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { publishRealtimeEvent } from "@/lib/realtime";
import { redis } from "@/lib/redis";
import { randomBytes } from "crypto";
import { serializeErrorSafe } from "@/lib/meta/graph-api";

const bodySchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(1),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  state: z.string().min(16),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Origin check
  const origin = req.headers.get("origin");
  if (!origin || origin !== process.env.NEXTAUTH_URL) {
    return NextResponse.json({ error: "Origin inválido" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Input inválido" }, { status: 400 });
  const { companyId, code, wabaId, phoneNumberId, state } = parsed.data;

  // Autorização
  if (!user.isSuperAdmin) {
    const m = await prisma.userCompanyMembership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId } },
    });
    if (!m || !m.isActive || m.role !== "company_admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  }

  // State
  const stateKey = `meta:oauth:state:${user.id}:${companyId}`;
  const stored = await redis.get(stateKey);
  if (!stored || stored !== state) {
    return NextResponse.json({ error: "State inválido" }, { status: 403 });
  }
  await redis.del(stateKey);

  const rl = await enforceMetaRateLimit(companyId);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const locked = await acquireMetaLock(companyId);
  if (!locked) return NextResponse.json({ error: "Operação em andamento" }, { status: 409 });

  try {
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/meta/oauth/callback`;
    const short = await exchangeCode(code, redirectUri);
    const long = await exchangeForLongLivedToken(short.accessToken);
    await validateBusinessAccess(long.accessToken, wabaId, phoneNumberId);

    const existing = await prisma.companyCredential.findUnique({ where: { companyId } });
    if (existing?.wabaId && existing.wabaId !== wabaId) {
      await unsubscribeWebhookUnlocked(companyId, {
        actor: "user",
        userId: user.id,
        userLabel: user.email ?? user.id,
      });
    }

    const expiresAt = new Date(Date.now() + long.expiresIn * 1000);
    await prisma.companyCredential.upsert({
      where: { companyId },
      update: {
        accessToken: encrypt(long.accessToken),
        accessTokenExpiresAt: expiresAt,
        wabaId,
        phoneNumberId,
        connectedViaEmbeddedSignup: true,
        connectedAt: new Date(),
      },
      create: {
        companyId,
        metaAppId: process.env.META_APP_ID!,
        metaAppSecret: encrypt(process.env.META_APP_SECRET!),
        verifyToken: encrypt(randomBytes(24).toString("hex")),
        accessToken: encrypt(long.accessToken),
        accessTokenExpiresAt: expiresAt,
        wabaId,
        phoneNumberId,
        connectedViaEmbeddedSignup: true,
        connectedAt: new Date(),
      },
    });

    void subscribeWebhookUnlocked(companyId, {
      actor: "user",
      userId: user.id,
      userLabel: user.email ?? user.id,
    }).catch((e) => console.error("[embedded-signup] subscribe falhou:", e));

    void logAudit({
      actorType: "user",
      actorId: user.id,
      actorLabel: user.email ?? user.id,
      companyId,
      action: "meta_embedded_signup.connected",
      resourceType: "CompanyCredential",
      details: { wabaId, phoneNumberId },
    });
    void createNotification({
      companyId,
      type: "info",
      title: "WhatsApp conectado via Embedded Signup",
      message: `WABA ${wabaId} vinculada.`,
      link: `/companies/${companyId}`,
    });
    void publishRealtimeEvent({ type: "credential:updated", companyId });

    return NextResponse.json({ success: true, data: { wabaId, phoneNumberId } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : serializeErrorSafe(e) },
      { status: 500 }
    );
  } finally {
    await releaseMetaLock(companyId);
  }
}
```

- [ ] **Passo 3**: PASS + commit.

---

## Task 6 — Action `startEmbeddedSignup` + state gen

**Files:** Create `src/lib/actions/meta-embedded-signup.ts` + testes

Retorna dados públicos pro client (appId, configId, redirectUri, state) + salva `state` em Redis 10min.

- [ ] **Passo 1**: Implementar:

```ts
"use server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redis } from "@/lib/redis";

type Result = { success: boolean; data?: { appId: string; configId: string; redirectUri: string; state: string }; error?: string };

export async function startEmbeddedSignup(companyId: string): Promise<Result> {
  const parsed = z.string().uuid().safeParse(companyId);
  if (!parsed.success) return { success: false, error: "Input inválido" };

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Não autenticado" };

  if (!user.isSuperAdmin) {
    const m = await prisma.userCompanyMembership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId } },
    });
    if (!m || !m.isActive || m.role !== "company_admin") {
      return { success: false, error: "Acesso negado" };
    }
  }

  const appId = process.env.META_APP_ID;
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
  if (!appId || !configId) return { success: false, error: "Embedded Signup não configurado" };

  const state = randomBytes(24).toString("hex");
  const key = `meta:oauth:state:${user.id}:${companyId}`;
  await redis.set(key, state, "EX", 600);

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/meta/oauth/callback`;
  return { success: true, data: { appId, configId, redirectUri, state } };
}
```

- [ ] **Passo 2**: Teste simples validando: sem user → erro; sem env → erro; happy path retorna state persistido no Redis mock.

- [ ] **Passo 3**: Commit.

---

## Task 7 — Client component `embedded-signup-button.tsx`

**Files:** Create `src/app/(protected)/companies/[id]/_components/embedded-signup-button.tsx`

Componente client. **Fluxo correto Meta Embedded Signup**:

1. Mount: carregar FB SDK via `<Script src="https://connect.facebook.net/en_US/sdk.js" strategy="lazyOnload" />`.
2. No click: chamar `startEmbeddedSignup` pra obter `{appId, configId, state}`.
3. **Registrar `window.addEventListener("message", handler)` ANTES de `FB.login`**. Handler filtra `event.origin === "https://www.facebook.com"` e aceita quando `event.data?.type === "WA_EMBEDDED_SIGNUP"`. Payload: `{ event: "FINISH", data: { phone_number_id, waba_id } }` — guardar em `ref` (`sessionDataRef`).
4. `FB.login(cb, { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } })`.
5. Callback do `FB.login` entrega `response.authResponse.code`. Aguardar até `sessionDataRef.current` estar populado (pode já estar quando cb é chamado; se não, aguardar até timeout 30s).
6. Quando tiver `{code, waba_id, phone_number_id, state}`, POST `/api/meta/oauth/callback`.
7. Cleanup: `removeEventListener("message", ...)` após conclusão/erro.

Esqueleto:

```tsx
"use client";
import { useRef, useState } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { Facebook, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { startEmbeddedSignup } from "@/lib/actions/meta-embedded-signup";

declare global {
  interface Window {
    FB?: {
      init: (opts: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        cb: (resp: { authResponse?: { code?: string }; status: string }) => void,
        opts: { config_id: string; response_type: string; override_default_response_type: boolean; extras?: Record<string, unknown> }
      ) => void;
    };
  }
}

interface WASessionData { phone_number_id: string; waba_id: string }

export function EmbeddedSignupButton({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const sessionDataRef = useRef<WASessionData | null>(null);

  async function onClick() {
    setLoading(true);
    const controller = new AbortController();
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      try {
        const parsed = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (parsed?.type === "WA_EMBEDDED_SIGNUP" && parsed?.event === "FINISH") {
          sessionDataRef.current = parsed.data;
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("message", messageHandler);

    try {
      const start = await startEmbeddedSignup(companyId);
      if (!start.success) throw new Error(start.error);
      const { appId, configId, state } = start.data!;

      if (!window.FB) throw new Error("Facebook SDK não carregou");
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v20.0" });

      window.FB.login(
        async (resp) => {
          try {
            if (!resp.authResponse?.code) throw new Error("Login cancelado");
            const code = resp.authResponse.code;

            // Aguardar postMessage com waba_id/phone_number_id (até 30s).
            const deadline = Date.now() + 30_000;
            while (!sessionDataRef.current && Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 200));
            }
            if (!sessionDataRef.current) throw new Error("Dados Meta não chegaram no tempo");

            const { waba_id, phone_number_id } = sessionDataRef.current;
            const res = await fetch("/api/meta/oauth/callback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ companyId, code, wabaId: waba_id, phoneNumberId: phone_number_id, state }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error ?? "Falha");
            toast.success("WhatsApp conectado!");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro");
          } finally {
            window.removeEventListener("message", messageHandler);
            sessionDataRef.current = null;
            setLoading(false);
          }
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {} },
        }
      );
    } catch (e) {
      window.removeEventListener("message", messageHandler);
      toast.error(e instanceof Error ? e.message : "Erro");
      setLoading(false);
    }
    void controller;
  }

  return (
    <>
      <Script src="https://connect.facebook.net/en_US/sdk.js" strategy="lazyOnload" />
      <Button onClick={onClick} disabled={loading} variant="default">
        {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Facebook className="h-4 w-4 mr-2" />}
        Conectar WhatsApp com Facebook
      </Button>
    </>
  );
}
```

- [ ] **Passo 1**: Criar componente. Sem teste unitário (E2E manual).

- [ ] **Passo 2**: Commit.

---

## Task 8 — Integrar no `credential-form.tsx`

- [ ] **Passo 1**: Importar e renderizar `<EmbeddedSignupButton companyId={companyId} />` no topo do form, envolto em `{hasEmbeddedSignup && ...}` onde `hasEmbeddedSignup = process.env.NEXT_PUBLIC_META_APP_ID || (server-side: verify envs exist)`.

**Trick**: como `process.env.META_APP_ID` é server-only, expor via `NEXT_PUBLIC_META_APP_ID`? Não — melhor passar flag via prop do server component pai (`credentials-tab.tsx`) consultando env no servidor. Renomear prop se necessário.

- [ ] **Passo 2**: Renderizar banner explicativo acima dos campos manuais: "Prefira o fluxo automático ao lado — os campos abaixo são preenchidos automaticamente."

- [ ] **Passo 3**: Build + smoke.

- [ ] **Passo 4**: Commit.

---

## Task 9 — Runbook + CLAUDE.md + PR

- [ ] **Passo 1**: Criar `docs/runbooks/embedded-signup-setup.md`. Passos obrigatórios:
  1. developers.facebook.com → Create App → tipo **Business** → nomear e associar BM.
  2. Add Product → **Facebook Login for Business**.
  3. Add Product → **WhatsApp** → Get Started → vincular WABA de teste.
  4. App Settings → Basic → copiar **App ID** e **App Secret** → `.env.production`: `META_APP_ID`, `META_APP_SECRET`.
  5. Facebook Login for Business → Configurations → Create → tipo **WhatsApp Embedded Signup** → permissões `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management` → salvar → copiar **Config ID** → `META_EMBEDDED_SIGNUP_CONFIG_ID`.
  6. App Settings → Basic → **App Domains** adicionar `roteadorwebhook.nexusai360.com`.
  7. Facebook Login for Business → Settings → **Valid OAuth Redirect URIs** incluir `https://roteadorwebhook.nexusai360.com/api/meta/oauth/callback`.
  8. **Modo dev**: App Roles → Test Users. **Modo prod**: completar Business Verification (pode levar dias).
  9. App Review → submeter permissões `whatsapp_business_management` + `whatsapp_business_messaging` + `business_management` para review Meta.

- [ ] **Passo 1.1**: PR desta fase deve apontar base para `feat/meta-api-integration` (não `main`) enquanto Fase 4 não foi mergeada — ou aguardar merge de Fase 4.

- [ ] **Passo 2**: Atualizar `CLAUDE.md`:
  - Em `## Status` adicionar: `- **Fase 5:** CONCLUÍDA — Embedded Signup Meta: onboarding OAuth via popup FB SDK, exchange + validate business access, auto-subscribe via Fase 4, token 60d persistido (sem rotação automática — plano futuro)`.
  - Em `## Estrutura de Actions`: `- meta-embedded-signup.ts — startEmbeddedSignup (state + config pública)`.
  - Em `## Documentação`: adicionar spec + plano da fase 5, runbook.
  - Em `## Próximo Passo`: atualizar para "Rotação automática de tokens 60d (refresh pré-expiração + job BullMQ)".

- [ ] **Passo 3**: Suite completa:
```bash
npm test
npm run lint
npm run build
```

- [ ] **Passo 4**: Commit + push + PR:
```bash
git push -u origin feat/embedded-signup-meta
gh pr create --title "feat: Fase 5 — Embedded Signup Meta" --body "$(cat <<'EOF'
## Summary
- Onboarding automático via popup Facebook Login for Business.
- Exchange code → long-lived user token (60d) + validate business access.
- Upsert credencial + auto-subscribe (Fase 4).
- Runbook Meta setup incluído.

## Test plan
- [x] Jest + build verdes
- [ ] Staging: configurar META_APP_ID + CONFIG_ID, testar popup → credencial preenchida → webhook active
- [ ] Verificar token 60d persistido e `accessTokenExpiresAt` populado
- [ ] Reconexão com outra WABA remove subscription antiga

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Self-review

- Task 1 refator → Task 5 depende — ordem mantida.
- Sem override silencioso de credenciais manuais.
- Lock único por callback; variantes Unlocked evitam deadlock.
- State HMAC 10min + Origin check.
- Expiração 60d persistida mas não automatizada (escopo futuro — spec §13).
- Nenhum teste unitário de componente (E2E manual).
