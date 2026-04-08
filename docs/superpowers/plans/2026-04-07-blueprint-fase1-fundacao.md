# Blueprint Nexus AI — Fase 1: Fundação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a pasta `blueprint/` com toda a documentação e templates da Fase 1, permitindo ao Claude Code construir novas plataformas a partir do Nexus.

**Architecture:** 16 arquivos em `blueprint/` — 4 docs raiz (README, architecture, integration-map, hardcoded-values), 4 docs core (overview, database, deploy, ui), 7 templates reais, e atualização do CLAUDE.md. Cada arquivo referencia o código real do Nexus (sem duplicação de código). Templates são baseados nos arquivos reais com variáveis parametrizáveis.

**Tech Stack:** Markdown (documentação), TypeScript/CSS/YAML (templates)

**Spec:** `docs/superpowers/specs/2026-04-07-blueprint-nexus-ai-design.md`

---

## File Structure

### Arquivos a criar:

```
blueprint/
├── README.md
├── architecture.md
├── integration-map.md
├── hardcoded-values.md
├── core/
│   ├── overview.md
│   ├── database.md
│   ├── deploy.md
│   └── ui.md
└── templates/
    ├── app.config.ts
    ├── globals.css
    ├── docker-compose.yml
    ├── build.yml
    ├── Dockerfile
    ├── env.example
    └── claude-md.template
```

### Arquivos a modificar:

- `CLAUDE.md` (raiz) — adicionar seção Blueprint

---

## Task 1: Estrutura de diretórios + README.md

**Files:**
- Create: `blueprint/README.md`

**Contexto:** O README é o arquivo mais importante — é o que o Claude Code lê primeiro. Contém o catálogo de módulos, sugestões por tipo de plataforma, e o fluxo guiado completo de criação.

- [ ] **Step 1: Criar diretórios e placeholders**

```bash
mkdir -p blueprint/core blueprint/modules blueprint/patterns blueprint/templates
```

Criar arquivos placeholder nas pastas que ficarão vazias na Fase 1:

**blueprint/modules/README.md:**
```markdown
# Módulos Opcionais

Documentação dos módulos opcionais será adicionada nas próximas fases:

- **Fase 2:** multi-tenant, notifications, audit-log, toast
- **Fase 3:** realtime, encryption

Cada módulo segue o formato definido na spec (`docs/superpowers/specs/2026-04-07-blueprint-nexus-ai-design.md`, seção 9).
```

**blueprint/patterns/README.md:**
```markdown
# Patterns Arquiteturais

Documentação dos patterns será adicionada na Fase 3:

- dashboard, queue, settings, webhook-routing

Cada pattern segue o formato definido na spec (`docs/superpowers/specs/2026-04-07-blueprint-nexus-ai-design.md`, seção 10).
```

- [ ] **Step 2: Escrever README.md**

O README deve conter EXATAMENTE estas seções nesta ordem:

```markdown
# Blueprint Nexus AI

> Documentação modular para criar novas plataformas a partir da base técnica do Nexus.
> O Claude Code lê este blueprint e constrói plataformas completas — do login ao deploy.

**Versão:** 1.0
**Última atualização:** 2026-04-07
**Projeto de referência:** Nexus Roteador Webhook

---

## Como Usar

Este blueprint é lido pelo Claude Code para construir novas plataformas.
Ao iniciar um novo projeto, aponte o Claude Code para esta pasta e diga:
"Cria uma nova plataforma usando o blueprint em [caminho]/blueprint/"

---

## Catálogo de Módulos

### Core (sempre incluído)
| Subsistema | Descrição | Doc |
|------------|-----------|-----|
| Auth | Login, JWT stateless, rate limiting, middleware | core/overview.md |
| Users | CRUD, hierarquia 4 níveis, ativação/desativação | core/overview.md |
| Profile | Avatar, nome, email com verificação, senha, tema | core/overview.md |
| Password Reset | Esqueci senha com token + email (1h expiração) | core/overview.md |
| Email | Resend SDK, templates HTML dark-themed responsivos | core/overview.md |

### Módulos Opcionais
| Módulo | Descrição | Depende de | Doc | Status |
|--------|-----------|-----------|-----|--------|
| Multi-tenant | Empresas, workspaces, scoping de dados | auth, users | modules/multi-tenant.md | Fase 2 |
| Notifications | Feed, badge no header, contagem, mark as read | auth | modules/notifications.md | Fase 2 |
| Audit Log | Registro fire-and-forget (quem, o quê, quando) | auth | modules/audit-log.md | Fase 2 |
| Real-time | SSE + Redis Pub/Sub, useRealtime hook | Redis | modules/realtime.md | Fase 3 |
| Encryption | AES-256-GCM, encrypt/decrypt/mask | — | modules/encryption.md | Fase 3 |
| Toast | Sonner customizado, pilha bottom-up, timers independentes | — | modules/toast.md | Fase 2 |

> **Nota:** Docs marcados como Fase 2/3 ainda não existem. Serão criados quando implementarmos essas fases.

### Patterns (arquitetura adaptável)
| Pattern | Descrição | Depende de | Doc | Status |
|---------|-----------|-----------|-----|--------|
| Dashboard | Stats cards, gráficos Recharts, filtros, tabela | — | patterns/dashboard.md | Fase 3 |
| Queue | BullMQ worker, retry com backoff, DLQ | Redis, realtime (opc.) | patterns/queue.md | Fase 3 |
| Settings | Config globais key-value, admin-only | auth | patterns/settings.md | Fase 3 |
| Webhook Routing | Receber, normalizar, dedup, entregar | queue, encryption | patterns/webhook-routing.md | Fase 3 |

> **Nota:** Docs de patterns serão criados na Fase 3.

---

## Sugestões por Tipo de Plataforma

| Tipo | Módulos recomendados |
|------|---------------------|
| SaaS multi-tenant | core + multi-tenant + dashboard + notifications + audit-log |
| Painel admin interno | core + dashboard + audit-log + settings |
| API/Integração | core + queue + encryption + webhook-routing |
| Ferramenta simples | core apenas |
| CRM | core + multi-tenant + dashboard + notifications + audit-log + encryption |

---

## Fluxo de Criação de Nova Plataforma

### Passo 1: Coleta de Identidade

Perguntar ao usuário:

1. **Nome da plataforma** — ex: "Nexus CRM"
2. **O que ela faz** (uma frase) — ex: "Gestão de clientes e pipeline de vendas"
3. **Interno Nexus AI ou externo?**
   - Se interno: domínio será `[slug].nexusai360.com`
   - Se externo: perguntar domínio completo
4. **Cor primária** (hex) — se não souber, sugerir baseado no tipo. Default: `#7c3aed`
5. **Logo** (caminho) — se não tiver, usar placeholder
6. **Registry Docker** — default: `ghcr.io/jvzanini`

### Passo 2: Seleção de Módulos

Apresentar o catálogo completo (seção acima).
Marcar recomendados baseado no tipo da plataforma.
Perguntar se quer adicionar ou remover.

### Passo 3: Criação do Projeto

Ordem de execução:

1. Criar diretório, `npm init`, `git init`
2. Gerar `src/lib/app.config.ts` a partir de `blueprint/templates/app.config.ts`
3. Instalar dependências:
   - Core: `next react react-dom next-auth@5 @auth/prisma-adapter prisma @prisma/client bcryptjs zod resend tailwindcss @tailwindcss/postcss postcss framer-motion lucide-react sonner next-themes ioredis`
   - Types: `@types/node @types/react @types/react-dom @types/bcryptjs typescript`
   - shadcn/ui: `@base-ui-components/react`
   - Por módulo: `bullmq` (queue), `recharts` (dashboard)
4. Gerar `prisma/schema.prisma` combinando core + módulos (ler `blueprint/core/database.md`)
5. Gerar `src/app/globals.css` a partir de `blueprint/templates/globals.css` (substituir cores)
6. Gerar `docker-compose.yml` a partir de `blueprint/templates/docker-compose.yml`
7. Gerar `.github/workflows/build.yml` a partir de `blueprint/templates/build.yml`
8. Gerar `docker/Dockerfile` a partir de `blueprint/templates/Dockerfile`
9. Gerar `.env.example` a partir de `blueprint/templates/env.example`
10. Implementar core (ler `blueprint/core/overview.md`, referenciar código do Nexus)
11. Implementar módulos selecionados (ler `blueprint/modules/{nome}.md`)
12. Implementar patterns selecionados (ler `blueprint/patterns/{nome}.md`)
13. Gerar `CLAUDE.md` a partir de `blueprint/templates/claude-md.template`

### Passo 4: Validação

1. `npx tsc --noEmit` — zero erros
2. `npm run build` — build passa
3. `docker compose config` — compose válido
4. Verificar que `APP_CONFIG` é a única fonte de identidade

### Passo 5: Registro

No CLAUDE.md do novo projeto, incluir:
- "Criado a partir do Nexus Blueprint em [caminho]"
- Lista de módulos incluídos
- "Para adicionar módulos: ler blueprint/modules/{nome}.md"

---

## Fluxo: Adicionar Módulo a Plataforma Existente

1. Ler o CLAUDE.md da plataforma → saber quais módulos já tem
2. Ler `blueprint/modules/{novo-modulo}.md`
3. Ler `blueprint/integration-map.md` → entender impacto
4. Seguir seção "Integração" do módulo:
   - Adicionar modelos ao schema Prisma
   - Criar migration
   - Implementar server actions
   - Adicionar componentes UI
   - Atualizar navigation se necessário
5. Atualizar CLAUDE.md com novo módulo

---

## Changelog

- v1.0 (2026-04-07) — Versão inicial: core + 6 módulos + 4 patterns
```

- [ ] **Step 3: Commit**

```bash
git add blueprint/README.md blueprint/modules/README.md blueprint/patterns/README.md
git commit -m "docs(blueprint): README com catálogo e fluxos + placeholders modules/patterns"
```

---

## Task 2: architecture.md

**Files:**
- Create: `blueprint/architecture.md`

**Contexto:** Descreve stack, estrutura de pastas e padrões de código que toda plataforma segue.

- [ ] **Step 1: Ler arquivos de referência do Nexus**

Ler estes arquivos para extrair padrões reais:
- `package.json` — dependências e versões
- `tsconfig.json` — config TypeScript
- `src/lib/actions/company.ts` — exemplo de server action pattern
- `src/lib/auth.ts` — exemplo de getCurrentUser pattern
- `src/lib/prisma.ts` — exemplo de singleton pattern
- `src/app/(protected)/layout.tsx` — exemplo de protected layout pattern
- `src/components/layout/sidebar.tsx` — exemplo de client component pattern

- [ ] **Step 2: Escrever architecture.md**

Seções obrigatórias:

1. **Stack Técnica** — Tabela com: Camada | Tecnologia | Propósito
   - Incluir TODAS as tecnologias da spec seção 6.1
   - Adicionar notas importantes (ex: Prisma v7 importa de `@/generated/prisma/client`, shadcn usa `render` prop não `asChild`)

2. **Estrutura de Pastas** — Árvore completa de `src/` conforme spec seção 6.2
   - Cada diretório com descrição de propósito
   - Indicar quais pastas são condicionais (ex: `hooks/use-realtime.ts` só se módulo realtime)

3. **Padrão: Server Actions** — Código completo do pattern:
   ```typescript
   "use server";
   import { getCurrentUser } from "@/lib/auth";
   import { z } from "zod";
   
   const schema = z.object({ /* campos */ });
   type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string; fieldErrors?: Record<string, string[]> };
   
   export async function minhaAction(input: z.infer<typeof schema>): Promise<ActionResult<TipoRetorno>> {
     const user = await getCurrentUser();
     if (!user) return { success: false, error: "Não autenticado" };
     
     const parsed = schema.safeParse(input);
     if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
     
     try {
       const result = await prisma.model.create({ data: parsed.data });
       return { success: true, data: result };
     } catch {
       return { success: false, error: "Erro ao processar" };
     }
   }
   ```

4. **Padrão: Prisma Singleton** — Código do pattern baseado em `src/lib/prisma.ts` do Nexus (ler arquivo real e adaptar)

5. **Padrão: getCurrentUser()** — Código baseado em `src/lib/auth.ts` do Nexus

6. **Padrão: Protected Layout** — Código baseado em `src/app/(protected)/layout.tsx`

7. **Padrão: Client Component** — Exemplo de componente com `'use client'`, props tipadas, Framer Motion variants

8. **Padrão: JWT Refresh** — Explicação do callback jwt() que faz query no banco a cada request. Incluir o trecho de código do `auth.config.ts` do Nexus

9. **Convenções**
   - Commits em português
   - Código e variáveis em inglês
   - Textos visíveis ao usuário em português com acentos corretos
   - Ícones: Lucide React (nunca emojis)
   - Animações: Framer Motion com `as const` em variants

- [ ] **Step 3: Commit**

```bash
git add blueprint/architecture.md
git commit -m "docs(blueprint): architecture com stack, padrões e convenções"
```

---

## Task 3: integration-map.md + hardcoded-values.md

**Files:**
- Create: `blueprint/integration-map.md`
- Create: `blueprint/hardcoded-values.md`

**Contexto:** O integration-map mostra dependências a nível de arquivo. O hardcoded-values lista tudo que muda por plataforma.

- [ ] **Step 1: Escrever integration-map.md**

Conteúdo baseado na spec seção 7. Deve incluir:

1. **Fluxo de autenticação** — cadeia completa de arquivos:
   ```
   Request → middleware.ts → auth.ts → auth.config.ts → auth-helpers.ts → rate-limit.ts → prisma
   ```

2. **Tabela de impacto por módulo** — para CADA módulo (multi-tenant, notifications, audit-log, realtime, encryption, toast), uma tabela com:
   | Ação | Arquivo | Mudança |
   
   Copiar as tabelas da spec seção 7.2 (são 6 tabelas completas).

3. **Diagrama de dependências entre módulos**:
   ```
   Core (sempre)
   ├── multi-tenant (→ modifica: tenant scoping em todas actions)
   ├── notifications (→ opcional: realtime para push)
   ├── audit-log (→ independente, fire-and-forget)
   ├── realtime (→ usado por: notifications, dashboard)
   ├── encryption (→ usado por: qualquer dado sensível)
   └── toast (→ independente, UI pura)
   ```

- [ ] **Step 2: Escrever hardcoded-values.md**

Conteúdo baseado na spec seção 3. Organizar em 5 categorias:

1. **Identidade e Marca** — tabela com 8 itens (login-content, sidebar, login page, email.ts)
2. **Cores e Tema** — tabela com 4 itens (globals.css, login-content, sidebar)
3. **Infraestrutura** — tabela com 5 itens (docker-compose, GitHub Actions)
4. **Rotas Públicas** — tabela com 2 itens (auth.config.ts, middleware.ts)
5. **Textos em Português** — tabela com exemplos de cada arquivo

Cada item tem: Arquivo | Valor atual no Nexus | O que substituir (APP_CONFIG ou manual)

- [ ] **Step 3: Commit**

```bash
git add blueprint/integration-map.md blueprint/hardcoded-values.md
git commit -m "docs(blueprint): integration-map e inventário hardcoded-values"
```

---

## Task 4: core/overview.md

**Files:**
- Create: `blueprint/core/overview.md`

**Contexto:** O arquivo mais denso. Documenta os 5 subsistemas inseparáveis do core com detalhe completo.

- [ ] **Step 1: Ler TODOS os arquivos fonte do core no Nexus**

Ler na íntegra:
- `src/auth.ts`
- `src/auth.config.ts`
- `src/middleware.ts`
- `src/lib/auth.ts`
- `src/lib/auth-helpers.ts`
- `src/lib/rate-limit.ts`
- `src/lib/actions/users.ts`
- `src/lib/actions/profile.ts`
- `src/lib/actions/password-reset.ts`
- `src/lib/email.ts`
- `src/lib/constants/roles.ts`
- `src/lib/constants/navigation.ts`

- [ ] **Step 2: Escrever core/overview.md**

Para CADA um dos 5 subsistemas (Auth, Users, Profile, Password Reset, Email), documentar com este formato — conforme exemplo da spec seção 8.1:

```markdown
## {Nome do Subsistema}

### O que faz
{resumo funcional, 2-3 frases}

### Arquivos no Nexus
{lista completa com caminho + descrição de uma linha}

### Pacotes npm
{lista sem versões}

### Variáveis de ambiente
{nome — descrição — como gerar/exemplo}

### Schema Prisma
{modelos COMPLETOS extraídos do Nexus — NÃO abreviar com "..."}

### Server Actions / Funções exportadas
{para cada função: nome(params) → retorno — descrição do comportamento}

### O que customizar por plataforma
{lista concreta do que muda}

### Segurança
{medidas implementadas}
```

**Conteúdo específico por subsistema:**

**Auth** — Copiar o exemplo da spec seção 8.1 e expandir com dados reais do código.

**Users** — Documentar:
- `getUsers()` — lista paginada com filtros
- `getUserDetail()` — detalhe com memberships
- `getCompanyMembers()` — membros de uma empresa
- `createUser()` — criar com convite
- `updateUserRole()` — hierarquia de permissão (quem pode mudar quem)
- `deleteUser()` — desativação (soft delete)
- Hierarquia: super_admin > admin > manager > viewer
- Constants de `roles.ts` (PLATFORM_ROLE_LABELS, COMPANY_ROLE_LABELS, hierarquias)
- Constants de `navigation.ts` (getNavItems, MAIN_NAV_ITEMS, RESTRICTED_NAV_ITEMS)

**Profile** — Documentar:
- `getProfile()` — dados do usuário atual
- `updateProfile()` — nome, avatar
- `updatePassword()` — old password + new password com bcrypt
- `requestEmailChange()` — gera token, envia email de verificação
- `verifyEmailChange()` — valida token, atualiza email
- Tema (dark/light/system) salvo no User model

**Password Reset** — Documentar:
- `requestPasswordReset()` — rate limited, gera token 1h, envia email
- `resetPassword()` — valida token, hash nova senha, marca token usado
- Proteção contra user enumeration (sempre retorna sucesso)

**Email** — Documentar:
- `sendPasswordResetEmail()` — template HTML completo (layout dark, botão gradient, footer)
- `sendEmailChangeVerification()` — template similar
- Resend SDK: API key, from address
- O que customizar: `emailFrom`, nome da plataforma nos templates, cores do botão, domínio

- [ ] **Step 3: Commit**

```bash
git add blueprint/core/overview.md
git commit -m "docs(blueprint): core/overview com 5 subsistemas detalhados"
```

---

## Task 5: core/database.md

**Files:**
- Create: `blueprint/core/database.md`

- [ ] **Step 1: Ler schema Prisma completo**

Ler: `prisma/schema.prisma` — arquivo inteiro.

- [ ] **Step 2: Escrever core/database.md**

Seções:

1. **Configuração base** — datasource, generator, output para `../src/generated/prisma/client`
   - Nota: Prisma v7 usa `@/generated/prisma/client` (NÃO `@prisma/client`)
   - Adapter: `@prisma/adapter-pg`

2. **Enums base** — PlatformRole, Theme (completos)

3. **Modelo User** — COPIAR INTEIRO do Nexus, com todos os campos e relações. Marcar campos opcionais:
   - `avatarUrl` — usado por Profile
   - `theme` — usado por Profile
   - `invitedById` — usado por Users

4. **Modelo PasswordResetToken** — COPIAR INTEIRO

5. **Modelo EmailChangeToken** — COPIAR INTEIRO

6. **Modelos por módulo** — Para cada módulo, listar os modelos que ele adiciona. Marcar claramente com header:

   ```markdown
   ## Modelos adicionados por: Multi-tenant
   (modelo Company completo)
   (modelo UserCompanyMembership completo)
   (enum CompanyRole)

   ## Modelos adicionados por: Notifications
   (modelo Notification completo)
   (enum NotificationType)

   ## Modelos adicionados por: Audit Log
   (modelo AuditLog completo)
   (enum ActorType)

   ## Modelos adicionados por: Settings
   (modelo GlobalSettings completo)

   ## Modelos específicos do domínio (exemplos do Nexus)
   (CompanyCredential, WebhookRoute, InboundWebhook, RouteDelivery, DeliveryAttempt)
   Nota: estes são específicos do Roteador de Webhook.
   Cada plataforma terá seus próprios modelos de domínio.
   ```

7. **Indexes e performance** — listar os indexes compostos do Nexus como referência de boas práticas

8. **Singleton Prisma** — código completo de `src/lib/prisma.ts` do Nexus

- [ ] **Step 3: Commit**

```bash
git add blueprint/core/database.md
git commit -m "docs(blueprint): core/database com schema completo e modelos por módulo"
```

---

## Task 6: core/deploy.md

**Files:**
- Create: `blueprint/core/deploy.md`

- [ ] **Step 1: Ler arquivos de deploy do Nexus**

Ler na íntegra:
- `docker-compose.yml`
- `docker/Dockerfile`
- `.github/workflows/build.yml`

- [ ] **Step 2: Escrever core/deploy.md**

Seções:

1. **Dockerfile** — Descrever o build multi-stage com código:
   - Stage 1 (deps): `node:20-alpine`, `npm ci --omit=dev`
   - Stage 2 (builder): `npx prisma generate`, `npm run build`
   - Stage 3 (runner): user `nextjs:1001`, standalone output, porta 3000
   - Listar arquivos copiados: `.next/standalone`, `.next/static`, `public`, `prisma`, `src/generated`
   - Se módulo queue incluso: copiar também `worker/`

2. **docker-compose.yml** — Descrever os services:
   - **app** — Next.js, porta 3000, Traefik labels (TLS, redirect HTTPS)
   - **worker** (condicional — só se pattern queue incluso) — mesmo image, entrypoint `node worker/index.js`
   - **db** — PostgreSQL 16 Alpine, volume `postgres_data`
   - **redis** — Redis 7 Alpine, AOF persistence, volume `redis_data`
   - Redes: `traefik-public` (externa), `internal` (overlay)
   - O que parametrizar: image name, domain, db user/name, network name

3. **GitHub Actions CI/CD** — Descrever o pipeline:
   - Trigger: push to main
   - Job test: checkout, node 20, npm ci, prisma generate, npm test
   - Job build: login GHCR, docker buildx, push com tags SHA + latest
   - Job deploy: Portainer API — pull image + force update services
   - Secrets necessários: `PORTAINER_URL`, `PORTAINER_TOKEN`, `GHCR_TOKEN`
   - O que parametrizar: image name, service names

4. **Variáveis de ambiente** — Tabela completa:
   | Nome | Obrigatório | Módulo | Descrição | Exemplo |
   - DATABASE_URL (core)
   - REDIS_URL (core — rate limiting)
   - NEXTAUTH_SECRET (core)
   - NEXTAUTH_URL (core)
   - RESEND_API_KEY (core — email)
   - ENCRYPTION_KEY (encryption)
   - ADMIN_EMAIL (core — seed)
   - ADMIN_PASSWORD (core — seed)
   - PORTAINER_URL (deploy)
   - PORTAINER_TOKEN (deploy)
   - GHCR_TOKEN (deploy)

5. **Primeira execução** — Checklist:
   - Criar `.env` com variáveis obrigatórias
   - `npx prisma migrate deploy` (ou `npx prisma db push` em dev)
   - Seed do admin: script ou manual
   - Verificar: `curl https://domain/api/health`
   - Verificar: acessar `/login` no browser

- [ ] **Step 3: Commit**

```bash
git add blueprint/core/deploy.md
git commit -m "docs(blueprint): core/deploy com Docker, CI/CD e env vars"
```

---

## Task 7: core/ui.md

**Files:**
- Create: `blueprint/core/ui.md`

- [ ] **Step 1: Ler arquivos de UI do Nexus**

Ler na íntegra:
- `src/app/globals.css` — TODAS as CSS variables
- `src/app/(auth)/login/page.tsx` — layout do login
- `src/components/login/login-content.tsx` — form do login
- `src/app/(auth)/forgot-password/page.tsx` e form
- `src/app/(auth)/reset-password/page.tsx` e form
- `src/app/(auth)/verify-email/page.tsx` e content
- `src/app/(protected)/layout.tsx` — protected layout
- `src/components/layout/sidebar.tsx` — sidebar
- `src/components/providers/theme-provider.tsx`
- `src/components/providers/theme-initializer.tsx`
- `src/components/ui/button.tsx` — exemplo shadcn
- `src/components/ui/custom-select.tsx` — custom select

- [ ] **Step 2: Escrever core/ui.md**

Seções:

1. **Design Tokens** — TODAS as CSS variables do globals.css organizadas por grupo:
   - Background/Foreground (light + dark)
   - Card, Popover
   - Primary, Secondary, Muted, Accent, Destructive
   - Border, Input, Ring
   - Sidebar (8 variáveis)
   - Charts (5 cores)
   - Radius scale (sm através 4xl)
   - Para CADA variável: nome, valor light, valor dark, propósito

2. **Como trocar identidade visual** — Receita prática:
   ```
   Para mudar a cor primária de violet (#7c3aed) para azul (#2563EB):
   1. Trocar --primary (light e dark)
   2. Trocar --ring (mesma cor do primary)
   3. Trocar --sidebar-primary
   4. Trocar --chart-1 (cor principal dos gráficos)
   5. No login-content.tsx: trocar classes violet-* por blue-*
   6. Na sidebar.tsx: trocar violet-500 por blue-500
   ```

3. **Tema dark/light/system** — Como funciona:
   - next-themes `ThemeProvider` com `attribute="class"`
   - `ThemeInitializer` aplica tema do User model no load
   - CSS variables em `:root` (light) e `.dark` (dark)
   - User model salva preferência (campo `theme`)

4. **Layout protegido** — Estrutura:
   - `flex h-screen overflow-hidden`
   - Sidebar (w-60, hidden em mobile)
   - Main (`flex-1 overflow-y-auto`, `max-w-7xl`, padding responsivo)
   - Mobile: sidebar com overlay e animação slide

5. **Páginas de auth** — Para cada página:
   - **Login**: gradient background (violet-950 → purple-950), logo animada com glow, form centralizado, botão gradient, forgot password link
   - **Forgot Password**: form simples com email, mensagem de sucesso
   - **Reset Password**: token da URL, novo password + confirmação
   - **Verify Email**: verificação automática por token
   - Descrever o layout e componentes de cada uma referenciando os arquivos do Nexus

6. **Componentes base** — Lista com observações:
   - button.tsx — variantes: default, ghost, destructive, outline
   - input.tsx — com focus ring
   - card.tsx — container com shadow
   - dialog.tsx / alert-dialog.tsx — modais
   - table.tsx — data table
   - select.tsx / custom-select.tsx — dropdowns (preferir custom-select)
   - badge.tsx — tags/labels
   - tabs.tsx — navegação por abas
   - switch.tsx — toggle
   - label.tsx — form labels
   - textarea.tsx — multi-line input
   - calendar.tsx — date picker
   - scroll-area.tsx — scroll customizado
   - collapsible.tsx — expand/collapse
   - popover.tsx — tooltip/popover
   - **Nota:** shadcn/ui usa `render` prop, NÃO `asChild`

7. **Animações** — Padrões Framer Motion:
   - Container stagger: `{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }`
   - Item fade-in: `{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }`
   - Timing: 200-300ms, easing: `ease` ou spring `{ damping: 25, stiffness: 200 }`
   - Usar `as const` em variants com `ease`

8. **Responsividade** — Breakpoints e regras:
   - 375px (mobile), 768px (tablet), 1024px (desktop), 1440px (wide)
   - Sidebar: hidden < 1024px, overlay com backdrop em mobile
   - Main content: `px-4 pt-16` mobile, `px-6 pt-8` tablet+
   - Tabelas: scroll horizontal em mobile

- [ ] **Step 3: Commit**

```bash
git add blueprint/core/ui.md
git commit -m "docs(blueprint): core/ui com tokens, tema, layout, auth pages e componentes"
```

---

## Task 8: Templates — app.config.ts + globals.css

**Files:**
- Create: `blueprint/templates/app.config.ts`
- Create: `blueprint/templates/globals.css`

- [ ] **Step 1: Ler globals.css real do Nexus**

Ler: `src/app/globals.css` — arquivo inteiro.

- [ ] **Step 2: Escrever app.config.ts template**

```typescript
// Template: App Config — Identidade centralizada da plataforma
// Substituir os valores marcados com ← ao criar nova plataforma

export const APP_CONFIG = {
  // === Identidade ===
  name: "{{APP_NAME}}",              // ← Nome da plataforma (ex: "Nexus CRM")
  shortName: "{{SHORT_NAME}}",       // ← Nome curto (ex: "CRM")
  description: "{{DESCRIPTION}}",    // ← Descrição (ex: "Gestão de clientes")
  domain: "{{DOMAIN}}",              // ← Domínio (ex: "crm.nexusai360.com")

  // === Visual ===
  logo: "/logo.png",                 // ← Caminho do logo em public/
  brandDark: "/marca-dark.png",      // ← Marca para dark mode
  brandLight: "/marca-light.png",    // ← Marca para light mode

  // === Email ===
  emailFrom: '{{APP_NAME}} <noreply@{{EMAIL_DOMAIN}}>',  // ← From address
  emailDomain: "{{EMAIL_DOMAIN}}",   // ← Domínio de email (ex: "nexusai360.com")

  // === Deploy ===
  registry: "{{REGISTRY}}",          // ← Registry Docker (ex: "ghcr.io/jvzanini")
  projectSlug: "{{PROJECT_SLUG}}",   // ← Slug (ex: "nexus-crm")
  network: "{{NETWORK}}",            // ← Rede Docker (ex: "rede_nexusAI")

  // === Módulos habilitados ===
  features: {
    multiTenant: false,               // ← Empresas e workspaces
    notifications: false,             // ← Feed de notificações
    auditLog: false,                  // ← Registro de ações
    realtime: false,                  // ← SSE + Redis Pub/Sub
    encryption: false,                // ← AES-256-GCM
    toast: true,                      // ← Toast notifications (recomendado)
    dashboard: false,                 // ← Painel com métricas
    queue: false,                     // ← BullMQ worker
    settings: false,                  // ← Config globais
  },
} as const;

export type AppConfig = typeof APP_CONFIG;
```

- [ ] **Step 3: Escrever globals.css template**

Copiar o `globals.css` REAL do Nexus e substituir apenas os valores de cor primária por comentários explicativos:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* Template: substituir as cores primárias (violet → cor da nova plataforma) */
/* As variáveis abaixo controlam TODA a identidade visual */

@theme inline {
  /* ... copiar TODAS as variáveis do Nexus real ... */
  /* Marcar com comentário as que precisam mudar:
     --color-primary: /* ← COR PRIMÁRIA (dark mode) */
     --color-ring: /* ← MESMA COR do primary */
     --color-sidebar-primary: /* ← MESMA COR do primary */
     --color-chart-1: /* ← COR do gráfico principal */
  */
}
```

**IMPORTANTE:** O arquivo deve ser COMPLETO e funcional — copiar todo o conteúdo do globals.css do Nexus, incluindo as regras `@layer base`, `.dark { }`, toast animations, etc. Apenas adicionar comentários nos valores que mudam.

- [ ] **Step 4: Commit**

```bash
git add blueprint/templates/app.config.ts blueprint/templates/globals.css
git commit -m "docs(blueprint): templates app.config.ts e globals.css"
```

---

## Task 9: Templates — docker-compose.yml + build.yml + Dockerfile

**Files:**
- Create: `blueprint/templates/docker-compose.yml`
- Create: `blueprint/templates/build.yml`
- Create: `blueprint/templates/Dockerfile`

- [ ] **Step 1: Ler arquivos de deploy do Nexus**

Ler na íntegra:
- `docker-compose.yml`
- `.github/workflows/build.yml`
- `docker/Dockerfile`

- [ ] **Step 2: Escrever docker-compose.yml template**

Copiar o compose REAL do Nexus e parametrizar com comentários:

```yaml
# Template: Docker Compose — substituir valores marcados com ←
# Remover service "worker" se pattern queue NÃO estiver incluso

version: "3.8"

services:
  app:
    image: {{REGISTRY}}/{{PROJECT_SLUG}}:latest  # ← registry + slug
    # ... copiar TODA a config real do Nexus ...
    deploy:
      labels:
        - "traefik.http.routers.{{PROJECT_SLUG}}.rule=Host(`{{DOMAIN}}`)"  # ← domínio
        # ... demais labels Traefik ...
    environment:
      DATABASE_URL: postgresql://{{DB_USER}}:${DB_PASSWORD}@db:5432/{{DB_NAME}}  # ← user e db
      # ... demais env vars ...

  worker:  # ← REMOVER se pattern queue não incluso
    image: {{REGISTRY}}/{{PROJECT_SLUG}}:latest
    # ... config do worker ...

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: {{DB_USER}}   # ← user do banco
      POSTGRES_DB: {{DB_NAME}}     # ← nome do banco
    # ...

  redis:
    image: redis:7-alpine
    # ... config idêntica ao Nexus ...

networks:
  traefik-public:
    external: true
  internal:
    driver: overlay

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 3: Escrever build.yml template**

Copiar o workflow REAL do Nexus e parametrizar:

```yaml
# Template: GitHub Actions — substituir valores marcados com ←
name: Build & Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    # ... copiar job test real ...

  build:
    needs: test
    # ... copiar job build real ...
    # Parametrizar:
    # - image name: {{REGISTRY}}/{{PROJECT_SLUG}}  # ←

  deploy:
    needs: build
    # ... copiar job deploy real ...
    # Parametrizar:
    # - service names: {{PROJECT_SLUG}}_app, {{PROJECT_SLUG}}_worker  # ←
    # - Remover update do worker se pattern queue não incluso
```

- [ ] **Step 4: Escrever Dockerfile template**

Copiar o Dockerfile REAL do Nexus. Adicionar comentário condicional:

```dockerfile
# Template: Dockerfile Multi-stage — praticamente idêntico ao Nexus
# Se pattern queue incluso: manter COPY worker/
# Se não: remover a linha COPY worker/

# ... copiar Dockerfile real completo ...
```

- [ ] **Step 5: Commit**

```bash
git add blueprint/templates/docker-compose.yml blueprint/templates/build.yml blueprint/templates/Dockerfile
git commit -m "docs(blueprint): templates Docker, CI/CD e Dockerfile"
```

---

## Task 10: Templates — env.example + claude-md.template

**Files:**
- Create: `blueprint/templates/env.example`
- Create: `blueprint/templates/claude-md.template`

- [ ] **Step 1: Escrever env.example**

```bash
# ============================================================
# Template: Variáveis de Ambiente
# Copiar para .env e preencher os valores
# Seções marcadas com [módulo] só são necessárias se o módulo estiver incluso
# ============================================================

# === Core (obrigatório) ===
DATABASE_URL=postgresql://user:password@db:5432/dbname
REDIS_URL=redis://redis:6379
NEXTAUTH_SECRET=                    # gerar: openssl rand -base64 32
NEXTAUTH_URL=https://app.exemplo.com

# === Email [core] ===
RESEND_API_KEY=re_xxxxx

# === Admin Seed [core] ===
ADMIN_EMAIL=admin@exemplo.com
ADMIN_PASSWORD=                     # senha inicial do super admin

# === Encryption [módulo: encryption] ===
ENCRYPTION_KEY=                     # 64 caracteres hex: openssl rand -hex 32

# === Deploy ===
DB_PASSWORD=                        # senha do PostgreSQL
GHCR_TOKEN=                         # GitHub Container Registry token
PORTAINER_URL=https://portainer.exemplo.com
PORTAINER_TOKEN=                    # Portainer API token
```

- [ ] **Step 2: Escrever claude-md.template**

```markdown
# {{APP_NAME}}

## Projeto
{{DESCRIPTION}}
Deploy via Docker Swarm Stack no Portainer (VPS).

**URL Produção:** https://{{DOMAIN}}
**Repositório:** https://github.com/{{GITHUB_USER}}/{{PROJECT_SLUG}}
**Blueprint de origem:** {{BLUEPRINT_PATH}}

## Idioma
Sempre responder em português brasileiro.

## Convenções
- Commits em português
- Código e variáveis em inglês
- Comentários em português quando necessário
- Server Actions em `src/lib/actions/`
- Todo texto visível ao usuário DEVE ter acentos e caracteres PT-BR corretos

## Stack Técnica
- Next.js 14+ (App Router, Server Components, Server Actions)
- TypeScript
- Prisma v7 — imports de `@/generated/prisma/client` (NÃO `@prisma/client`)
- PostgreSQL 16 + Redis 7
- NextAuth.js v5 (JWT stateless, trustHost: true)
- Tailwind CSS + shadcn/ui (base-ui) — usar `render` prop, NÃO `asChild`
- next-themes (ThemeProvider) — dark/light/system mode
- Framer Motion — `as const` em variants com `ease`
- Lucide React (ícones, NUNCA emojis)

## Identidade Visual
- **Cor primária:** {{PRIMARY_COLOR}}
- **Logo:** `public/logo.png`
- **Temas:** Dark (padrão), Light, Sistema
- **CSS variables:** Todas as cores via CSS custom properties em globals.css

## Deploy
- **Ambiente:** Produção direta (sem staging)
- **Pipeline:** Push main → GitHub Actions (test → build → deploy)
- **Infraestrutura:** Docker Swarm Stack via Portainer
- **Registry:** {{REGISTRY}}/{{PROJECT_SLUG}}

## Módulos Incluídos
{{MODULES_LIST}}

## Para adicionar módulos
Ler `{{BLUEPRINT_PATH}}/modules/{nome}.md` e seguir a seção "Integração".

## Regras
- Testes direto em produção
- Todo serviço sobe como container Docker
- Credenciais NUNCA no GitHub — apenas em `.env.production` (local)
- Ir pelo caminho mais simples e direto

## Estrutura de Actions
Todas as Server Actions ficam em `src/lib/actions/`:
{{ACTIONS_LIST}}
```

- [ ] **Step 3: Commit**

```bash
git add blueprint/templates/env.example blueprint/templates/claude-md.template
git commit -m "docs(blueprint): templates env.example e claude-md"
```

---

## Task 11: Atualizar CLAUDE.md do Nexus

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Ler CLAUDE.md atual**

Ler: `CLAUDE.md` na raiz do projeto.

- [ ] **Step 2: Adicionar seção Blueprint**

Adicionar ANTES da seção "## Regras" (ou no final se mais adequado):

```markdown
## Blueprint
Pasta `blueprint/` contém documentação modular para criar novas plataformas.
Ao concluir funcionalidade reutilizável, SEMPRE verificar:
- Novo módulo genérico? → Criar `blueprint/modules/{nome}.md`
- Módulo existente evoluiu? → Atualizar `blueprint/modules/{nome}.md`
- Novo padrão arquitetural? → Criar `blueprint/patterns/{nome}.md`
- Novo componente UI base? → Atualizar `blueprint/core/ui.md`
- Mudança no auth/users/profile? → Atualizar `blueprint/core/overview.md`
- Mudança no schema base? → Atualizar `blueprint/core/database.md`
- Mudança no deploy? → Atualizar `blueprint/core/deploy.md`
- Novo valor hardcoded? → Atualizar `blueprint/hardcoded-values.md`

Pergunta de checkpoint: "Essa feature é reutilizável? O blueprint precisa ser atualizado?"
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: adiciona regra de blueprint no CLAUDE.md"
```

---

## Task 12: Validação Final

**Files:** Nenhum novo — apenas validação.

- [ ] **Step 1: Verificar completude**

Executar e confirmar que TODOS os 16 arquivos existem:

```bash
ls -la blueprint/README.md
ls -la blueprint/architecture.md
ls -la blueprint/integration-map.md
ls -la blueprint/hardcoded-values.md
ls -la blueprint/core/overview.md
ls -la blueprint/core/database.md
ls -la blueprint/core/deploy.md
ls -la blueprint/core/ui.md
ls -la blueprint/templates/app.config.ts
ls -la blueprint/templates/globals.css
ls -la blueprint/templates/docker-compose.yml
ls -la blueprint/templates/build.yml
ls -la blueprint/templates/Dockerfile
ls -la blueprint/templates/env.example
ls -la blueprint/templates/claude-md.template
```

Todos devem existir e ter conteúdo (> 0 bytes).

- [ ] **Step 2: Verificar consistência**

Checar manualmente:
1. O catálogo no README lista os mesmos módulos que existem em `modules/` e `patterns/`
2. Os arquivos de referência listados em `core/overview.md` existem no Nexus
3. O schema em `core/database.md` é consistente com `prisma/schema.prisma`
4. As env vars em `templates/env.example` cobrem todas as listadas em `core/deploy.md`
5. O `claude-md.template` tem as mesmas seções que o `CLAUDE.md` real do Nexus
6. O CLAUDE.md do Nexus tem a seção Blueprint

- [ ] **Step 3: Verificar que o projeto ainda compila**

```bash
npx tsc --noEmit 2>&1 | grep -v ".next/types" | grep -v "__tests__"
npm run build 2>&1 | tail -5
```

Esperar: zero erros novos, build passa.

- [ ] **Step 4: Smoke test — simular leitura do blueprint**

Validar que o blueprint é usável: ler o README como se fosse o Claude Code iniciando uma nova plataforma.

Verificar que o fluxo faz sentido:
1. README aponta pra core/overview.md → arquivo existe e tem as 5 seções de subsistema
2. README aponta pra core/database.md → arquivo existe e tem schema Prisma completo (não abreviado)
3. README aponta pra core/deploy.md → arquivo existe e tem Dockerfile, compose, CI/CD
4. README aponta pra core/ui.md → arquivo existe e tem tokens, tema, layout
5. Templates em templates/ → todos completos e funcionais (não têm `...` ou seções vazias)
6. hardcoded-values.md lista valores concretos com arquivo + valor + substituto
7. integration-map.md tem tabelas de impacto para cada módulo

Se qualquer ponto falhar (seção vazia, conteúdo abreviado, referência quebrada), corrigir antes de seguir.

- [ ] **Step 5: Commit final (se houver ajustes)**

```bash
git add -A blueprint/
git commit -m "docs(blueprint): fase 1 completa — validação e ajustes finais"
```

---

## Resumo de Tasks

| Task | Descrição | Arquivos | Estimativa |
|------|-----------|----------|-----------|
| 1 | Estrutura + README.md + placeholders | blueprint/README.md, modules/README.md, patterns/README.md | Médio |
| 2 | architecture.md | blueprint/architecture.md | Médio |
| 3 | integration-map + hardcoded-values | blueprint/integration-map.md, hardcoded-values.md | Médio |
| 4 | core/overview.md (5 subsistemas) | blueprint/core/overview.md | Grande — ler 12 arquivos do Nexus |
| 5 | core/database.md (schema completo) | blueprint/core/database.md | Médio |
| 6 | core/deploy.md (Docker, CI/CD) | blueprint/core/deploy.md | Médio |
| 7 | core/ui.md (tokens, tema, layout) | blueprint/core/ui.md | Grande — ler 12+ arquivos de UI |
| 8 | Templates: app.config + globals.css | blueprint/templates/app.config.ts, globals.css | Médio |
| 9 | Templates: Docker + CI/CD | blueprint/templates/docker-compose.yml, build.yml, Dockerfile | Médio |
| 10 | Templates: env.example + claude-md | blueprint/templates/env.example, claude-md.template | Pequeno |
| 11 | Atualizar CLAUDE.md do Nexus | CLAUDE.md | Pequeno |
| 12 | Validação final + smoke test | — | Pequeno |

**Tasks parallelizáveis:** 2, 3, 5, 6 podem rodar em paralelo (sem dependências entre si). Tasks 4 e 7 são as maiores e devem ter review dedicado. Task 12 depende de todas as anteriores.
