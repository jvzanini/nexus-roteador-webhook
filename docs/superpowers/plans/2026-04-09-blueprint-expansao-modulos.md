# Blueprint Nexus AI — Expansão v2.0.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atualizar módulos existentes, criar novos módulos/patterns, documentar interoperabilidade, corrigir design system e estabelecer processo contínuo de alimentação do Blueprint.

**Architecture:** Cada task produz/modifica arquivos `.md` no repo do Blueprint seguindo o formato padronizado. Tasks de UI exigem conformidade com o design system (violet, Lucide icons, shadcn/ui `render` prop, CSS variables). Ao final, validação end-to-end com criação de projeto teste.

**Tech Stack:** Markdown, Prisma schema notation, TypeScript code blocks

**Repos:**
- **Blueprint:** `/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint/`
- **Roteador:** `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/`
- **Devocional:** `/Users/joaovitorzanini/Desktop/Claude Code/devocional-hub/`
- **Gestor:** `/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/`

**Regras de UI para módulos com componentes:**
- Ícones: apenas Lucide React (nunca emojis)
- Componentes: shadcn/ui com `render` prop (não `asChild`)
- Cores: via CSS variables (`--primary`, `--accent`, etc.) — nunca hex hardcoded
- Tema: dark/light/system via next-themes
- Animações: Framer Motion com `as const` em variants
- Selects: `CustomSelect` de `@/components/ui/custom-select.tsx`

---

## FASE 1 — Corrigir Base (2 tasks)

Antes de atualizar módulos, a base precisa estar correta.

---

### Task 1: Corrigir design system MASTER.md

**Problema:** O MASTER.md documenta azul (#2563EB) como cor primária, mas o projeto usa violet (#7c3aed). Fontes erradas (Fira Code/Sans). Isso causa inconsistência em qualquer projeto criado pelo Blueprint.

**Files:**
- Modify: `design-system/nexus-roteador-webhook/MASTER.md` (no repo Roteador — referência visual)
- Modify: `templates/globals.css` (no repo Blueprint)
- Modify: `hardcoded-values.md` (no repo Blueprint)

- [ ] **Step 1: Ler o globals.css real do Roteador para extrair as cores corretas**

```bash
head -80 "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/globals.css"
```

- [ ] **Step 2: Atualizar MASTER.md no repo Roteador**

Corrigir:
- Primary: `#2563EB` → `#7c3aed` (violet-500 dark) / `#6d28d9` (violet-600 light)
- Secondary: `#3B82F6` → `#8b5cf6` (violet-400)
- CTA: `#F97316` (orange) → `#7c3aed` (violet — CTA é a própria primary)
- Fontes: Fira Code/Sans → system font stack (Inter, -apple-system, etc.)
- Categoria: "Smart Home/IoT Dashboard" → "SaaS Platform / Webhook Management"

- [ ] **Step 3: Atualizar templates/globals.css no Blueprint**

Garantir que o template usa `{{PRIMARY_COLOR}}` como placeholder e que os valores padrão são violet, não blue.

- [ ] **Step 4: Atualizar hardcoded-values.md no Blueprint**

Refletir as cores corretas como referência para novos projetos.

- [ ] **Step 5: Commit no Roteador**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta"
git add design-system/
git commit -m "fix: corrige MASTER.md — cores violet, fontes system, categoria correta"
```

- [ ] **Step 6: Commit no Blueprint**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add templates/globals.css hardcoded-values.md
git commit -m "fix: cores padrão violet no template globals.css e hardcoded-values"
```

---

### Task 2: Criar CONTRIBUTING.md — processo contínuo de alimentação

**Problema:** Não existe processo documentado para alimentar o Blueprint. Sem isso, a regra de "todo projeto alimenta" fica só no ar.

**Files:**
- Create: `CONTRIBUTING.md` (no repo Blueprint)

- [ ] **Step 1: Criar CONTRIBUTING.md**

Conteúdo do documento:

```markdown
# Alimentando o Blueprint

## Regra Absoluta
Todo projeto Nexus AI DEVE alimentar o Blueprint. Isso não é opcional.

## Quando alimentar

### Módulo novo
Quando uma feature genérica é construída (não específica do domínio do projeto):
1. Feature pronta e funcionando em produção
2. Extrair a lógica genérica (remover referências ao projeto específico)
3. Adaptar para o formato de módulo do Blueprint (ver seções abaixo)
4. Escrever o `.md` em `modules/` ou `patterns/`
5. Atualizar `modules/README.md` ou `patterns/README.md`
6. Atualizar `integration-map.md` com dependências cruzadas
7. Atualizar `skills/criar/SKILL.md` para incluir o novo módulo na seleção
8. Bumpar versão em `.claude-plugin/plugin.json`
9. Commit e push

### Atualização de módulo existente
Quando um módulo já documentado é melhorado/corrigido em qualquer projeto:
1. Identificar o módulo correspondente no Blueprint
2. Ler o `.md` atual e comparar com o código evoluído
3. Atualizar seções afetadas (Schema, Actions, Componentes, Segurança)
4. Manter compatibilidade — não quebrar o que já funciona
5. Commit com mensagem `feat(<módulo>): descrição da evolução`

## Formato de módulo
[Referência ao formato padrão — seções obrigatórias]

## Checklist de conformidade visual
- [ ] Ícones: Lucide React (nunca emojis)
- [ ] Componentes: shadcn/ui com `render` prop
- [ ] Cores: via CSS variables (nunca hex hardcoded nos componentes)
- [ ] Tema: dark/light/system via next-themes
- [ ] Animações: Framer Motion com `as const`
- [ ] Selects: CustomSelect padrão
- [ ] Responsivo: mobile-first, breakpoints 375/768/1024/1440px

## O que NÃO entra no Blueprint
- Features muito específicas de um domínio (ex: normalização de webhook Meta, pipeline de transcrição)
- Integrações com APIs de terceiros que só um projeto usa
- Lógica de negócio particular (ex: cálculo de câmbio USD→BRL)
- Módulos que sobrepõem outro existente — unificar, não duplicar
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add CONTRIBUTING.md
git commit -m "docs: CONTRIBUTING.md — processo contínuo de alimentação do Blueprint"
```

---

## FASE 2 — Atualização dos Módulos Existentes (7 tasks)

---

### Task 3: Atualizar core/auth — brute force progressivo

**Fonte:** Gestor (`apps/api/src/modules/auth/auth.service.ts`) + Roteador (`src/lib/rate-limit.ts`)

**Files:**
- Modify: `core/overview.md` (seção 1. Auth)

- [ ] **Step 1: Ler o código de rate-limit dos 2 projetos**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/lib/rate-limit.ts"
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/auth/auth.service.ts"
```

- [ ] **Step 2: Atualizar seção Auth em core/overview.md**

Unificar o melhor dos dois:
- Manter abordagem Redis do Roteador (mais leve)
- Incorporar 3 níveis de lockout do Gestor

Atualizar `rate-limit.ts` documentado:

```typescript
const LOCKOUT_TIERS = [
  { maxAttempts: 5, lockoutSeconds: 900 },    // 5 tentativas → 15min
  { maxAttempts: 10, lockoutSeconds: 3600 },   // 10 tentativas → 1h
  { maxAttempts: 20, lockoutSeconds: 86400 },  // 20 tentativas → 24h
];
```

Atualizar seções: "Rate limiting", "Segurança", "O que customizar".

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add core/overview.md
git commit -m "feat(core/auth): brute force progressivo com 3 níveis de lockout"
```

---

### Task 4: Atualizar core/users — soft delete LGPD

**Fonte:** devocional-hub (schema Prisma — `deletedAt`, `deletedBy`)

**Files:**
- Modify: `core/overview.md` (seção 2. Users)

- [ ] **Step 1: Ler o schema do devocional**

```bash
grep -A 5 "deletedAt" "/Users/joaovitorzanini/Desktop/Claude Code/devocional-hub/prisma/schema.prisma"
```

- [ ] **Step 2: Atualizar seção Users**

Adicionar ao model User:

```prisma
  deletedAt   DateTime? @map("deleted_at")
  deletedBy   String?   @map("deleted_by") @db.Uuid
```

Mudar `deleteUser()` para soft delete. Adicionar filtro `deletedAt: null` nas queries. Adicionar seção "Conformidade LGPD". Documentar em "O que customizar" a opção hard vs soft.

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add core/overview.md
git commit -m "feat(core/users): soft delete LGPD com deletedAt e deletedBy"
```

---

### Task 5: Atualizar core/email — CRUD de templates

**Fonte:** Gestor (`apps/api/src/modules/emails/templates.service.ts`)

**Files:**
- Modify: `core/overview.md` (seção 5. Email)

- [ ] **Step 1: Ler o sistema de templates do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/emails/templates.service.ts"
```

- [ ] **Step 2: Atualizar seção Email**

Expandir com:
- Model `EmailTemplate` (slug unique, category SYSTEM/NOTIFICATION/MARKETING, subject, htmlBody, availableVariables JSON, isSystem, isActive, deletedAt)
- CRUD: `getTemplates()`, `getTemplateBySlug()`, `createTemplate()`, `updateTemplate()`, `deleteTemplate()`
- Variáveis `{{var}}` com substituição automática via `renderTemplate(slug, variables)`
- Templates de sistema protegidos contra exclusão
- Manter wrappers existentes (`sendPasswordResetEmail`, `sendEmailChangeVerification`)

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add core/overview.md
git commit -m "feat(core/email): CRUD de templates com variáveis e categorias"
```

---

### Task 6: Atualizar core/profile — verificação de email

**Fonte:** Roteador (`src/lib/actions/profile.ts`)

**Files:**
- Modify: `core/overview.md` (seção 3. Profile)

- [ ] **Step 1: Comparar seção Profile atual com código do Roteador**

Verificar se `requestEmailChange()`, `confirmEmailChange()`, model `EmailChangeToken` já estão documentados.

- [ ] **Step 2: Atualizar se necessário**

Garantir completude: rate limit 2min, token nanoid(48), expiry 1h, página `/verify-email`, transação atômica, todas as proteções de segurança.

- [ ] **Step 3: Commit (se houve mudanças)**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add core/overview.md
git commit -m "feat(core/profile): documentação completa de verificação de email"
```

---

### Task 7: Atualizar módulo encryption — rotação e máscara

**Fonte:** Gestor (`apps/api/src/modules/credentials/credentials.service.ts`)

**Files:**
- Modify: `modules/encryption.md`

- [ ] **Step 1: Ler sistema de rotação do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/credentials/credentials.service.ts"
```

- [ ] **Step 2: Atualizar encryption.md**

Adicionar:
- `rotateEncryptionKey(oldKey, newKey)` com re-criptografia de todos os campos
- Máscara configurável: `mask(value, { visibleStart?: number, visibleEnd?: number })`
- Remover "Não implementada" de rotação nas customizações
- Manter compatibilidade com formato `iv:authTag:encrypted`

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add modules/encryption.md
git commit -m "feat(encryption): rotação de chave e máscara configurável"
```

---

### Task 8: Atualizar módulo multi-tenant — duas camadas + feature flags

**Fonte:** Roteador (`src/lib/constants/roles.ts`) + Gestor (`Company.features`, `feature-flag.guard.ts`)

**NOTA:** Feature flags absorvido aqui em vez de módulo separado — é uma extensão natural de Company.

**Files:**
- Modify: `modules/multi-tenant.md`

- [ ] **Step 1: Ler código dos 2 projetos**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/lib/constants/roles.ts"
grep -A 10 "features" "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/prisma/schema.prisma"
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/common/guards/feature-flag.guard.ts"
```

- [ ] **Step 2: Atualizar multi-tenant.md**

**Duas camadas de roles:**
- `PlatformRole` (super_admin, admin, manager, viewer)
- `CompanyRole` (super_admin, company_admin, manager, viewer)
- Hierarquia numérica, labels, estilos CSS, opções de select
- Regras: quem vê/edita quem, proteção super admin
- Mapeamento automático platformRole ↔ CompanyRole
- Auto-vinculação super_admin em toda nova empresa

**Feature flags (seção nova dentro do módulo):**
- Campo `features Json @default("{}") @db.JsonB` no model Company
- Helper `hasFeature(companyId, flag): Promise<boolean>`
- Componente `FeatureGate` (render children condicionalmente)
- Flags padrão por plano (free/pro/enterprise)
- Integração: usar em Server Actions e componentes

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add modules/multi-tenant.md
git commit -m "feat(multi-tenant): duas camadas de roles + feature flags por empresa"
```

---

### Task 9: Atualizar módulo audit-log — wrapper automático

**Fonte:** Gestor (`apps/api/src/common/interceptors/audit.interceptor.ts`)

**Files:**
- Modify: `modules/audit-log.md`

- [ ] **Step 1: Ler o interceptor do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/common/interceptors/audit.interceptor.ts"
```

- [ ] **Step 2: Atualizar audit-log.md**

Adaptar para Next.js:
- Wrapper `withAudit(action, options)` para Server Actions
- Campos `before` e `after` (JSON) para diff automático
- Pattern de audit em operações de escrita (create/update/delete)
- Manter fire-and-forget manual como opção
- Novos verbos: `user.create`, `user.update`, `user.delete`, `company.create`, `membership.update`

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add modules/audit-log.md
git commit -m "feat(audit-log): wrapper withAudit e campos before/after para diff"
```

---

## FASE 3 — Novos Módulos (4 tasks)

Cada módulo novo DEVE seguir as regras de UI listadas no cabeçalho deste plano.

---

### Task 10: Criar módulo billing

**Fonte:** Gestor (`apps/api/src/modules/billing/`)

**Files:**
- Create: `modules/billing.md`
- Modify: `modules/README.md`

- [ ] **Step 1: Ler sistema de billing do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/billing/billing.service.ts"
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/billing/wallet.service.ts"
```

- [ ] **Step 2: Criar modules/billing.md**

Seguir formato padrão completo:

- **Resumo:** Carteira digital com ledger atômico e integração com gateway de pagamento
- **Dependências:** core (auth, users), multi-tenant (companyId), encryption (tokens gateway)
- **Pacotes npm:** nenhum além do core (gateway via API HTTP)
- **Schema Prisma:**
  - `Wallet` (companyId unique, totalBalance Decimal(12,2), generalBalance, createdAt, updatedAt) — `@@map("wallets")`
  - `WalletTransaction` (walletId, type enum DEPOSIT/DEBIT/REFUND/ADJUSTMENT, category enum GENERAL/CAMPAIGN/CALL/AI, direction CREDIT/DEBIT, amount Decimal(12,4), balanceBefore, balanceAfter, referenceId?, description?, createdAt) — `@@map("wallet_transactions")`, `@@index([walletId, createdAt(sort: Desc)])`
- **Actions:**
  - `getWallet(companyId)` — saldo atual com formato monetário
  - `credit(walletId, amount, type, category, ref?)` — `$transaction` atômico
  - `debit(walletId, amount, type, category, ref?)` — valida saldo suficiente em `$transaction`
  - `getTransactions(walletId, filters?)` — cursor-based pagination
  - `rebuildFromLedger(walletId)` — recalcula saldos a partir das transações
- **Componentes UI:**
  - `WalletCard` — exibe saldo com ícone `Wallet` (Lucide), breakdown por categoria
  - `TransactionHistory` — tabela com filtros, ícone por tipo, badge de status
  - Cores via CSS variables, nunca hex hardcoded
- **Integração:** webhook endpoint genérico para confirmação de pagamento
- **Segurança:** `$transaction` em tudo, validação de saldo, audit log em débitos
- **Customizações:** categorias, gateway (Asaas/Stripe/MercadoPago), moeda (BRL padrão)

- [ ] **Step 3: Atualizar modules/README.md**

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

### Task 11: Criar módulo api-keys

**Fonte:** Gestor (`apps/api/src/modules/api-keys/`, `apps/api/src/common/guards/api-key.guard.ts`)

**Files:**
- Create: `modules/api-keys.md`
- Modify: `modules/README.md`

- [ ] **Step 1: Ler sistema de API keys do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/api-keys/api-keys.service.ts"
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/common/guards/api-key.guard.ts"
```

- [ ] **Step 2: Criar modules/api-keys.md**

- **Resumo:** Chaves de API com hash SHA256, scopes granulares, IP allowlist e expiração
- **Dependências:** core (auth, users), multi-tenant (companyId)
- **Schema Prisma:**
  - `ApiKey` (companyId, name, keyPrefix String, keyHash String unique, scopes Json, allowedIps Json, rateLimit Int?, expiresAt DateTime?, lastUsedAt DateTime?, createdBy @db.Uuid, isActive, createdAt) — `@@map("api_keys")`, `@@index([keyHash])`
- **Actions:**
  - `createApiKey(companyId, data)` — gera `nxk_<base64url(32 bytes)>`, armazena SHA256, retorna raw key uma única vez
  - `listApiKeys(companyId)` — lista com prefix + lastUsedAt (nunca hash)
  - `revokeApiKey(keyId)` — isActive=false
  - `validateApiKey(rawKey)` — SHA256 → lookup → verificar expiração + IP + scopes
- **Componentes UI:**
  - `ApiKeyList` — tabela com nome, prefix, scopes (badges), lastUsedAt, ações
  - `CreateApiKeyDialog` — form com nome, scopes (checkboxes), IP allowlist, expiração
  - `ApiKeyRevealOnce` — exibe chave uma vez com botão copiar (ícone `Copy` Lucide)
  - Ícone da seção: `Key` (Lucide)
- **Middleware Next.js:** verificar header `Authorization: Bearer nxk_...` em API routes
- **Segurança:** chave nunca armazenada, apenas hash. Rate limit por key.

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

### Task 12: Criar módulo onboarding

**Fonte:** Gestor (`apps/api/src/modules/onboarding/onboarding.service.ts`)

**Files:**
- Create: `modules/onboarding.md`
- Modify: `modules/README.md`

- [ ] **Step 1: Ler sistema de onboarding do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/modules/onboarding/onboarding.service.ts"
```

- [ ] **Step 2: Criar modules/onboarding.md**

- **Resumo:** Tour guiado por usuário com steps configuráveis, overlay e progresso
- **Dependências:** core (auth, users)
- **Pacotes npm:** nenhum além do core (Framer Motion para animações)
- **Schema Prisma:**
  - `OnboardingTour` (userId @db.Uuid unique, currentStep String, completedSteps Json @default("[]"), status enum NOT_STARTED/IN_PROGRESS/COMPLETED/SKIPPED, startedAt DateTime?, completedAt DateTime?, skippedAt DateTime?) — `@@map("onboarding_tours")`
- **Actions:**
  - `getOnboardingStatus()` — status do usuário logado
  - `startOnboarding()` — marca IN_PROGRESS
  - `completeStep(stepId)` — adiciona ao completedSteps, avança currentStep
  - `skipOnboarding()` — marca SKIPPED
- **Componentes UI:**
  - `OnboardingProvider` — context provider com estado do tour
  - `OnboardingStep` — tooltip posicionado com `Framer Motion` (animate presence), seta CSS apontando para targetSelector
  - `OnboardingOverlay` — backdrop escurecido com recorte no elemento ativo (clip-path)
  - `OnboardingProgress` — dots indicando step atual (ícone `Circle`/`CheckCircle2` Lucide)
  - Cores: `--primary` para step ativo, `--muted` para inativo
- **Integração:** `OnboardingProvider` no layout protegido, verificar status ao montar
- **Customizações:** array de steps `{ id, title, description, targetSelector, placement }` por plataforma

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

### Task 13: Criar módulo search

**Fonte:** devocional-hub (`src/app/api/search/route.ts`) + conceito de busca global do Roteador

**Files:**
- Create: `modules/search.md`
- Modify: `modules/README.md`

- [ ] **Step 1: Ler sistema de busca do devocional**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/devocional-hub/src/app/api/search/route.ts"
```

- [ ] **Step 2: Criar modules/search.md**

- **Resumo:** Busca global unificada com multi-índice, scoring e atalho Ctrl+K
- **Dependências:** core (auth), multi-tenant (tenant scoping via `buildTenantFilter`)
- **Schema Prisma:** Nenhum model próprio — busca nos models existentes
- **Actions:**
  - `globalSearch(query, options?)` — busca em entidades configuráveis com tenant scoping
  - Retorna `SearchResult[]`: `{ type, id, title, subtitle, matchField, score, url }`
  - Normalização: remove acentos (`normalize("NFD").replace(/\p{Diacritic}/gu, "")`), lowercase
  - Scoring: exact match (100) > startsWith (75) > contains (50)
  - Limit: 20 resultados, agrupados por type
- **Componentes UI:**
  - `SearchCommand` — dialog modal ativado por `Ctrl+K` ou clique no header
    - Input com ícone `Search` (Lucide), placeholder "Buscar..."
    - Debounce 300ms
    - Resultados agrupados por tipo com separadores
    - Navegação por teclado (↑↓ Enter Esc)
    - Ícone por tipo: `Building2` (empresa), `Users` (usuário), `Route` (rota), etc.
  - Cores: `--primary` para highlight do match, `--muted` para subtítulos
  - Animação: `Framer Motion` fade-in no dialog
- **Integração:**
  - Adicionar `SearchCommand` no header do layout protegido
  - Configurar entidades pesquisáveis em constante `SEARCH_CONFIG`:
    ```typescript
    const SEARCH_CONFIG = [
      { type: "company", model: "company", fields: ["name", "slug"], icon: Building2, urlPattern: "/companies/{id}" },
      { type: "user", model: "user", fields: ["name", "email"], icon: Users, urlPattern: "/users" },
    ];
    ```
- **Customizações:** entidades, campos, ícones, urlPatterns — tudo via `SEARCH_CONFIG`

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

## FASE 4 — Novo Pattern (1 task)

---

### Task 14: Criar pattern outbox

**Fonte:** Gestor (`apps/api/src/outbox/`)

**Files:**
- Create: `patterns/outbox.md`
- Modify: `patterns/README.md`

- [ ] **Step 1: Ler sistema de outbox do Gestor**

```bash
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/outbox/outbox.service.ts"
cat "/Users/joaovitorzanini/Desktop/Claude Code/Gestor de Webhook/apps/api/src/outbox/outbox.processor.ts"
```

- [ ] **Step 2: Criar patterns/outbox.md**

- **Resumo:** Publicação confiável de eventos via tabela transacional
- **Quando usar:** Quando eventos precisam ser emitidos de forma confiável junto com operações de banco, sem risco de perda por crash
- **Schema Prisma:**
  - `OutboxEvent` (aggregateType String, aggregateId String @db.Uuid, eventType String, payload Json @db.JsonB, status enum PENDING/PUBLISHED/FAILED, retries Int @default(0), maxRetries Int @default(3), publishedAt DateTime?, createdAt) — `@@map("outbox_events")`, `@@index([status, createdAt])`
- **Arquitetura:**
  1. Serviço salva evento na mesma `$transaction` que a mudança de domínio
  2. BullMQ repeatable job (cron: `*/5 * * * * *`) processa PENDING
  3. Emite via `publishRealtimeEvent()` ou callback customizado
  4. Marca PUBLISHED ou incrementa retries (FAILED se max atingido)
- **Arquivos a criar:**
  - `src/lib/outbox.ts` — `publishOutboxEvent(tx, params)`, `processOutboxEvents()`
  - Worker integration no BullMQ
- **Integração:** chamar dentro de `$transaction` junto com operação principal
- **Customizações:** intervalo de polling, maxRetries, TTL de eventos publicados, handler de publicação

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

## FASE 5 — Interoperabilidade e Finalização (3 tasks)

---

### Task 15: Atualizar integration-map.md — mapa de dependências cruzadas

**Problema:** O mapa atual só cobre os 6 módulos originais. Precisa incluir os novos e documentar como se conectam.

**Files:**
- Modify: `integration-map.md`

- [ ] **Step 1: Mapear todas as dependências cruzadas**

Diagrama completo de dependências:

```
core (auth, users, profile, password-reset, email)
  ├── multi-tenant (depende: core) + feature flags
  │     ├── billing (depende: multi-tenant, encryption)
  │     ├── api-keys (depende: multi-tenant)
  │     ├── notifications (depende: multi-tenant, realtime)
  │     └── audit-log (depende: multi-tenant)
  ├── encryption (independente)
  ├── toast (independente)
  ├── realtime (depende: Redis)
  ├── onboarding (depende: core)
  └── search (depende: core, multi-tenant)

patterns (independentes, adaptáveis):
  ├── dashboard
  ├── queue
  ├── settings
  ├── webhook-routing
  └── outbox (depende: queue)
```

- [ ] **Step 2: Atualizar integration-map.md**

Para cada novo módulo, documentar:
- Quais imports cruzados existem
- Quais models referenciam quais
- Qual a ordem de instalação (se billing depende de multi-tenant, multi-tenant deve ser instalado primeiro)

- [ ] **Step 3: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add integration-map.md
git commit -m "docs: atualiza integration-map com todos os módulos e dependências cruzadas"
```

---

### Task 16: Atualizar skills e templates — versão 2.0.0

**Files:**
- Modify: `skills/criar/SKILL.md`
- Modify: `skills/listar/SKILL.md`
- Modify: `.claude-plugin/plugin.json`
- Modify: `templates/app.config.ts`

- [ ] **Step 1: Atualizar skills/listar/SKILL.md**

A skill listar usa auto-discovery (`ls modules/*.md`), então os novos módulos já aparecem automaticamente. Verificar se precisa de ajuste manual.

- [ ] **Step 2: Atualizar skills/criar/SKILL.md**

No passo 4 (seleção de módulos), adicionar:
- billing — "Carteira digital com ledger atômico e gateway de pagamento"
- api-keys — "Chaves de API com hash SHA256, scopes e IP allowlist"
- onboarding — "Tour guiado para novos usuários com steps e overlay"
- search — "Busca global unificada com Ctrl+K e multi-índice"

No passo 5 (patterns):
- outbox — "Publicação confiável de eventos via tabela transacional"

**NOTA:** feature-flags NÃO aparece separado — faz parte do multi-tenant.

- [ ] **Step 3: Atualizar templates/app.config.ts**

Adicionar no objeto `features`:

```typescript
features: {
  // existentes
  multiTenant: {{MULTI_TENANT}},
  notifications: {{NOTIFICATIONS}},
  auditLog: {{AUDIT_LOG}},
  realtime: {{REALTIME}},
  encryption: {{ENCRYPTION}},
  toast: {{TOAST}},
  dashboard: {{DASHBOARD}},
  queue: {{QUEUE}},
  settings: {{SETTINGS}},
  // novos
  billing: {{BILLING}},
  apiKeys: {{API_KEYS}},
  onboarding: {{ONBOARDING}},
  search: {{SEARCH}},
}
```

- [ ] **Step 4: Bumpar versão para 2.0.0**

```json
{ "version": "2.0.0" }
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git add skills/ .claude-plugin/plugin.json templates/app.config.ts
git commit -m "feat: Blueprint v2.0.0 — 4 módulos novos, 1 pattern, 7 atualizações"
```

---

### Task 17: Validação end-to-end — teste de criação

**Problema:** Sem teste, não sabemos se o Blueprint funciona após todas as mudanças.

**Files:**
- Nenhum arquivo criado — apenas validação

- [ ] **Step 1: Executar skill listar e verificar catálogo**

Invocar `/nexus-ai-blueprint:listar` e confirmar que:
- 10 módulos aparecem (6 originais + 4 novos)
- 5 patterns aparecem (4 originais + 1 novo)
- Nenhum módulo duplica funcionalidade de outro
- Todas as dependências fazem sentido

- [ ] **Step 2: Verificar consistência interna**

Para cada módulo novo, validar:
- Seções obrigatórias presentes (Resumo, Dependências, Schema, Arquivos, Actions, Integração, Segurança)
- Schema Prisma usa `@@map()`, `@map()`, `@db.Uuid` corretamente
- Componentes UI seguem regras (Lucide, CSS variables, render prop)
- Dependências listadas existem como módulos reais
- Paths de arquivos consistentes com estrutura padrão

- [ ] **Step 3: Verificar integration-map consistência**

- Todo módulo novo está no mapa
- Dependências circulares inexistentes
- Ordem de instalação clara

- [ ] **Step 4: Push final para GitHub**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/nexus-ai-blueprint"
git push origin main
```

---

## Resumo de Entregas

| Fase | Tasks | O que entrega |
|------|-------|---------------|
| 1 — Base | 1-2 | Design system corrigido + CONTRIBUTING.md (processo contínuo) |
| 2 — Updates | 3-9 | 7 módulos atualizados (auth, users, email, profile, encryption, multi-tenant, audit-log) |
| 3 — Novos | 10-13 | 4 novos módulos (billing, api-keys, onboarding, search) |
| 4 — Pattern | 14 | 1 novo pattern (outbox) |
| 5 — Final | 15-17 | Integration map, skills v2.0.0, validação end-to-end |

**Total:** 17 tasks
**Módulos após conclusão:** 10 (era 6)
**Patterns após conclusão:** 5 (era 4)
**Versão:** 1.2.0 → 2.0.0

**Mudanças vs plano anterior:**
- ~~feature-flags como módulo~~ → absorvido no multi-tenant (Task 8)
- **+Task 1:** Corrigir MASTER.md (cores erradas)
- **+Task 2:** CONTRIBUTING.md (processo contínuo)
- **+Task 15:** Integration map (interoperabilidade)
- **+Task 17:** Validação end-to-end
- **Regras de UI** em todas as tasks de módulos com componentes
- **Templates atualizados** (app.config.ts com novos features)
