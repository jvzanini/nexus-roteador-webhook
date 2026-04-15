# Spec — Integração Meta Graph API (auto-subscribe webhook)

**Data:** 2026-04-15
**Autor:** Claude (via brainstorming autônomo)
**Fase:** 4 — Integração Meta API
**Status:** Aprovada (reviews #1 + #2 aplicados)

## 1. Contexto e Problema

Onboarding de empresa exige trabalho manual no painel Meta (app → system user → webhooks → fields → subscribe WABA). Passos falham silenciosamente (typos) e o usuário descobre quando mensagens não chegam.

**Objetivo:** reduzir os passos 4–6 a um clique "Inscrever na Meta" e fornecer "Testar Conexão" para validar 1–3.

## 2. Escopo

### In-scope
- Campo criptografado `metaSystemUserToken` em `CompanyCredential`.
- Helper UI "Gerar" para `verifyToken` (campo já existe).
- Wrapper Meta Graph API (`src/lib/meta/graph-api.ts`) com timeout, retry 5xx e erros tipados.
- Server actions em `src/lib/actions/meta-subscription.ts`:
  - `testMetaConnection(companyId)`
  - `subscribeWebhook(companyId)`
  - `unsubscribeWebhook(companyId)`
  - `verifyMetaSubscription(companyId)` (drift check)
  - `generateVerifyToken()` (helper UI)
- Persistência: `metaSubscriptionStatus`, `metaSubscribedAt`, `metaSubscriptionError`, `metaSubscribedFields`, `metaSubscribedCallbackUrl` (snapshot).
- Hooks: `updateCompany` (mudança de `webhookKey` invalida), `deleteCompany` (unsubscribe best-effort antes do delete).
- Lock Redis `meta:lock:{companyId}` (SETNX TTL 30s) contra subscribe concorrente + rate limit 10/min.
- Drift auto-check: (a) botão "Revalidar" UI; (b) job BullMQ diário para empresas `active`; (c) on-open da aba se `metaSubscribedAt > 24h`.
- UI: badge + botões Testar/Inscrever/Desinscrever/Revalidar + accordion docs.
- Audit + notification por operação.

### Out-of-scope (fases futuras)
- Embedded Signup Meta (OAuth).
- Rotação automática de tokens.
- Múltiplos phone numbers por WABA.
- UI de histórico/timeline de subscriptions.

## 3. Modelo de Dados

Migration Prisma `add_meta_subscription_state`:

```prisma
model CompanyCredential {
  // existentes mantidos
  metaSystemUserToken       String?   // AES-256-GCM
  metaSubscriptionStatus    MetaSubscriptionStatus @default(not_configured)
  metaSubscribedAt          DateTime?
  metaSubscriptionError     String?   // JSON allowlisted, <=500 chars
  metaSubscribedFields      String[]  @default([])
  metaSubscribedCallbackUrl String?   // snapshot da URL inscrita; detecta drift se webhookKey mudar
}

enum MetaSubscriptionStatus {
  not_configured
  pending
  active
  stale
  error
}
```

Estender `ENCRYPTED_FIELDS` (`credential.ts`) com `metaSystemUserToken`. Estender `upsertCredentialSchema` (`validations/credential.ts`) com o novo campo opcional (1–500 chars). `getCredential` mascara o campo.

## 4. Arquitetura

```
┌────────────────────────────┐
│ credentials-tab.tsx (UI)   │
│  [Testar][Inscrever]       │
│  [Revalidar][Desinscrever] │
│  badge estado              │
└─────────────┬──────────────┘
              │ server actions
              ▼
┌────────────────────────────┐
│ lib/actions/                │
│  meta-subscription.ts       │
│   testMetaConnection()      │
│   subscribeWebhook()        │
│   unsubscribeWebhook()      │
│   verifyMetaSubscription()  │
│   generateVerifyToken()     │
└─────────────┬──────────────┘
              │ usa encryption, logAudit, createNotification, publishRealtimeEvent
              ▼
┌────────────────────────────┐
│ lib/meta/graph-api.ts       │
│   getPhoneNumber()          │
│   subscribeApp()            │
│   subscribeFields()         │
│   unsubscribeApp()          │
│   listSubscribedApps()      │
│   listSubscriptions()       │
│   MetaApiError + serializeErrorSafe│
└─────────────┬──────────────┘
              │ fetch + AbortSignal.timeout(8s) + 1 retry 5xx
              ▼
      graph.facebook.com/v20.0
```

### `lib/meta/graph-api.ts`
Puro, sem I/O DB. Recebe token. Retry apenas em 5xx/network, máximo 1, total ≤20s. `4xx` falha imediata.
`MetaApiError = { status, code?, subcode?, message, fbtraceId? }`.
`serializeErrorSafe(err)`: allowlist `{status, code, subcode, message, fbtraceId}` → JSON truncado a 500 chars.

### `lib/actions/meta-subscription.ts`

Todas as actions:
1. `getCurrentUser()` → 401 se guest.
2. Autorização (ver §6).
3. Zod validate input.

#### `testMetaConnection(companyId)`
- Carrega credencial; prereqs: `accessToken`, `phoneNumberId`.
- `decrypt(accessToken)` → `getPhoneNumber(phoneNumberId, accessToken)`.
- Retorna `{ displayPhoneNumber, verifiedName, qualityRating }`.
- Audit `meta_webhook.test`.
- **Não** altera status.

#### `subscribeWebhook(companyId)` — passos lineares
1. Adquire lock Redis `meta:lock:{companyId}` (SETNX TTL 30s). Falha → `{ error:"concurrent_operation" }`.
2. Rate limit. Falha → `{ error:"rate_limited" }`.
3. Valida `NEXTAUTH_URL` (HTTPS + não-localhost em `NODE_ENV=production`). Falha → `{ error:"invalid_callback_url" }`.
4. Carrega credencial; prereqs: `metaAppId`, `wabaId`, `verifyToken`, `metaSystemUserToken`. Lista faltantes no retorno.
5. Decripta `verifyToken` e `metaSystemUserToken`.
6. `update(status=pending, metaSubscriptionError=null)` (commit antes das chamadas externas, para UI).
7. `publishRealtimeEvent` pending.
8. `callbackUrl = ${NEXTAUTH_URL}/api/webhook/${company.webhookKey}`.
9. `subscribeFields(appId, { object:"whatsapp_business_account", callback_url:callbackUrl, verify_token:verifyToken, fields:DEFAULT_FIELDS }, token)`. Meta dispara GET challenge ao `callbackUrl`; handler lê `verifyToken` do DB (já commitado).
10. `subscribeApp(wabaId, token)`.
11. `update(status=active, metaSubscribedAt=now(), metaSubscribedFields, metaSubscribedCallbackUrl=callbackUrl, metaSubscriptionError=null)`.
12. `logAudit` success. `createNotification` success. `publishRealtimeEvent` active.
13. Libera lock.

**Erro em qualquer passo 8–10**: `update(status=error, metaSubscriptionError=serializeErrorSafe(err))`. Audit fail. Notification type error. Libera lock. Retorna `{ success:false, error:userFriendly(err) }`.

`logAudit` é try/catch isolado — falha nele não propaga.

#### `unsubscribeWebhook(companyId)`
- Prereqs: `metaAppId`, `wabaId`, `metaSystemUserToken`.
- `unsubscribeApp(wabaId, token)` (DELETE `/{waba-id}/subscribed_apps`).
- DELETE `/{app-id}/subscriptions?object=whatsapp_business_account`.
- `update(status=not_configured, metaSubscribedAt=null, metaSubscribedFields=[], metaSubscribedCallbackUrl=null, metaSubscriptionError=null)`.
- Audit `meta_webhook.unsubscribe`. Notification. Realtime.
- Best-effort: erros Meta logados mas status atualizado localmente (usuário quer limpar nossa ponta de qualquer jeito).

#### `verifyMetaSubscription(companyId)` (drift)
- `listSubscribedApps(wabaId, token)` + `listSubscriptions(appId, token)`.
- Reconciliação:
  - App não está inscrito na WABA OU `callback_url` atual ≠ `metaSubscribedCallbackUrl` snapshot → `status=stale`, notification warning.
  - Tudo bate → `status=active` (no-op se já).
- Audit `meta_webhook.verify`.

#### `generateVerifyToken()`
Retorna `crypto.randomBytes(24).toString('hex')`. Client-side UI consome.

### Hooks em outras actions
- `updateCompany` — se `webhookKey` mudar: `$transaction` seta `metaSubscriptionStatus=not_configured`, `metaSubscribedAt=null`, `metaSubscribedCallbackUrl=null`. Bloqueia edição se `status=pending`. Audit `meta_webhook.invalidated`.
- `deleteCompany` — antes do delete, tenta `unsubscribeWebhook` best-effort (try/catch, log, segue). Evita assinatura órfã na Meta.

### Job BullMQ `meta-subscription-drift-check`
- Cron diário. Itera empresas com `metaSubscriptionStatus=active`. Para cada, chama `verifyMetaSubscription`. Throttle 1/s.

**`DEFAULT_FIELDS`**: `["messages","message_echoes","messaging_postbacks","message_template_status_update"]`. Override via env `META_SUBSCRIPTION_FIELDS` (CSV).

## 5. UI/UX (implementação via skill ui-ux-pro-max)

Aba "WhatsApp Cloud":

- **Campo novo** "Meta System User Token" após `accessToken`, password + toggle + helper text sobre escopos.
- **`verifyToken`** ganha botão **Gerar** (secondary).
- **Seção "Webhook na Meta"** abaixo:
  - Badge:
    - `not_configured` cinza
    - `pending` amarelo com spinner
    - `active` verde
    - `stale` amarelo alerta
    - `error` vermelho
  - `metaSubscribedAt` formatado ptBR via `date-fns`.
  - `error`: `<details>` colapsável com `metaSubscriptionError`.
  - `stale`: banner "Detectamos divergência com a Meta — clique Revalidar ou Reinscrever".
  - Botões:
    - **Testar Conexão** (secondary)
    - **Inscrever Webhook** (primary) — desabilitado se prereqs faltantes; tooltip lista
    - **Revalidar** (ghost) — só se `status ∈ {active, stale, error}`
    - **Desinscrever** (destructive ghost) — só se `status ∈ {active, stale, error, pending}`
  - Todos com `Loader2` durante chamada. Toasts.
  - Mobile: botões empilham.
- **Accordion "Como obter o System User Token"** (4 passos + link Meta docs).

Manager/viewer não veem a seção.

Visual segue `design-system/nexus-roteador-webhook/MASTER.md`. Implementação via `ui-ux-pro-max`.

SSE real-time: listener em `credentials-tab.tsx` para `credential:updated` atualiza badge sem reload.

## 6. Segurança e Autorização

### Autorização
Padrão de `credential.ts`:
```ts
if (!user.isSuperAdmin) {
  const m = await prisma.userCompanyMembership.findUnique(...)
  if (!m || !m.isActive || m.role !== "company_admin") return deny;
}
```

### Criptografia
`metaSystemUserToken` via `encrypt()`/`decrypt()` de `src/lib/encryption.ts`. Mascarado em reads.

### Erro sanitizado
`serializeErrorSafe` allowlist — jamais headers, body bruto, query strings.

### Rate limit + Lock
- `src/lib/rate-limit/meta.ts` (10 req/min/empresa).
- Lock Redis `meta:lock:{companyId}` SETNX TTL 30s para operações write (subscribe/unsubscribe/verify).

### Validação
Zod em todas actions. `NEXTAUTH_URL` validada em produção (HTTPS + não-localhost).

### Logging
Prefix `[meta-api]`. Nunca tokens. Ok `phoneNumberId`, `wabaId`, `appId`, `fbtraceId`.

## 7. Observabilidade

`AuditLog.action` novos:
- `meta_webhook.subscribe`
- `meta_webhook.unsubscribe`
- `meta_webhook.verify`
- `meta_webhook.invalidated`
- `meta_webhook.test`

`resourceType="CompanyCredential"`, `resourceId=credential.id`. Metadata: `{ durationMs, fbtraceId?, errorCode? }`.
`publishRealtimeEvent({ type:"credential:updated", companyId })` em toda mudança de status.

## 8. Testes

### Unitários (Jest)
- `lib/meta/__tests__/graph-api.test.ts`: mock `fetch` — 200, 4xx, 5xx+retry, timeout, `MetaApiError` shape, `serializeErrorSafe` allowlist, `listSubscribedApps` parsing.
- `lib/actions/__tests__/meta-subscription.test.ts`: Prisma mock — autorização, lock, rate-limit, prereqs, pending→active, erro→error, unsubscribe, drift (stale), hooks update/delete.
- `lib/rate-limit/__tests__/meta.test.ts`: Redis mock — limite, reset.
- Handler webhook: teste que challenge GET usa `verifyToken` descriptografado atual do DB (integrar no teste existente).

### Manual
- `scripts/test-meta-subscribe.mjs` consumindo envs `META_TEST_*`. Fora do CI.

### E2E manual
- Staging: empresa teste → Inscrever → mensagem sandbox → log. Revogar token na Meta → Revalidar → `stale`. Desinscrever → `not_configured`. Apagar empresa → validar Meta dashboard sem lixo.

## 9. Rollout

1. PR único.
2. CI: jest + lint + next build.
3. Merge → deploy Portainer.
4. Migration via psql no container db.
5. Smoke manual com app sandbox antes de anunciar.

## 10. Riscos e Mitigações

| Risco | Prob | Impacto | Mitigação |
|-------|------|---------|-----------|
| Rate-limit global Meta | Média | Alto | Retry + erro claro. |
| Token expirado/revogado | Alta | Médio | `status=error`, mensagem. Drift check promove a `stale`. |
| Campos subscription mudam versão API | Baixa | Médio | Env override, `v20.0` pinned. |
| Usuário confunde tokens | Alta | Alto | Helper text + accordion + validar no Testar. |
| Subscribe concorrente | Média | Médio | Lock Redis SETNX TTL 30s. |
| `verifyToken` não commitado no challenge | Baixa | Alto | `update status=pending` antes = commit do verify. |
| Timeout Next server action | Baixa | Médio | ≤16s por call. |
| Empresa deletada com sub ativa | Alta | Médio | `deleteCompany` chama `unsubscribeWebhook` best-effort. |
| Race `webhookKey` durante subscribe | Baixa | Alto | Bloquear edição quando `status=pending`. |
| `NEXTAUTH_URL` dev/localhost | Média | Alto | Validar HTTPS + domínio público em produção, erro claro. |
| Meta desinscreve unilateralmente (drift) | Média | Alto | Drift check + job diário + UI Revalidar. |

## 11. Critérios de Aceite

- [ ] Credenciais completas → "Inscrever" → toast sucesso em ≤20s.
- [ ] Badge `active` + timestamp.
- [ ] Mensagem WhatsApp sandbox → log sem config manual Meta.
- [ ] "Testar" com token errado → erro legível, status inalterado.
- [ ] Manager/viewer → 403 na action via devtools.
- [ ] Recarregar preserva status (inclui `pending`).
- [ ] Alterar `webhookKey` de empresa inscrita → `not_configured`.
- [ ] Rate limit: 11ª chamada em 60s → `rate_limited`.
- [ ] 2 admins clicam "Inscrever" simultâneo → só 1 executa, outro recebe `concurrent_operation`.
- [ ] Desinscrever → `not_configured` + Meta sem o app inscrito.
- [ ] Revalidar após revogar token no painel Meta → `stale`.
- [ ] Deletar empresa inscrita → Meta sem assinatura órfã.
- [ ] Challenge GET bate com `verifyToken` do DB (teste handler existente).
- [ ] Falha em `logAudit` não derruba a action.
- [ ] `pending` recarregada não regride para `not_configured`.

## 12. Env vars novas

- `META_GRAPH_API_URL` (default `https://graph.facebook.com`).
- `META_API_VERSION` (default `v20.0`).
- `META_SUBSCRIPTION_FIELDS` (CSV).
- `META_DRIFT_CHECK_CRON` (default `0 3 * * *`).
- `NEXTAUTH_URL` já existente — callback base.

## 13. Arquivos a criar/alterar

**Criar**
- `prisma/migrations/<ts>_add_meta_subscription_state/migration.sql`
- `src/lib/meta/graph-api.ts`
- `src/lib/meta/__tests__/graph-api.test.ts`
- `src/lib/actions/meta-subscription.ts`
- `src/lib/actions/__tests__/meta-subscription.test.ts`
- `src/lib/rate-limit/meta.ts`
- `src/lib/rate-limit/__tests__/meta.test.ts`
- `src/worker/jobs/meta-drift-check.ts` (+ schedule no worker boot)
- `scripts/test-meta-subscribe.mjs`

**Alterar**
- `prisma/schema.prisma`
- `src/lib/actions/credential.ts` (`ENCRYPTED_FIELDS` + mask)
- `src/lib/validations/credential.ts` (+campo)
- `src/lib/actions/company.ts` (hooks update + delete)
- `src/app/(protected)/companies/[id]/_components/credentials-tab.tsx`
- `src/app/(protected)/companies/[id]/_components/credential-form.tsx`
- `src/lib/env.ts` (novas env vars)
- `src/worker/index.ts` (registrar job drift)
- `CLAUDE.md` (status Fase 4)
