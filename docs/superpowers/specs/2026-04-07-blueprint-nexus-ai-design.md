# Blueprint Nexus AI — Spec de Design

**Data:** 2026-04-07
**Status:** Aprovado
**Objetivo:** Criar um blueprint modular dentro do projeto Nexus Roteador Webhook que permite ao Claude Code construir novas plataformas reutilizando a base técnica existente.

---

## 1. Problema

O projeto Nexus Roteador Webhook tem uma base técnica rica — autenticação, multi-tenancy, perfil, email, UI components, deploy Docker — que é genérica e reutilizável. Hoje essa base está misturada com código específico de webhook, sem documentação estruturada que permita reaproveitamento.

O objetivo é criar uma documentação modular (blueprint) que o Claude Code leia e use para construir novas plataformas da Nexus AI ou externas, com identidade visual própria, selecionando apenas os módulos necessários.

## 2. Decisões de Design

### 2.1 Blueprint documental, não template de código

**Decisão:** O blueprint é composto por arquivos markdown + templates de config. Não é um repositório template com código.

**Razão:**
- O Nexus ainda está evoluindo — um template de código ficaria desatualizado rapidamente
- O Claude Code não precisa de código pronto — precisa de contexto rico para gerar código adaptado
- Os módulos apontam para o código real do Nexus como referência, eliminando duplicação
- Manutenção zero: quando o Nexus muda, a referência já aponta pro código atualizado

### 2.2 Core + Módulos + Patterns

**Decisão:** Três categorias de conteúdo com naturezas diferentes.

| Categoria | O que é | Como o Claude Code usa |
|-----------|---------|----------------------|
| **Core** | Base inseparável (auth, users, profile, password-reset, email) | Sempre incluído. Copia e adapta do Nexus |
| **Módulos** | Peças opcionais reutilizáveis direto (multi-tenant, notifications, etc.) | Adiciona conforme necessidade. Código ~90% igual entre plataformas |
| **Patterns** | Arquitetura adaptável (dashboard, queue, settings) | Segue o padrão, mas implementação muda por plataforma |

**Razão:** Nem todo código do Nexus é copy-paste. O dashboard do Nexus é de webhooks — não serve pra um CRM. Mas o padrão (stats cards + gráfico + filtros + tabela) é reutilizável. Separar módulos de patterns evita promessas falsas.

### 2.3 Fluxo guiado pelo Claude Code

**Decisão:** O `README.md` do blueprint contém instruções para o Claude Code conduzir a criação de uma nova plataforma — sugerir módulos, perguntar configurações, e montar tudo.

**Razão:** O usuário não sabe quais módulos precisa. O Claude Code lê o catálogo, entende o tipo de plataforma, e sugere a combinação ideal.

### 2.4 Blueprint vive dentro do Nexus

**Decisão:** A pasta `blueprint/` fica na raiz do projeto Nexus Roteador Webhook.

**Razão:**
- Sempre acessível ao Claude Code quando trabalhando no Nexus
- Atualizado junto com o projeto
- Sem overhead de manter repo separado

### 2.5 Configs centralizadas (já implementado)

**Decisão:** Role labels, hierarquia e menu items foram extraídos para `src/lib/constants/roles.ts` e `src/lib/constants/navigation.ts`.

**Razão:** Código hardcoded impedia a modularização. Agora qualquer plataforma pode customizar roles e navegação editando um único arquivo.

---

## 3. Estrutura do Blueprint

```
blueprint/
├── README.md                    # Roteiro guiado + catálogo + sugestões
├── architecture.md              # Stack, padrões, estrutura de pastas
├── integration-map.md           # Dependências reais entre módulos
│
├── core/                        # SEMPRE incluído, inseparável
│   ├── overview.md              # Auth + Users + Profile + Password Reset + Email
│   ├── database.md              # Schema Prisma base
│   ├── deploy.md                # Docker, CI/CD, env vars
│   └── ui.md                    # Tokens, tema, layout, sidebar, login pages
│
├── modules/                     # Peças opcionais — código reutilizável direto
│   ├── multi-tenant.md          # Empresas, memberships, tenant scoping
│   ├── notifications.md         # Feed, bell, contagem, real-time
│   ├── audit-log.md             # Rastreamento de ações
│   ├── realtime.md              # SSE, Redis Pub/Sub, useRealtime hook
│   ├── encryption.md            # AES-256-GCM, mascaramento
│   └── toast.md                 # Toast customizado Sonner
│
├── patterns/                    # Arquitetura adaptável por plataforma
│   ├── dashboard.md             # Stats cards, gráficos, filtros, tabela
│   ├── queue.md                 # BullMQ, worker, retry, DLQ
│   ├── settings.md              # Config globais da plataforma
│   └── webhook-routing.md       # Receber, normalizar, dedup, entregar
│
└── templates/                   # Arquivos base parametrizáveis
    ├── globals.css              # CSS variables com placeholders de cor/fonte
    ├── docker-compose.yml       # Compose base (app, db, redis)
    ├── env.example              # Todas env vars possíveis, documentadas
    └── claude-md.template       # CLAUDE.md base pro novo projeto
```

---

## 4. Detalhamento por Seção

### 4.1 README.md — Roteiro Guiado

O arquivo mais importante. Contém:

**Catálogo de módulos** com descrição, tags e dependências:

| Módulo | Descrição | Tipo | Depende de |
|--------|-----------|------|-----------|
| auth | Login, JWT, middleware, rate limiting | core | — |
| users | CRUD, roles, hierarquia de acesso | core | auth |
| profile | Avatar, nome, email, senha, tema | core | auth, email |
| password-reset | Fluxo esqueci senha com token | core | email |
| email | Envio via Resend, templates HTML | core | — |
| multi-tenant | Empresas, memberships, scoping | módulo | auth, users |
| notifications | Feed, bell, contagem | módulo | auth |
| audit-log | Rastreamento de ações | módulo | auth |
| realtime | SSE, Redis Pub/Sub | módulo | — |
| encryption | AES-256-GCM | módulo | — |
| toast | Toast customizado Sonner | módulo | — |
| dashboard | Stats, gráficos, filtros | pattern | — |
| queue | BullMQ, worker, retry, DLQ | pattern | realtime (opcional) |
| settings | Config globais | pattern | auth |
| webhook-routing | Receber, normalizar, entregar | pattern | queue, encryption |

**Sugestões por tipo de plataforma:**

- **SaaS multi-tenant** — core + multi-tenant + dashboard + notifications + audit-log
- **Painel admin interno** — core + dashboard + audit-log + settings
- **API/Integração** — core + webhook-routing + queue + encryption
- **Ferramenta simples** — core apenas

**Fluxo guiado (instruções pro Claude Code):**

```
Ao criar uma nova plataforma a partir deste blueprint:

1. PERGUNTAR ao usuário:
   - Nome da plataforma
   - Descrição curta (o que faz)
   - É produto Nexus AI interno ou externo?
   - Domínio (ex: app.empresa.com)
   - Cor primária (hex) e cor secundária
   - Fonte heading e fonte body (ou usar padrão Fira Code/Fira Sans)
   - Logo (caminho, se já tiver)
   - Registry Docker (ghcr.io/xxx ou outro)

2. SUGERIR módulos:
   - Listar TODOS os módulos disponíveis com descrição
   - Classificar em: Essenciais (core), Recomendados, Opcionais
   - Basear a recomendação na descrição do projeto
   - Perguntar se quer adicionar ou remover

3. CRIAR o projeto:
   - Novo diretório/repositório
   - package.json com dependências dos módulos selecionados (versões latest)
   - Schema Prisma combinando modelos do core + módulos
   - globals.css com tokens de design (cores, fontes informadas)
   - docker-compose.yml adaptado (nome do serviço, imagem, domínio)
   - .env.example com todas variáveis necessárias
   - GitHub Actions CI/CD
   - CLAUDE.md do novo projeto (usando template)
   - Código de cada módulo selecionado (referenciando o Nexus)
   - Páginas de auth (login, forgot-password, reset-password, verify-email)
   - Layout protegido com sidebar configurada

4. VALIDAR:
   - TypeScript compila sem erros
   - Build Next.js passa
   - Docker compose válido

5. REGISTRAR no CLAUDE.md do novo projeto:
   - "Criado a partir do Nexus Blueprint em [caminho]"
   - Módulos incluídos
   - Como adicionar novos módulos no futuro
```

### 4.2 architecture.md — Arquitetura Base

Descreve a stack técnica e padrões que toda plataforma segue:

- **Stack:** Next.js 14+ (App Router), TypeScript, Prisma v7, PostgreSQL, Redis, NextAuth v5, Tailwind + shadcn/ui, Framer Motion
- **Estrutura de pastas:** `src/app/`, `src/components/`, `src/lib/actions/`, `src/lib/constants/`, `src/hooks/`, `src/types/`
- **Padrão Server Actions:** Todas mutations em `src/lib/actions/`, validação Zod, resposta `{ success, data?, error? }`
- **Padrão de componentes:** Server Components pra layouts, Client Components pra interatividade
- **Padrão de autenticação:** JWT stateless, middleware de proteção, `getCurrentUser()` em toda action
- **Padrão de configuração:** Constants centralizados em `src/lib/constants/` (roles, navigation, etc.)

Referencia os arquivos reais do Nexus como exemplo de cada padrão.

### 4.3 integration-map.md — Mapa de Integração

Documento que mostra como os módulos se conectam na prática:

```
Core (auth + users + profile + password-reset + email)
 │
 ├── multi-tenant
 │   ├── Adiciona: Company, UserCompanyMembership ao Prisma
 │   ├── Modifica: getCurrentUser() inclui companyIds acessíveis
 │   ├── Modifica: Todas actions recebem tenant scoping
 │   └── Modifica: Sidebar mostra seletor de empresa (se multi)
 │
 ├── notifications
 │   ├── Adiciona: Notification model ao Prisma
 │   ├── Adiciona: notification-bell.tsx na sidebar
 │   ├── Opcional: Se realtime presente, notificações push via SSE
 │   └── Independente de multi-tenant (funciona com ou sem)
 │
 ├── audit-log
 │   ├── Adiciona: AuditLog model ao Prisma
 │   ├── Adiciona: logAudit() fire-and-forget em actions
 │   └── Independente de tudo (apenas registra)
 │
 ├── realtime
 │   ├── Adiciona: Redis Pub/Sub + SSE endpoint
 │   ├── Adiciona: useRealtime() hook
 │   └── Usado por: notifications (opcional), dashboard (opcional)
 │
 ├── encryption
 │   ├── Adiciona: encrypt()/decrypt()/mask() utilities
 │   └── Usado por: qualquer módulo que guarde dados sensíveis
 │
 └── toast
     ├── Adiciona: sonner.tsx customizado
     └── Independente de tudo (UI pura)
```

### 4.4 core/ — Documentação do Core

**core/overview.md** — Descreve os 5 subsistemas inseparáveis:

1. **Auth:** NextAuth config, Credentials provider, JWT callbacks, middleware, rate limiting
2. **Users:** CRUD com hierarquia de roles (super_admin > admin > manager > viewer), ativação/desativação
3. **Profile:** Avatar upload, nome, email change com verificação, troca de senha, tema
4. **Password Reset:** Solicitação rate-limited, token com expiração, email com link, redefinição
5. **Email:** Resend SDK, templates HTML dark-themed, funções de envio

Cada subsistema lista:
- Arquivos de referência no Nexus (caminhos reais)
- Pacotes npm necessários
- Variáveis de ambiente
- O que customizar por plataforma

**core/database.md** — Schema Prisma base:

```prisma
// Modelos base (sempre presentes)
model User { ... }
enum PlatformRole { super_admin, admin, manager, viewer }
enum Theme { dark, light, system }
model PasswordResetToken { ... }
model EmailChangeToken { ... }

// Adicionados por multi-tenant (se incluído)
model Company { ... }
model UserCompanyMembership { ... }
enum CompanyRole { ... }

// Adicionados por notifications (se incluído)
model Notification { ... }
enum NotificationType { ... }

// Adicionados por audit-log (se incluído)
model AuditLog { ... }
enum ActorType { ... }
```

Referencia o schema real do Nexus (`prisma/schema.prisma`) indicando quais modelos são base vs específicos de webhook.

**core/deploy.md** — Infraestrutura:

- Dockerfile multi-stage (Node 20 Alpine, standalone)
- docker-compose.yml base (app + db + redis)
- GitHub Actions (build → push GHCR → deploy Portainer)
- Variáveis de ambiente obrigatórias vs opcionais
- Rede Docker e volumes

**core/ui.md** — Sistema visual:

- Design tokens parametrizáveis (cor primária, secundária, fonte heading, fonte body)
- Tema dark/light/system via next-themes
- Layout: sidebar + main content
- Páginas de auth: login, forgot-password, reset-password, verify-email
- Componentes base: button, input, card, dialog, table, select, badge, etc.
- Padrão de animações (Framer Motion variants)

### 4.5 modules/ — Módulos Opcionais

Cada módulo segue o formato:

```markdown
# Módulo: [nome]

## Resumo
[1-2 frases do que faz]

## Dependências
- Obrigatórias: [lista]
- Opcionais: [lista com benefício]

## Pacotes npm
[lista sem versões]

## Schema Prisma (adições)
[modelos e enums que este módulo adiciona]

## Server Actions
[funções com assinatura e comportamento]

## Componentes UI
[componentes que este módulo inclui]

## Variáveis de ambiente
[env vars que este módulo precisa]

## Integração com outros módulos
[como se conecta: o que modifica em outros módulos]

## Referência no Nexus
[caminhos dos arquivos reais para o Claude Code ler]

## Customizações por plataforma
[o que muda de uma plataforma pra outra]
```

### 4.6 patterns/ — Padrões Arquiteturais

Cada pattern segue o formato:

```markdown
# Pattern: [nome]

## Resumo
[o que este padrão resolve]

## Arquitetura
[diagrama/descrição de como funciona]

## Implementação no Nexus (exemplo)
[como foi implementado no Nexus — referência, não copy-paste]

## Como adaptar pra outra plataforma
[o que muda: modelos, queries, UI]

## Componentes típicos
[stats cards, gráficos, filtros, tabelas, etc.]

## Referência no Nexus
[caminhos dos arquivos reais]
```

### 4.7 templates/ — Arquivos Base

**globals.css** — CSS variables com placeholders:
```css
:root {
  --color-primary: {{PRIMARY_COLOR}};
  --color-primary-foreground: {{PRIMARY_FOREGROUND}};
  /* ... restante dos tokens */
}
```

**docker-compose.yml** — Compose base com placeholders:
```yaml
services:
  app:
    image: {{REGISTRY}}/{{PROJECT_NAME}}:latest
    # ...
```

**env.example** — Documentação de todas as variáveis:
```bash
# === Core (obrigatório) ===
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://{{DOMAIN}}

# === Email (obrigatório se core) ===
RESEND_API_KEY=
EMAIL_FROM="{{APP_NAME}} <noreply@{{DOMAIN}}>"

# === Redis (obrigatório se realtime/queue/rate-limit) ===
REDIS_URL=redis://redis:6379

# === Deploy ===
GHCR_TOKEN=
PORTAINER_URL=
PORTAINER_API_KEY=
```

**claude-md.template** — CLAUDE.md base pro novo projeto com seções parametrizáveis.

---

## 5. Regra de Atualização (Blueprint Vivo)

Adição ao CLAUDE.md do projeto Nexus:

```
## Blueprint
Ao concluir uma funcionalidade reutilizável, verificar:
- Novo módulo genérico? → Criar arquivo em blueprint/modules/
- Módulo existente evoluiu? → Atualizar o arquivo do módulo
- Novo padrão arquitetural? → Criar arquivo em blueprint/patterns/
- Novo componente UI base? → Atualizar blueprint/core/ui.md
- Mudança no deploy? → Atualizar blueprint/core/deploy.md
- Novo template? → Atualizar blueprint/templates/

Perguntar ao finalizar cada fase: "Alguma parte dessa implementação deve atualizar o blueprint?"
```

---

## 6. Fases de Implementação

### Fase 1 — Fundação (construir agora)
- `README.md` — roteiro guiado completo
- `architecture.md` — stack e padrões
- `integration-map.md` — mapa de dependências
- `core/` — overview, database, deploy, ui
- `templates/` — globals.css, docker-compose, env.example, claude-md.template

### Fase 2 — Módulos mais usados
- `modules/multi-tenant.md`
- `modules/notifications.md`
- `modules/audit-log.md`
- `modules/toast.md`

### Fase 3 — Módulos e patterns restantes
- `modules/realtime.md`
- `modules/encryption.md`
- `patterns/dashboard.md`
- `patterns/queue.md`
- `patterns/settings.md`
- `patterns/webhook-routing.md`

---

## 7. Pré-requisitos Concluídos

Os seguintes refactors já foram aplicados ao código do Nexus para viabilizar o blueprint:

- [x] Role labels centralizados em `src/lib/constants/roles.ts`
- [x] Menu items centralizados em `src/lib/constants/navigation.ts`
- [x] `layout.tsx` usa constants centralizados
- [x] `users.ts` usa constants centralizados
- [x] `sidebar.tsx` usa `getNavItems()` do constants
- [x] `members-tab.tsx` usa styles e options do constants
- [x] Build de produção passa sem erros

---

## 8. Critérios de Sucesso

1. O Claude Code consegue ler o blueprint e criar uma plataforma funcional com módulos selecionados
2. A plataforma criada compila, builda, e sobe em Docker sem erros
3. O processo é guiado — Claude Code sugere módulos e pergunta configurações
4. Cada plataforma pode ter identidade visual independente
5. O blueprint cresce junto com o Nexus sem esforço extra significativo
