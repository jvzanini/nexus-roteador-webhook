# Spec — Embedded Signup Meta (OAuth-driven onboarding)

**Data:** 2026-04-15
**Fase:** 5 — Embedded Signup
**Status:** Draft

## 1. Contexto

Hoje (pós-Fase 4) o usuário ainda cola manualmente `metaAppId`, `metaAppSecret`, `accessToken`, `systemUserToken`, `phoneNumberId`, `wabaId`. Embedded Signup da Meta permite que o usuário clique "Conectar WhatsApp" no nosso app, autentique via Facebook, escolha um WABA + Phone Number, e receba de volta um código que trocamos por um token de longa duração — populando as credenciais automaticamente.

## 2. Escopo

### In-scope (MVP desta fase)
- Meta App configurado como "Facebook Login for Business" com `whatsapp_business_management` + `whatsapp_business_messaging` + `business_management` scopes.
- Botão "Conectar WhatsApp Business" na aba WhatsApp Cloud da empresa, que abre o popup `FB.login({config_id})` com `extras.setup` de Embedded Signup.
- Endpoint server-side `POST /api/meta/oauth/callback` que recebe o `code`, chama `GET /oauth/access_token` → token de curta duração, troca por long-lived via `GET /oauth/access_token?grant_type=fb_exchange_token`, e busca WABAs/Phone Numbers acessíveis.
- UI de seleção: se múltiplos WABAs/Numbers, mostra seletor; auto-salva quando único.
- Persistência: preenche `metaAppId` (da config global), `accessToken` (User Access Token de 60 dias, obtido via `fb_exchange_token` — **NÃO** é System User Token), `wabaId`, `phoneNumberId`. **`verifyToken` é preservado se já existir**; gerado apenas em insert (primeira conexão). `metaSystemUserToken` permanece manual (exige business verification + fluxo BM separado).
- `subscribeWebhook` (Fase 4) disparado automaticamente após setup.
- Audit, notification, realtime.
- Rate limit: reutiliza `enforceMetaRateLimit`.

### Out-of-scope
- Rotação automática do User Access Token (60d) — coberto como plano futuro em §13.
- Múltiplos números simultâneos por empresa.
- Auto-obter System User Token (exige business verification Meta + fluxo BM separado).

## 3. Pré-requisitos Meta (fora do código)

- App Meta criado em developers.facebook.com com WhatsApp Business Platform e Facebook Login for Business habilitados.
- Business verification concluída (pode entrar em modo dev primeiro).
- Config de Embedded Signup criada: `EMBEDDED_SIGNUP_CONFIG_ID`.
- Domínios autorizados na app (incluir `roteadorwebhook.nexusai360.com`).

Esses passos ficam documentados em `docs/runbooks/embedded-signup-setup.md` (novo).

## 4. Modelo de Dados

Migration `add_embedded_signup_fields`:
```prisma
model CompanyCredential {
  // existentes
  accessTokenExpiresAt DateTime? @map("access_token_expires_at")
  connectedViaEmbeddedSignup Boolean @default(false) @map("connected_via_embedded_signup")
  connectedAt DateTime? @map("connected_at")
}
```

Env vars novas:
- `META_APP_ID` — client ID (público, distinto de `metaAppId` por empresa; este é o app nosso).
- `META_APP_SECRET` — client secret.
- `META_EMBEDDED_SIGNUP_CONFIG_ID` — ID da config de Embedded Signup criada no painel Meta.

*Nota*: quando env `META_APP_ID`/`_SECRET` estão presentes, prevalecem sobre campos por empresa (`metaAppId`/`metaAppSecret`) — porque passamos a usar nossa app como intermediária OAuth.

## 5. Arquitetura

```
Browser                        Next.js                    Meta Graph
  │                              │                            │
  ├── click "Conectar" ─────────▶│                            │
  │                              │                            │
  │◀── loadSDK + FB.login(config)│                            │
  │◀── popup Meta OAuth          │                            │
  │  (user escolhe WABA + phone) │                            │
  │                              │                            │
  ├── message {code, wabaId,phoneNumberId} via postMessage ──▶│
  │                              │                            │
  ├── POST /api/meta/oauth/callback ──▶                       │
  │                              ├── exchange code ──────────▶│
  │                              │◀── short_lived_token ──────┤
  │                              ├── fb_exchange_token ──────▶│
  │                              │◀── long_lived_token ───────┤
  │                              ├── GET /me/businesses ─────▶│
  │                              │◀── validate WABA access ───┤
  │                              ├── upsert credential        │
  │                              ├── subscribeWebhook() (F4)  │
  │                              └── notify+audit+realtime    │
  │◀── toast sucesso + refresh   │                            │
```

Arquivos novos:
- `src/lib/meta/oauth.ts` — helpers `exchangeCode`, `exchangeForLongLivedToken`, `listUserBusinesses`, `validateBusinessAccess`.
- `src/app/api/meta/oauth/callback/route.ts` — endpoint POST que orquestra exchange + persistência.
- `src/lib/actions/meta-embedded-signup.ts` — server action `startEmbeddedSignup` retorna config pública (appId, configId, redirectUri).
- `src/app/(protected)/companies/[id]/_components/embedded-signup-button.tsx` — componente client com loader do FB SDK e handler `fb:login_status`.

## 6. Fluxo `POST /api/meta/oauth/callback`

1. Auth obrigatória (super_admin ou company_admin). `companyId` + `code` + `wabaId` + `phoneNumberId` + `state` no body, Zod-valido.
2. Validar `state` HMAC contra Redis (TTL 10min); origin check `Origin` header.
3. Rate limit `enforceMetaRateLimit(companyId)` (10 req/min, mesma chave da Fase 4).
4. `code` → `exchangeCode(code, redirectUri)` → `shortToken`.
5. `exchangeForLongLivedToken(shortToken)` → `longToken` (User Access 60d) + `expiresIn`.
6. `validateBusinessAccess(longToken, wabaId, phoneNumberId)` — garante escopo sobre os recursos selecionados (usa `business_management` para `/me/businesses`).
6.5. **Se `cred.wabaId` existe e difere do novo**: chamar `unsubscribeWebhook(companyId)` antes do upsert — evita subscription órfã no WABA antigo.
7. `upsert` com `accessToken=encrypt(longToken)`, `accessTokenExpiresAt=now+expiresIn`, `wabaId`, `phoneNumberId`, `connectedViaEmbeddedSignup=true`, `connectedAt=now`. **`verifyToken` preservado se já existe; gerado só em insert** (`create: { verifyToken: encrypt(randomBytes(24).hex) }`, `update: {}` para esse campo).
8. Fire-and-forget `subscribeWebhook(companyId)` (da Fase 4).
8. Notification info + audit `meta_embedded_signup.connected` + realtime `credential:updated`.
9. Retorna `{ success, data: { wabaId, phoneNumberId, subscriptionStatus } }`.

## 7. Segurança

- State param CSRF: antes de abrir o popup, gerar `state = hmac(sha256, userId+companyId+nonce)` e armazenar em Redis por 10min. Validar no callback.
- User access token (60d) tratado como secret — encrypt via `src/lib/encryption.ts` (mesma `ENCRYPTION_KEY` usada por `metaAppSecret`, `accessToken`, `verifyToken`, `metaSystemUserToken`).
- `META_APP_SECRET` jamais exposto ao browser.
- Rate-limit dedicado.
- Origin check no callback: `Origin` header deve ser o domínio esperado (ou omitido em POST sem fetch; validar via state).

## 8. UI/UX

- Botão novo na aba WhatsApp Cloud: "Conectar WhatsApp com Facebook" (variant primary, ícone `Facebook` lucide).
- Só aparece se `META_APP_ID` + `META_EMBEDDED_SIGNUP_CONFIG_ID` estão configurados em env. Senão, UI atual manual permanece.
- Durante o fluxo: desabilita botão, `Loader2`.
- Em sucesso: toast + refresh → credenciais aparecem preenchidas no form (accessToken mascarado, wabaId/phoneNumberId visíveis) + badge Meta Subscription fica `active` quando `subscribeWebhook` conclui.
- Em erro: toast com mensagem Meta + estado inalterado.
- Accordion existente "Como obter System User Token" permanece (para conectar subscribe manual quando business verification pendente).

## 9. Testes

- `lib/meta/oauth.test.ts` — mocks fetch — exchangeCode, exchangeForLongLivedToken, validateBusinessAccess (sucesso/erro/token sem scope).
- `app/api/meta/oauth/callback/__tests__/route.test.ts` — autorização, state validation, happy path, erros Meta.
- E2E manual em staging com app Meta dev mode.

## 10. Rollout

- PR único.
- Feature flag implícita: sem env `META_APP_ID` → botão oculto (backward-compatible 100%).
- Runbook `docs/runbooks/embedded-signup-setup.md` guia setup do app Meta.

## 11. Critérios de Aceite

- [ ] Sem `META_APP_ID` no env, UI atual manual permanece intocada (backward compat).
- [ ] Com env configurada, botão aparece; clique abre popup Meta.
- [ ] Selecionando WABA+phone → credenciais preenchidas + subscribe ativo sem interação adicional.
- [ ] State inválido → 403.
- [ ] Token exchange falha → toast legível, DB inalterado.
- [ ] Rate limit 10/min respeitado.
- [ ] Audit `meta_embedded_signup.connected` gravado.
- [ ] Testes unitários verdes.

## 12. Arquivos

**Criar**
- `prisma/migrations/<ts>_add_embedded_signup_state/migration.sql`
- `src/lib/meta/oauth.ts` + testes
- `src/app/api/meta/oauth/callback/route.ts` + testes
- `src/lib/actions/meta-embedded-signup.ts`
- `src/app/(protected)/companies/[id]/_components/embedded-signup-button.tsx`
- `docs/runbooks/embedded-signup-setup.md`

**Alterar**
- `prisma/schema.prisma`
- `src/lib/env.ts` (+ META_APP_ID, META_APP_SECRET, META_EMBEDDED_SIGNUP_CONFIG_ID)
- `src/app/(protected)/companies/[id]/_components/credential-form.tsx` (renderiza botão embedded signup condicional)
- `CLAUDE.md`

## Tabela de tokens

| Campo | Origem | Duração | Uso |
|-------|--------|---------|-----|
| `accessToken` (User Access) | Embedded Signup OAuth (`fb_exchange_token`) | 60 dias | Chamadas Graph em nome do usuário; envio mensagens, `/me/businesses`. Renovável. |
| `metaSystemUserToken` | BM → System User → gerar manual (pós business verification) | Never-expiring | `subscribeWebhook`, `subscribeApp`, `drift check` sem usuário logado. Populado manualmente; fase futura automatiza. |
| `verifyToken` | Gerado (`randomBytes(24)`) no primeiro insert | — | Handshake GET do webhook com a Meta. Preservado em reconexões. |

## 13. Out-of-scope consolidado (planos futuros)

User Access Token expira em 60 dias. Não coberto neste MVP, mas escopo explícito para próxima fase:

- Job BullMQ diário: identifica `accessTokenExpiresAt < now + 7d`, dispara notification "Reconectar WhatsApp".
- UI exibe badge "Token expira em N dias" quando `< 7d`.
- Endpoint `POST /api/meta/oauth/refresh` chama `fb_exchange_token` com token ainda válido para renovar (+60d) sem re-OAuth.
- Se token expirou, UI força fluxo Embedded Signup novamente.

Neste MVP, o campo `accessTokenExpiresAt` é persistido mas não consumido por nenhuma automação — serve como base para a próxima fase.

**Também fora do MVP:**
- Múltiplos números por empresa.
- Auto-obter System User Token.
- Troca de empresa (múltiplos WABAs por conta BM) — hoje o user escolhe 1 no popup.
- **Coexistência env + manual**: se `META_APP_ID` for configurado APÓS empresas já terem credenciais manuais, o comportamento é aditivo: UI mostra botão "Conectar com Facebook" para migrar, mas nunca sobrescreve silenciosamente. A migração acontece só se o usuário clicar e completar o fluxo.
