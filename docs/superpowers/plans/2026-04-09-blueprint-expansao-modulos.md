# Blueprint Nexus AI — Expansão de Módulos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atualizar 7 módulos existentes e criar 5 novos módulos + 1 pattern no Blueprint Nexus AI, extraindo e adaptando features dos projetos Roteador Webhook, devocional-hub e Gestor de Webhook.

**Architecture:** Cada task produz um arquivo `.md` no repo do Blueprint (`/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint/`) seguindo o formato padronizado (Resumo, Dependências, Schema Prisma, Arquivos, Actions, Componentes, Integração, Segurança). Ao final, atualizar os READMEs de índice e a skill `criar` para descobrir os novos módulos.

**Tech Stack:** Markdown, Prisma schema notation, TypeScript code blocks

**Repo Blueprint:** `/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint/`
**Repo Roteador:** `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/`
**Repo Devocional:** `/Users/joaovitorzanini/Desktop/Claude Code/devocional-hub/`
**Repo Gestor:** `/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/`

---

## FASE 1 — Atualização dos Módulos Existentes (7 tasks)

Os módulos atuais estão desatualizados em relação ao código dos projetos. Atualizar primeiro garante que a base está sólida antes de adicionar novos módulos.

---

### Task 1: Atualizar core/auth — brute force progressivo

**Fonte:** Gestor de Webhook (`apps/api/src/modules/auth/auth.service.ts`) + Roteador (`src/lib/rate-limit.ts`)

**Files:**
- Modify: `core/overview.md` (seção 1. Auth)

O auth atual no Blueprint documenta rate limit simples (5 tentativas, 15min lockout). Os projetos evoluíram para brute force progressivo.

- [ ] **Step 1: Ler o código atual de rate-limit dos 2 projetos**

```bash
# Roteador — rate limit com Redis
cat "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/lib/rate-limit.ts"

# Gestor — brute force progressivo (5→15min, 10→1h, 20→24h)
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/auth/auth.service.ts"
```

- [ ] **Step 2: Atualizar seção Auth em core/overview.md**

Unificar o melhor dos dois projetos no Blueprint:
- Manter a abordagem Redis do Roteador (mais leve que banco)
- Incorporar os 3 níveis de lockout do Gestor (5→15min, 10→1h, 20→24h)
- Atualizar a seção "Rate limiting" com a nova lógica
- Atualizar a seção "Segurança" com brute force progressivo
- Atualizar "O que customizar" com as constantes dos 3 níveis

Campos a atualizar no `rate-limit.ts` documentado:

```typescript
const LOCKOUT_TIERS = [
  { maxAttempts: 5, lockoutSeconds: 900 },    // 5 tentativas → 15min
  { maxAttempts: 10, lockoutSeconds: 3600 },   // 10 tentativas → 1h
  { maxAttempts: 20, lockoutSeconds: 86400 },  // 20 tentativas → 24h
];
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add core/overview.md
git commit -m "feat(core/auth): brute force progressivo com 3 níveis de lockout"
```

---

### Task 2: Atualizar core/users — soft delete LGPD

**Fonte:** devocional-hub (`prisma/schema.prisma` — campos `deletedAt`, `deletedBy`)

**Files:**
- Modify: `core/overview.md` (seção 2. Users)

- [ ] **Step 1: Ler o schema do devocional para entender o padrão soft delete**

```bash
grep -A 5 "deletedAt" "/Users/joaovitorzanini/Desktop/Claude Code/devocional-hub/prisma/schema.prisma"
```

- [ ] **Step 2: Atualizar seção Users em core/overview.md**

Adicionar ao model User do Prisma:

```prisma
  deletedAt   DateTime? @map("deleted_at")
  deletedBy   String?   @map("deleted_by") @db.Uuid
```

Atualizar `deleteUser()` de hard delete para soft delete:
- Mudar de `prisma.user.delete()` para `prisma.user.update({ deletedAt: new Date(), deletedBy: currentUser.id })`
- Adicionar filtro `deletedAt: null` em todas as queries de listagem
- Adicionar seção "Conformidade LGPD" em Segurança
- Atualizar "O que customizar" com opção hard vs soft delete

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add core/overview.md
git commit -m "feat(core/users): soft delete LGPD com deletedAt e deletedBy"
```

---

### Task 3: Atualizar core/email — CRUD de templates

**Fonte:** Gestor de Webhook (`apps/api/src/modules/emails/templates.service.ts`)

**Files:**
- Modify: `core/overview.md` (seção 5. Email)

- [ ] **Step 1: Ler o sistema de templates do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/emails/templates.service.ts"
```

- [ ] **Step 2: Atualizar seção Email em core/overview.md**

Expandir o módulo de email com:
- Model `EmailTemplate` (slug, category, subject, htmlBody, availableVariables JSON, isSystem, isActive)
- CRUD de templates: `getTemplates()`, `getTemplateBySlug()`, `createTemplate()`, `updateTemplate()`, `deleteTemplate()`
- Sistema de variáveis `{{var}}` com substituição automática
- Categorias: SYSTEM, NOTIFICATION, MARKETING
- Templates de sistema protegidos contra exclusão
- Manter funções existentes (`sendPasswordResetEmail`, `sendEmailChangeVerification`) como wrappers que usam templates

Não incluir model `EmailLog` — tracking de envio é muito específico do Gestor.

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add core/overview.md
git commit -m "feat(core/email): CRUD de templates com variáveis e categorias"
```

---

### Task 4: Atualizar core/profile — verificação de email com token

**Fonte:** Roteador Webhook (`src/lib/actions/profile.ts`)

**Files:**
- Modify: `core/overview.md` (seção 3. Profile)

- [ ] **Step 1: Verificar se a seção Profile já documenta o fluxo de email change**

Ler a seção atual e comparar com o código do Roteador. O Blueprint pode já ter isso documentado parcialmente.

- [ ] **Step 2: Atualizar seção Profile se necessário**

Garantir que está completo:
- `requestEmailChange()` com rate limit de 2min, token nanoid(48), expiry 1h
- `confirmEmailChange()` com validação de token, verificação de disponibilidade, transação atômica
- Model `EmailChangeToken` com schema completo
- Página `/verify-email` nas rotas públicas
- Seção de segurança com todas as proteções

- [ ] **Step 3: Commit (se houve mudanças)**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add core/overview.md
git commit -m "feat(core/profile): documentação completa de verificação de email"
```

---

### Task 5: Atualizar módulo encryption — rotação e máscara configurável

**Fonte:** Gestor de Webhook (`apps/api/src/common/security/encryption.service.ts`, `apps/api/src/modules/credentials/credentials.service.ts`)

**Files:**
- Modify: `modules/encryption.md`

- [ ] **Step 1: Ler o sistema de rotação do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/credentials/credentials.service.ts"
```

- [ ] **Step 2: Atualizar encryption.md**

Adicionar:
- Função `rotateEncryptionKey(oldKey, newKey)` — re-criptografa todos os campos com a nova chave
- Campo `rotatedAt` no contexto de credenciais (documentar como padrão)
- Variação de máscara: `mask(value, { visibleStart: 4, visibleEnd: 4 })` para exibir first4+last4
- Atualizar "Customizações por plataforma" com rotação de chave documentada (não mais "não implementada")
- Manter compatibilidade total com o formato existente `iv:authTag:encrypted`

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add modules/encryption.md
git commit -m "feat(encryption): rotação de chave e máscara configurável"
```

---

### Task 6: Atualizar módulo multi-tenant — duas camadas de roles

**Fonte:** Roteador Webhook (`src/lib/constants/roles.ts`, `src/lib/actions/users.ts`)

**Files:**
- Modify: `modules/multi-tenant.md`

- [ ] **Step 1: Ler o sistema de roles do Roteador**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/lib/constants/roles.ts"
```

- [ ] **Step 2: Atualizar multi-tenant.md**

Documentar o sistema de duas camadas independentes:
- `PlatformRole` (super_admin, admin, manager, viewer) — nível da plataforma
- `CompanyRole` (super_admin, company_admin, manager, viewer) — nível da empresa
- Hierarquia numérica para cada camada com constantes exportadas
- Labels, estilos CSS e opções de select para ambas
- Regras de controle: quem vê quem, quem edita quem, proteção do super admin
- Mapeamento automático platformRole → CompanyRole ao promover/rebaixar
- Auto-vinculação de super_admin como company_admin em toda nova empresa

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add modules/multi-tenant.md
git commit -m "feat(multi-tenant): sistema de permissões em duas camadas independentes"
```

---

### Task 7: Atualizar módulo audit-log — interceptor automático

**Fonte:** Gestor de Webhook (`apps/api/src/common/interceptors/audit.interceptor.ts`)

**Files:**
- Modify: `modules/audit-log.md`

- [ ] **Step 1: Ler o interceptor do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/common/interceptors/audit.interceptor.ts"
```

- [ ] **Step 2: Atualizar audit-log.md**

Adaptar o conceito de interceptor automático para Next.js (o Gestor usa NestJS):
- Documentar um wrapper `withAudit()` para Server Actions que captura automaticamente before/after
- Adicionar campos `before` e `after` (JSON) no model para diff de mudanças
- Documentar pattern de audit automático em Server Actions de escrita (create/update/delete)
- Manter o fire-and-forget existente como opção manual
- Atualizar ações padronizadas com os novos verbos descobertos nos projetos

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add modules/audit-log.md
git commit -m "feat(audit-log): wrapper withAudit para captura automática de mudanças"
```

---

## FASE 2 — Novos Módulos (5 tasks)

---

### Task 8: Criar módulo billing

**Fonte:** Gestor de Webhook (`apps/api/src/modules/billing/`)

**Files:**
- Create: `modules/billing.md`
- Modify: `modules/README.md`

- [ ] **Step 1: Ler todo o sistema de billing do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/billing/billing.service.ts"
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/billing/wallet.service.ts"
```

- [ ] **Step 2: Criar modules/billing.md seguindo o formato padrão**

Estrutura do módulo:
- **Resumo:** Sistema de carteira digital com ledger atômico, categorias de saldo e integração com gateway de pagamento
- **Dependências:** core (auth, users), multi-tenant (companyId), encryption (tokens do gateway)
- **Schema Prisma:**
  - `Wallet` (companyId unique, totalBalance, generalBalance + categorias opcionais)
  - `WalletTransaction` (walletId, type enum, category, direction CREDIT/DEBIT, amount, balanceBefore, balanceAfter, referenceId, description)
- **Actions:**
  - `getWallet(companyId)` — saldo atual
  - `credit(walletId, amount, type, category, referenceId?)` — adicionar saldo (atômico)
  - `debit(walletId, amount, type, category, referenceId?)` — remover saldo (atômico, valida saldo suficiente)
  - `getTransactions(walletId, filters?)` — histórico com paginação
  - `rebuildFromLedger(walletId)` — recalcular saldos a partir das transações
- **Integração:** webhook endpoint para receber confirmação de pagamento do gateway
- **Segurança:** todas as operações em `$transaction`, validação de saldo antes de débito
- **Customizações:** categorias de saldo, gateway de pagamento (Asaas/Stripe/Mercado Pago), moeda

Não incluir: lógica específica do Asaas (PIX, cartão). Documentar como "gateway genérico" com exemplo Asaas.

- [ ] **Step 3: Atualizar modules/README.md com a nova entrada**

Adicionar linha na tabela:
```markdown
| Billing | Carteira digital, ledger atômico, gateway de pagamento | [billing.md](billing.md) |
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add modules/billing.md modules/README.md
git commit -m "feat(modules): adiciona módulo billing — carteira, ledger e gateway"
```

---

### Task 9: Criar módulo api-keys

**Fonte:** Gestor de Webhook (`apps/api/src/modules/api-keys/api-keys.service.ts`, `apps/api/src/common/guards/api-key.guard.ts`)

**Files:**
- Create: `modules/api-keys.md`
- Modify: `modules/README.md`

- [ ] **Step 1: Ler o sistema de API keys do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/api-keys/api-keys.service.ts"
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/common/guards/api-key.guard.ts"
```

- [ ] **Step 2: Criar modules/api-keys.md**

Estrutura:
- **Resumo:** Gerenciamento de chaves de API com hash SHA256, scopes granulares, IP allowlist e expiração
- **Dependências:** core (auth, users), multi-tenant (companyId), encryption (hash)
- **Schema Prisma:**
  - `ApiKey` (companyId, name, keyPrefix, keyHash unique, scopes JSON, allowedIps JSON, rateLimit, expiresAt, lastUsedAt, createdBy, isActive)
- **Actions:**
  - `createApiKey(companyId, data)` — gera `nxk_<random>`, armazena SHA256, retorna chave uma única vez
  - `listApiKeys(companyId)` — lista com prefix e lastUsedAt (nunca expõe hash)
  - `revokeApiKey(keyId)` — soft delete (isActive=false)
  - `validateApiKey(rawKey)` — hash + lookup + verificar expiração + IP + scopes
- **Middleware:** verificação de API key no header `Authorization: Bearer nxk_...`
- **Segurança:** chave nunca armazenada em texto, apenas hash. Exibida uma única vez na criação.

Adaptar de NestJS guard para Next.js middleware pattern.

- [ ] **Step 3: Atualizar modules/README.md**

```markdown
| API Keys | Chaves de API com hash, scopes, IP allowlist | [api-keys.md](api-keys.md) |
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add modules/api-keys.md modules/README.md
git commit -m "feat(modules): adiciona módulo api-keys — hash SHA256, scopes e allowlist"
```

---

### Task 10: Criar módulo feature-flags

**Fonte:** Gestor de Webhook (`apps/api/src/common/guards/feature-flag.guard.ts`, `Company.features` JSON)

**Files:**
- Create: `modules/feature-flags.md`
- Modify: `modules/README.md`

- [ ] **Step 1: Ler o sistema de feature flags do Gestor**

```bash
grep -n "features" "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/prisma/schema.prisma"
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/common/guards/feature-flag.guard.ts"
```

- [ ] **Step 2: Criar modules/feature-flags.md**

Estrutura:
- **Resumo:** Controle de features por empresa via JSON, permitindo rollout gradual e diferenciação por plano
- **Dependências:** multi-tenant (Company model)
- **Schema Prisma:** Adicionar campo `features Json @default("{}") @db.JsonB` no model Company
- **Actions:**
  - `getCompanyFeatures(companyId)` — retorna flags ativas
  - `updateCompanyFeatures(companyId, features)` — atualiza flags (admin only)
  - `hasFeature(companyId, flag)` — verifica se feature está ativa
- **Componentes:**
  - `FeatureGate` — wrapper condicional que renderiza children apenas se feature ativa
- **Integração:** usar `hasFeature()` em Server Actions e `FeatureGate` em componentes
- **Customizações:** flags padrão por tipo de plano (free, pro, enterprise)

- [ ] **Step 3: Atualizar modules/README.md**

```markdown
| Feature Flags | Controle de features por empresa, rollout gradual | [feature-flags.md](feature-flags.md) |
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add modules/feature-flags.md modules/README.md
git commit -m "feat(modules): adiciona módulo feature-flags — controle por empresa"
```

---

### Task 11: Criar módulo onboarding

**Fonte:** Gestor de Webhook (`apps/api/src/modules/onboarding/onboarding.service.ts`)

**Files:**
- Create: `modules/onboarding.md`
- Modify: `modules/README.md`

- [ ] **Step 1: Ler o sistema de onboarding do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/onboarding/onboarding.service.ts"
```

- [ ] **Step 2: Criar modules/onboarding.md**

Estrutura:
- **Resumo:** Tour guiado de onboarding por usuário com tracking de steps e status
- **Dependências:** core (auth, users)
- **Schema Prisma:**
  - `OnboardingTour` (userId unique, currentStep, completedSteps JSON, status: NOT_STARTED/IN_PROGRESS/COMPLETED/SKIPPED, startedAt, completedAt, skippedAt)
- **Actions:**
  - `getOnboardingStatus(userId)` — status atual do tour
  - `startOnboarding(userId)` — inicia o tour
  - `completeStep(userId, step)` — marca step como concluído, avança currentStep
  - `skipOnboarding(userId)` — pula o tour inteiro
- **Componentes:**
  - `OnboardingTooltip` — tooltip posicionado com seta apontando para o elemento alvo
  - `OnboardingOverlay` — overlay escurecido com destaque no elemento ativo
  - `OnboardingProgress` — barra de progresso com steps
- **Integração:** verificar status no layout principal, exibir tour se NOT_STARTED
- **Customizações:** steps configuráveis por plataforma (array de { id, title, description, targetSelector })

- [ ] **Step 3: Atualizar modules/README.md**

```markdown
| Onboarding | Tour guiado, steps, progresso por usuário | [onboarding.md](onboarding.md) |
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add modules/onboarding.md modules/README.md
git commit -m "feat(modules): adiciona módulo onboarding — tour guiado com steps"
```

---

### Task 12: Criar módulo search

**Fonte:** devocional-hub (`src/app/api/search/route.ts`) + Roteador (feature pendente de busca global)

**Files:**
- Create: `modules/search.md`
- Modify: `modules/README.md`

- [ ] **Step 1: Ler o sistema de busca do devocional**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/devocional-hub/src/app/api/search/route.ts"
```

- [ ] **Step 2: Criar modules/search.md**

Estrutura:
- **Resumo:** Busca global unificada com multi-índice, scoring por tipo de match e debounce
- **Dependências:** core (auth), multi-tenant (tenant scoping)
- **Schema Prisma:** Nenhum model próprio — busca nos models existentes
- **Actions:**
  - `globalSearch(query, options?)` — busca em múltiplas entidades com tenant scoping
  - Retorna `SearchResult[]` com `{ type, id, title, subtitle, matchField, score, url }`
- **Componentes:**
  - `SearchCommand` — input com atalho Ctrl+K, dropdown de resultados agrupados por tipo
  - `SearchResult` — item individual com ícone por tipo, highlight do match
- **Padrão de busca:**
  - Normalização (remove acentos, lowercase)
  - Busca em múltiplos campos por entidade
  - Scoring: exact > startsWith > contains
  - Agrupamento por tipo (empresas, usuários, rotas, etc.)
  - Debounce 300ms no client
- **Integração:** adicionar SearchCommand no header do layout protegido
- **Customizações:** entidades pesquisáveis, campos por entidade, ícones por tipo

- [ ] **Step 3: Atualizar modules/README.md**

```markdown
| Search | Busca global unificada, multi-índice, Ctrl+K | [search.md](search.md) |
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add modules/search.md modules/README.md
git commit -m "feat(modules): adiciona módulo search — busca global multi-índice"
```

---

## FASE 3 — Novo Pattern (1 task)

---

### Task 13: Criar pattern outbox

**Fonte:** Gestor de Webhook (`apps/api/src/outbox/outbox.service.ts`, `apps/api/src/outbox/outbox.processor.ts`)

**Files:**
- Create: `patterns/outbox.md`
- Modify: `patterns/README.md`

- [ ] **Step 1: Ler o sistema de outbox do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/outbox/outbox.service.ts"
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/outbox/outbox.processor.ts"
```

- [ ] **Step 2: Criar patterns/outbox.md**

Estrutura:
- **Resumo:** Publicação confiável de eventos via tabela Outbox, prevenindo perda de mensagens em caso de crash
- **Schema Prisma:**
  - `OutboxEvent` (aggregateType, aggregateId, eventType, payload JSON, status: PENDING/PUBLISHED/FAILED, retries, publishedAt, createdAt)
- **Arquitetura:**
  - Serviço salva o evento na mesma transação que a mudança de domínio
  - Worker processa eventos PENDING a cada 5 segundos
  - Emite via EventEmitter / Redis Pub/Sub
  - Marca como PUBLISHED ou FAILED (com retry)
- **Adaptação Next.js:** usar BullMQ repeatable job como processor em vez de setInterval
- **Integração:** chamar `publishOutboxEvent()` dentro de `$transaction` junto com a operação principal
- **Customizações:** intervalo de polling, max retries, TTL de eventos publicados

- [ ] **Step 3: Atualizar patterns/README.md**

```markdown
| Outbox | Publicação confiável de eventos via tabela transacional | [outbox.md](outbox.md) |
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add patterns/outbox.md patterns/README.md
git commit -m "feat(patterns): adiciona pattern outbox — eventos transacionais confiáveis"
```

---

## FASE 4 — Atualizar Skill Criar e Plugin (1 task)

---

### Task 14: Atualizar skill criar e versão do plugin

**Files:**
- Modify: `skills/criar/SKILL.md`
- Modify: `skills/listar/SKILL.md`
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Atualizar skills/listar/SKILL.md**

Adicionar os 5 novos módulos e 1 novo pattern às tabelas de listagem.

- [ ] **Step 2: Atualizar skills/criar/SKILL.md**

Garantir que o passo de seleção de módulos inclui os 5 novos:
- billing — "Carteira digital com ledger atômico"
- api-keys — "Chaves de API com hash e scopes"
- feature-flags — "Controle de features por empresa"
- onboarding — "Tour guiado para novos usuários"
- search — "Busca global unificada (Ctrl+K)"

E o novo pattern:
- outbox — "Publicação confiável de eventos"

- [ ] **Step 3: Bumpar versão em plugin.json**

De `1.2.0` para `2.0.0` (major bump — 5 novos módulos + 7 atualizações é uma release significativa).

- [ ] **Step 4: Commit final**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add skills/ .claude-plugin/plugin.json
git commit -m "feat: Blueprint v2.0.0 — 5 módulos novos, 1 pattern, 7 atualizações"
```

- [ ] **Step 5: Push para GitHub**

```bash
git push origin main
```

---

## Resumo de Entregas

| Fase | Tasks | O que entrega |
|------|-------|---------------|
| 1 | 1-7 | 7 módulos existentes atualizados com melhorias dos projetos |
| 2 | 8-12 | 5 novos módulos (billing, api-keys, feature-flags, onboarding, search) |
| 3 | 13 | 1 novo pattern (outbox) |
| 4 | 14 | Skills atualizadas + versão 2.0.0 |

**Total:** 14 tasks, ~13 arquivos criados/modificados
