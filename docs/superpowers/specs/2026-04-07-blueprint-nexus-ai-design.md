# Blueprint Nexus AI — Spec de Design v2

**Data:** 2026-04-07  
**Versão:** 2.0  
**Status:** Em revisão  
**Objetivo:** Criar um blueprint modular e vivo dentro do projeto Nexus que permite ao Claude Code construir novas plataformas completas — da identidade visual ao deploy — reutilizando toda a base técnica já construída.

---

## 1. Problema e Contexto

O Nexus Roteador Webhook acumulou uma base técnica madura:

- Autenticação completa (login, JWT, rate limiting, recuperação de senha)
- Multi-tenancy com controle de acesso hierárquico
- Perfil com avatar, tema, troca de email/senha
- Email transacional com templates
- Dashboard com gráficos e métricas
- Real-time via SSE
- Criptografia, auditoria, notificações
- Deploy Docker com CI/CD automatizado
- UI premium com dark/light mode

Essa base serve pra **qualquer plataforma web** — CRM, painel admin, SaaS — mas hoje está misturada com código específico de webhook. Não existe documentação que permita ao Claude Code extrair e reutilizar esses módulos.

**O blueprint resolve isso:** uma pasta de documentação modular + templates que o Claude Code lê para construir uma nova plataforma do zero, perguntando ao usuário apenas nome, cores, domínio e quais módulos incluir.

---

## 2. Conceitos Fundamentais

### 2.1 O Blueprint NÃO é um template de código

É documentação rica que **aponta para o código real do Nexus** como referência. Quando o Claude Code precisa implementar auth numa nova plataforma, ele:

1. Lê `blueprint/core/overview.md` pra entender O QUE implementar
2. Lê os arquivos reais do Nexus listados no doc pra ver COMO está implementado
3. Gera código novo e adaptado pra nova plataforma

**Vantagem:** zero duplicação. Quando o Nexus evolui, a referência já aponta pro código atualizado.

### 2.2 Três categorias de conteúdo

| Categoria | Definição | Na prática |
|-----------|-----------|-----------|
| **Core** | Subsistemas inseparáveis que toda plataforma precisa | Auth, Users, Profile, Password Reset, Email — sempre incluídos juntos |
| **Módulos** | Peças independentes com código ~90% idêntico entre plataformas | Multi-tenant, Notifications, Audit, Realtime, Encryption, Toast |
| **Patterns** | Arquitetura reutilizável cuja implementação muda por plataforma | Dashboard, Queue, Settings — o padrão é igual, os dados mudam |

### 2.3 App Config — identidade centralizada

Toda plataforma criada a partir do blueprint tem um arquivo `src/lib/app.config.ts` que centraliza TODA a identidade:

```typescript
export const APP_CONFIG = {
  // Identidade
  name: "Nexus CRM",
  shortName: "CRM",
  description: "Gestão de clientes e vendas",
  domain: "crm.nexusai360.com",
  
  // Visual
  logo: "/logo.png",
  brandDark: "/marca-dark.png",
  brandLight: "/marca-light.png",
  
  // Email
  emailFrom: "Nexus CRM <noreply@nexusai360.com>",
  emailDomain: "nexusai360.com",
  
  // Deploy
  registry: "ghcr.io/jvzanini",
  projectSlug: "nexus-crm",
  portainerStackId: null, // preenchido após primeiro deploy
  network: "rede_nexusAI",
  
  // Feature flags (módulos incluídos)
  features: {
    multiTenant: true,
    notifications: true,
    auditLog: true,
    realtime: false,
    encryption: true,
  },
} as const;
```

Todos os arquivos da plataforma (email templates, docker-compose, sidebar, login page, CI/CD) referenciam `APP_CONFIG` em vez de valores hardcoded. Isso garante que trocar a identidade é mudar UM arquivo.

---

## 3. Valores Hardcoded no Nexus (inventário completo)

Mapeamento de **tudo** que muda entre plataformas, baseado na análise real do código:

### 3.1 Identidade e Marca

| Arquivo Nexus | Valor hardcoded | Onde no APP_CONFIG |
|---------------|-----------------|-------------------|
| `src/components/login/login-content.tsx` | "Nexus AI", "Roteador de Webhooks" | `name`, `shortName` |
| `src/components/login/login-content.tsx` | `/logo-nexus-ai.png` | `logo` |
| `src/components/layout/sidebar.tsx` | "Nexus AI", "Roteador Webhook" | `name`, `description` |
| `src/components/layout/sidebar.tsx` | `/logo-nexus-ai.png` | `logo` |
| `src/app/(auth)/login/page.tsx` | "Login \| Nexus Roteador Webhook" | `name` (metadata) |
| `src/lib/email.ts` | `Nexus <noreply@nexusai360.com>` | `emailFrom` |
| `src/lib/email.ts` | "NexusAI360" no footer HTML | `name` |
| `src/lib/email.ts` | "Nexus Roteador Webhook" no subject | `name` |

### 3.2 Cores e Tema

| Arquivo Nexus | Valor hardcoded | O que muda |
|---------------|-----------------|-----------|
| `src/app/globals.css` | `#6d28d9` / `#7c3aed` (violet primary) | Cor primária da plataforma |
| `src/app/globals.css` | Chart colors (violet, purple, green, orange) | Paleta de gráficos |
| `src/components/login/login-content.tsx` | `violet-600`, `purple-600` (gradientes) | Cor do botão de login |
| `src/components/layout/sidebar.tsx` | `violet-500` (item ativo) | Cor de destaque da sidebar |

### 3.3 Infraestrutura

| Arquivo | Valor hardcoded | O que muda |
|---------|-----------------|-----------|
| `docker-compose.yml` | `ghcr.io/jvzanini/nexus-roteador-webhook` | Registry + nome da imagem |
| `docker-compose.yml` | `roteadorwebhook.nexusai360.com` | Domínio Traefik |
| `docker-compose.yml` | `nexus` (user/db PostgreSQL) | Nome do banco |
| `.github/workflows/build.yml` | `nexus-roteador-webhook_app`, `_worker` | Nomes dos services no Portainer |
| `.github/workflows/build.yml` | `/api/endpoints/1/` | Endpoint Portainer |

### 3.4 Rotas Públicas (auth)

| Arquivo | Valor hardcoded | O que muda |
|---------|-----------------|-----------|
| `src/auth.config.ts` | Lista de rotas públicas: `/login`, `/forgot-password`, `/reset-password`, `/verify-email`, `/api/webhook/*` | Rotas específicas da plataforma |
| `src/middleware.ts` | Matcher regex com exclusões | Adaptar ao que a nova plataforma expõe |

### 3.5 Textos em Português

| Local | Exemplos |
|-------|---------|
| `src/lib/tenant.ts` | "Acesso negado: você não tem permissão..." |
| `src/lib/email.ts` | "Redefinição de senha", "Olá {name}", todo o corpo do email |
| `src/lib/constants/roles.ts` | "Super Admin", "Admin", "Gerente", "Visualizador" |
| `src/lib/constants/navigation.ts` | "Dashboard", "Empresas", "Usuários", "Configurações" |
| Todos os server actions | Mensagens de erro e sucesso |

---

## 4. Estrutura do Blueprint

```
blueprint/
├── README.md                       # Roteiro guiado completo (o cérebro)
├── architecture.md                 # Stack, estrutura, padrões de código
├── integration-map.md              # Dependências a nível de arquivo
├── hardcoded-values.md             # Inventário completo (seção 3 desta spec)
│
├── core/                           # SEMPRE incluído
│   ├── overview.md                 # Auth + Users + Profile + Reset + Email
│   ├── database.md                 # Schema Prisma base completo
│   ├── deploy.md                   # Docker, CI/CD, Portainer
│   └── ui.md                       # Tokens, tema, layout, sidebar, auth pages, componentes
│
├── modules/                        # Peças opcionais — código reutilizável
│   ├── multi-tenant.md
│   ├── notifications.md
│   ├── audit-log.md
│   ├── realtime.md
│   ├── encryption.md
│   └── toast.md
│
├── patterns/                       # Arquitetura adaptável
│   ├── dashboard.md
│   ├── queue.md
│   ├── settings.md
│   └── webhook-routing.md
│
└── templates/                      # Arquivos reais parametrizáveis
    ├── app.config.ts               # Identidade centralizada
    ├── globals.css                 # CSS variables completo (baseado no real)
    ├── docker-compose.yml          # Compose completo com variáveis
    ├── build.yml                   # GitHub Actions CI/CD
    ├── Dockerfile                  # Multi-stage build
    ├── env.example                 # Todas variáveis documentadas
    └── claude-md.template          # CLAUDE.md da nova plataforma
```

---

## 5. README.md — O Roteiro Guiado (detalhamento)

O README é o arquivo que o Claude Code lê primeiro. Ele conduz TODO o processo.

### 5.1 Fluxo de criação de nova plataforma

```
PASSO 1: COLETA DE IDENTIDADE
──────────────────────────────
Perguntar ao usuário:

1. "Qual o nome da plataforma?"
   Exemplo: "Nexus CRM"

2. "O que ela faz? (uma frase)"
   Exemplo: "Gestão de clientes e pipeline de vendas"

3. "É produto interno da Nexus AI ou plataforma externa?"
   → Se interno: domínio será [slug].nexusai360.com
   → Se externo: perguntar domínio completo

4. "Qual a cor primária? (hex)"
   → Se não souber: sugerir baseado no tipo de plataforma
   → Default: #7c3aed (violet, herança Nexus AI)

5. "Já tem logo? (caminho do arquivo)"
   → Se não: usar placeholder, trocar depois

6. "Registry Docker?"
   → Default: ghcr.io/jvzanini
   → Perguntar se quer outro


PASSO 2: SELEÇÃO DE MÓDULOS
────────────────────────────
Apresentar catálogo completo:

CORE (sempre incluído, não opcional):
  ✓ Auth — Login, JWT stateless, rate limiting, middleware
  ✓ Users — CRUD, hierarquia de acesso (4 níveis)
  ✓ Profile — Avatar, nome, email com verificação, senha, tema
  ✓ Password Reset — Esqueci senha com token + email
  ✓ Email — Resend SDK, templates HTML responsivos

MÓDULOS (listar todos, recomendar baseado no tipo):
  □ Multi-tenant — Empresas, workspaces, scoping de dados
  □ Notifications — Feed, badge no header, contagem
  □ Audit Log — Registro de ações (quem fez o quê, quando)
  □ Real-time — Atualizações instantâneas via SSE + Redis
  □ Encryption — Criptografia AES-256-GCM para dados sensíveis
  □ Toast — Sistema de notificação visual customizado

PATTERNS (sugerir baseado no tipo, implementação customizada):
  □ Dashboard — Painel com stats, gráficos, filtros
  □ Queue — Processamento assíncrono com BullMQ
  □ Settings — Configurações globais da plataforma
  □ Webhook Routing — Receber, normalizar e entregar webhooks

Sugestões automáticas por tipo:
  SaaS multi-tenant → multi-tenant + notifications + audit-log + dashboard
  Painel admin      → dashboard + audit-log + settings
  API/Integração    → queue + encryption + webhook-routing
  Ferramenta simple → só core


PASSO 3: CRIAÇÃO DO PROJETO
────────────────────────────
Ordem de execução:

3.1. Criar diretório do projeto
3.2. Inicializar com: npm init, git init
3.3. Gerar app.config.ts a partir do template (com dados do passo 1)
3.4. Gerar package.json com dependências:
     - Core: next, react, next-auth@5, prisma, @prisma/client,
       bcryptjs, zod, resend, tailwindcss, framer-motion,
       lucide-react, sonner, next-themes, ioredis
     - Por módulo: bullmq (queue), recharts (dashboard)
     - Usar versões latest no momento da criação
3.5. Gerar prisma/schema.prisma combinando:
     - Modelos do core (User, PasswordResetToken, EmailChangeToken)
     - Modelos dos módulos selecionados
     - Ler blueprint/core/database.md para o schema exato
3.6. Gerar globals.css a partir do template (substituir cores)
3.7. Gerar docker-compose.yml a partir do template
3.8. Gerar .github/workflows/build.yml a partir do template
3.9. Gerar docker/Dockerfile a partir do template
3.10. Gerar .env.example a partir do template
3.11. Implementar o core:
      - Ler blueprint/core/overview.md
      - Para cada subsistema, ler os arquivos do Nexus listados
      - Gerar código adaptado (trocar nomes, cores, textos)
3.12. Implementar módulos selecionados:
      - Para cada módulo, ler blueprint/modules/{nome}.md
      - Seguir a seção "Integração" pra conectar com core
3.13. Implementar patterns selecionados:
      - Para cada pattern, ler blueprint/patterns/{nome}.md
      - Adaptar modelos e queries ao domínio da nova plataforma
3.14. Gerar CLAUDE.md do novo projeto (template + módulos incluídos)


PASSO 4: VALIDAÇÃO
───────────────────
4.1. npx tsc --noEmit (zero erros)
4.2. npm run build (build passa)
4.3. docker compose config (compose válido)
4.4. Verificar que APP_CONFIG é a única fonte de identidade


PASSO 5: REGISTRO
──────────────────
No CLAUDE.md do novo projeto, incluir:
- "Criado a partir do Nexus Blueprint em [caminho absoluto]"
- Lista de módulos incluídos
- Instruções: "Para adicionar um módulo, ler blueprint/modules/{nome}.md"
```

### 5.2 Fluxo de adicionar módulo a plataforma existente

```
Quando o usuário pedir para adicionar um módulo a uma plataforma
que já foi criada a partir do blueprint:

1. Ler o CLAUDE.md da plataforma pra saber quais módulos já tem
2. Ler blueprint/modules/{novo-modulo}.md
3. Ler blueprint/integration-map.md pra entender impacto
4. Seguir a seção "Integração" do módulo:
   - Adicionar modelos ao schema Prisma
   - Criar migration
   - Implementar server actions
   - Adicionar componentes UI
   - Atualizar sidebar/navigation se necessário
5. Atualizar CLAUDE.md com o novo módulo
```

---

## 6. architecture.md (detalhamento)

### 6.1 Stack Técnica

| Camada | Tecnologia | Versão | Propósito |
|--------|-----------|--------|-----------|
| Framework | Next.js | 14+ | App Router, Server Components, Server Actions |
| Linguagem | TypeScript | 5+ | Tipagem estática |
| ORM | Prisma | v7 | Acesso ao banco, migrations |
| Banco | PostgreSQL | 16 | Dados relacionais |
| Cache/Queue | Redis | 7 | Rate limiting, pub/sub, filas |
| Auth | NextAuth.js | v5 | JWT stateless, Credentials provider |
| CSS | Tailwind CSS | 4+ | Utility-first + CSS variables |
| Componentes | shadcn/ui | latest | Base components (usar `render` prop) |
| Animações | Framer Motion | latest | Transições e micro-interações |
| Gráficos | Recharts | latest | Charts (se dashboard incluso) |
| Ícones | Lucide React | latest | Icon library (nunca emojis) |
| Tema | next-themes | latest | Dark/light/system toggle |
| Email | Resend | latest | Email transacional |

### 6.2 Estrutura de Pastas

```
src/
├── app/
│   ├── (auth)/                   # Páginas públicas (login, reset, etc.)
│   │   ├── layout.tsx
│   │   ├── login/
│   │   ├── forgot-password/
│   │   ├── reset-password/
│   │   └── verify-email/
│   ├── (protected)/              # Páginas autenticadas
│   │   ├── layout.tsx            # Sidebar + ThemeInitializer
│   │   ├── dashboard/
│   │   ├── profile/
│   │   └── [domínio]/            # Páginas específicas da plataforma
│   ├── api/
│   │   ├── auth/[...nextauth]/
│   │   ├── health/
│   │   └── events/               # SSE (se realtime incluso)
│   └── globals.css
├── components/
│   ├── layout/                   # Sidebar, notification-bell
│   ├── login/                    # Login form, login content
│   ├── providers/                # ThemeProvider, ThemeInitializer
│   └── ui/                       # Componentes base shadcn
├── hooks/                        # React hooks (useRealtime, etc.)
├── lib/
│   ├── actions/                  # Server Actions (uma por domínio)
│   ├── constants/                # Roles, navigation, domínio-specific
│   ├── schemas/                  # Validação Zod
│   ├── app.config.ts             # Identidade centralizada
│   ├── auth.ts                   # getCurrentUser()
│   ├── prisma.ts                 # Singleton Prisma
│   ├── email.ts                  # Templates e envio
│   ├── tenant.ts                 # Multi-tenant scoping (se incluso)
│   ├── audit.ts                  # Audit logging (se incluso)
│   ├── encryption.ts             # AES-256-GCM (se incluso)
│   ├── realtime.ts               # Redis pub/sub (se incluso)
│   ├── rate-limit.ts             # Rate limiting Redis
│   └── redis.ts                  # Redis client singleton
├── types/                        # TypeScript type definitions
└── generated/                    # Prisma client gerado
```

### 6.3 Padrões de Código

**Server Actions:**
```typescript
// Toda action segue este padrão:
"use server";

import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({ ... });

export async function minhaAction(input: z.infer<typeof schema>) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Não autenticado" };
  
  // Validação
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  
  // Lógica
  try {
    const result = await prisma.model.create({ ... });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: "Erro ao processar" };
  }
}
```

**Componentes:**
- Server Components para pages e layouts (auth checks no servidor)
- Client Components (`'use client'`) para interatividade
- Props tipadas com interfaces
- Animações com Framer Motion `variants` usando `as const`

**JWT Refresh em tempo real:**
- O callback `jwt()` no auth.config.ts faz query no banco a cada request autenticado
- Garante que mudanças de role, desativação de conta, etc. refletem imediatamente
- Se user inativo, retorna null → sessão invalidada

---

## 7. integration-map.md (detalhamento a nível de arquivo)

### 7.1 Core — Fluxo de Autenticação

```
Request do browser
  → src/middleware.ts (filtro de rotas)
    → src/auth.ts (NextAuth handler)
      → src/auth.config.ts (JWT callbacks)
        → src/lib/auth-helpers.ts (validação de credenciais)
          → src/lib/rate-limit.ts (Redis rate limiting)
          → src/lib/audit.ts (log de login, se audit-log incluso)
        → src/lib/prisma.ts (query User para refresh JWT)
    → Rota protegida ou redirect para /login
```

### 7.2 Módulos — Impacto nos Arquivos

**Quando adicionar MULTI-TENANT:**

| Ação | Arquivo | Mudança |
|------|---------|---------|
| Criar modelo | `prisma/schema.prisma` | Adicionar `Company`, `UserCompanyMembership`, `CompanyRole` enum |
| Criar lib | `src/lib/tenant.ts` | `getAccessibleCompanyIds()`, `buildTenantFilter()`, `assertCompanyAccess()`, `getUserCompanyRole()` |
| Criar action | `src/lib/actions/company.ts` | CRUD de empresas |
| Criar página | `src/app/(protected)/companies/` | Listagem, detalhe, tabs |
| Adicionar nav | `src/lib/constants/navigation.ts` | Adicionar item "Empresas" com ícone Building2 |
| Modificar actions | Todas server actions de dados | Adicionar tenant scoping via `buildTenantFilter()` |
| Modificar JWT | `src/auth.config.ts` | Incluir companyIds acessíveis no token (opcional) |

**Quando adicionar NOTIFICATIONS:**

| Ação | Arquivo | Mudança |
|------|---------|---------|
| Criar modelo | `prisma/schema.prisma` | Adicionar `Notification`, `NotificationType` enum |
| Criar action | `src/lib/actions/notifications.ts` | `getNotifications()`, `markAsRead()`, `getUnreadCount()` |
| Criar lib | `src/lib/notifications.ts` | `createNotification()` helper |
| Criar componente | `src/components/layout/notification-bell.tsx` | Badge com contagem no header |
| Modificar layout | `src/app/(protected)/layout.tsx` | Incluir NotificationBell na sidebar |
| Se realtime | `src/lib/realtime.ts` | Adicionar evento `notification:new` |

**Quando adicionar AUDIT-LOG:**

| Ação | Arquivo | Mudança |
|------|---------|---------|
| Criar modelo | `prisma/schema.prisma` | Adicionar `AuditLog`, `ActorType` enum |
| Criar lib | `src/lib/audit.ts` | `logAudit()` fire-and-forget |
| Modificar actions | Actions de mutação | Adicionar `logAudit()` após operações críticas |

**Quando adicionar REALTIME:**

| Ação | Arquivo | Mudança |
|------|---------|---------|
| Criar lib | `src/lib/realtime.ts` | `publishRealtimeEvent()` |
| Criar API route | `src/app/api/events/route.ts` | SSE endpoint |
| Criar hook | `src/hooks/use-realtime.ts` | `useRealtime()` React hook |
| Dependência | Redis | Usa pub/sub (mesmo Redis do rate limiting) |

**Quando adicionar ENCRYPTION:**

| Ação | Arquivo | Mudança |
|------|---------|---------|
| Criar lib | `src/lib/encryption.ts` | `encrypt()`, `decrypt()`, `mask()` |
| Env var | `.env` | Adicionar `ENCRYPTION_KEY` (64 hex chars) |
| Uso | Actions que salvam dados sensíveis | Chamar `encrypt()` antes de salvar, `decrypt()` ao ler |

**Quando adicionar TOAST:**

| Ação | Arquivo | Mudança |
|------|---------|---------|
| Criar componente | `src/components/ui/sonner.tsx` | Toast customizado com MutationObserver |
| Modificar layout | `src/app/(protected)/layout.tsx` | Adicionar `<Toaster />` |
| Uso | Qualquer componente client | `toast.success()`, `toast.error()` |

---

## 8. Detalhamento dos Documentos Core

### 8.1 core/overview.md

Cada subsistema documenta:

1. **O que faz** (resumo funcional)
2. **Arquivos no Nexus** (lista com caminho absoluto relativo à raiz)
3. **Pacotes npm** (nomes, sem versão)
4. **Variáveis de ambiente** (nome + descrição + exemplo)
5. **Schema Prisma** (modelos completos copiados do Nexus, não abreviados)
6. **Assinaturas de Server Actions** (nome + params + retorno)
7. **O que customizar** (lista do que muda por plataforma)
8. **Segurança** (medidas implementadas, riscos conhecidos)

Exemplo para **Auth:**

```
## Auth

### O que faz
Login com email/senha, JWT stateless com refresh a cada request,
middleware de proteção de rotas, rate limiting de login.

### Arquivos no Nexus
- src/auth.ts — Config NextAuth com Credentials provider
- src/auth.config.ts — Callbacks JWT/session, rotas públicas, session maxAge
- src/middleware.ts — Matcher de rotas protegidas
- src/lib/auth.ts — getCurrentUser() extrai dados da sessão
- src/lib/auth-helpers.ts — authorizeCredentials() valida email+senha
- src/lib/rate-limit.ts — Rate limiting Redis (5 tentativas/min, lockout 15min)

### Pacotes npm
next-auth@5 (beta), bcryptjs, ioredis, zod

### Variáveis de ambiente
- NEXTAUTH_SECRET — Segredo para assinar JWT (gerar com openssl rand -base64 32)
- NEXTAUTH_URL — URL pública da aplicação (ex: https://app.empresa.com)
- REDIS_URL — Para rate limiting (ex: redis://redis:6379)

### Schema Prisma
(incluir o model User COMPLETO do Nexus, com todos os campos)

### Server Actions
- loginAction(formData) → redirect ou erro
- getCurrentUser() → { id, name, email, isSuperAdmin, platformRole, avatarUrl, theme } | null

### O que customizar por plataforma
- Rotas públicas em auth.config.ts (lista de paths que não requerem login)
- Matcher regex em middleware.ts (exclusões de rotas)
- Session maxAge (default: 7 dias)
- Rate limit: MAX_ATTEMPTS, WINDOW_SECONDS, LOCKOUT_SECONDS em rate-limit.ts

### Segurança
- Passwords com bcrypt (salt rounds 10)
- Rate limiting por email+IP (previne brute force)
- Lockout de 15 minutos após 5 tentativas
- JWT refresh a cada request (mudanças de role refletem imediatamente)
- User inativo = sessão invalidada instantaneamente
- IP tracking via x-forwarded-for → x-real-ip
- Proteção contra user enumeration (rate limit retorna mesma mensagem)
```

### 8.2 core/database.md

Contém o schema Prisma base **COMPLETO** (não abreviado com `...`), separado em seções:

1. **Configuração** — datasource, generator, enums base (PlatformRole, Theme)
2. **User** — modelo completo com todos os campos e relações
3. **PasswordResetToken** — modelo completo
4. **EmailChangeToken** — modelo completo
5. **Modelos por módulo** — cada módulo lista seus modelos com marcação clara

O Claude Code lê este arquivo e monta o schema combinando core + módulos selecionados.

### 8.3 core/deploy.md

Documenta o pipeline completo de deploy:

1. **Dockerfile** — Multi-stage build (deps → builder → runner), Node 20 Alpine, standalone output, user não-root
2. **docker-compose.yml** — Services (app, worker opcional, db, redis), redes, volumes, labels Traefik
3. **GitHub Actions** — Trigger on push main, test → build → deploy
4. **Portainer** — Como criar stack, API de deploy, service update
5. **Variáveis de ambiente** — Tabela completa com nome, obrigatório/opcional, descrição, exemplo
6. **Primeira execução** — Prisma migrations, seed do admin, checklist de verificação

### 8.4 core/ui.md

Documenta o sistema visual completo:

1. **Design Tokens** — Todas as CSS variables do globals.css com explicação (background, foreground, primary, secondary, muted, accent, destructive, border, input, ring, sidebar-*, chart-*, radius-*)
2. **Como trocar identidade** — Quais variáveis mudar pra cada cor primária (inclui receita: "se primária é azul #2563EB, setar primary, ring, sidebar-primary, chart-1 para variantes de azul")
3. **Componentes base** — Lista completa dos shadcn/ui usados com observações (usar `render` prop, NÃO `asChild`)
4. **Layout** — Sidebar (w-60, mobile responsive com overlay), main content (max-w-7xl, padding responsivo)
5. **Páginas de auth** — Layout do login (gradient background, logo animada, form centralizado), forgot-password, reset-password, verify-email
6. **Animações** — Padrões Framer Motion (fade-in, slide-up, stagger children), timing (200-300ms), easing
7. **Responsividade** — Breakpoints (375px, 768px, 1024px, 1440px), mobile-first, sidebar collapse

---

## 9. Formato dos Módulos (completo)

Cada arquivo em `modules/` segue esta estrutura:

```markdown
# Módulo: {nome}

## Resumo
{1-2 frases do que faz}

## Dependências
- **Obrigatórias:** {módulos que DEVEM estar incluídos}
- **Opcionais:** {módulos que adicionam funcionalidade extra — descrever o benefício}
- **Serviços:** {Redis, etc. — infra necessária}

## Pacotes npm
{lista sem versões — o Claude Code usa latest na criação}

## Schema Prisma
{modelos e enums COMPLETOS — copiar do Nexus, não abreviar}

## Variáveis de ambiente
| Nome | Obrigatório | Descrição | Exemplo |
|------|:-----------:|-----------|---------|
{tabela completa}

## Arquivos a criar
{lista de todos os arquivos que este módulo adiciona, com caminho}

## Server Actions
{para cada action: nome, parâmetros, retorno, comportamento}

## Componentes UI
{para cada componente: nome, props, comportamento}

## Integração (o que muda em arquivos existentes)
{tabela: arquivo → mudança exata}

## Referência no Nexus
{caminhos dos arquivos reais para o Claude Code ler como referência}

## Customizações por plataforma
{o que tipicamente muda — textos, ícones, comportamento}

## Segurança
{medidas, riscos, validações}
```

---

## 10. Formato dos Patterns (completo)

```markdown
# Pattern: {nome}

## Resumo
{o que este padrão arquitetural resolve}

## Quando usar
{tipos de plataforma que se beneficiam deste pattern}

## Arquitetura
{diagrama de fluxo de dados, componentes envolvidos}

## Componentes típicos
{lista de componentes que este pattern geralmente inclui — stats cards, tabela, filtros, etc.}

## Implementação no Nexus (referência)
{caminhos dos arquivos reais com anotação do que é genérico vs webhook-específico}

## Como adaptar
{passo-a-passo de como transformar a implementação do Nexus pro domínio da nova plataforma}
  1. Trocar modelos Prisma de {X} para {Y}
  2. Adaptar queries de dashboard para agregar dados de {Y}
  3. Customizar stats cards (quais métricas mostrar)
  ...

## Exemplo de adaptação
{exemplo concreto — ex: "Para um CRM, o dashboard mostraria: leads/mês, taxa de conversão, pipeline por etapa"}
```

---

## 11. Templates (detalhamento)

### 11.1 app.config.ts
Arquivo TypeScript real com todos os campos de identidade. O Claude Code substitui os valores durante a criação.

### 11.2 globals.css
Baseado no globals.css REAL do Nexus, com os valores de cor substituídos por comentários indicando o que trocar. Inclui todas as CSS variables (light mode + dark mode), imports Tailwind, toast animations.

### 11.3 docker-compose.yml
Baseado no compose REAL do Nexus, com variáveis para: image name, domain, db user/name, network name. Inclui Traefik labels, volumes, healthchecks.

### 11.4 build.yml (GitHub Actions)
Baseado no workflow REAL, com variáveis para: image name, service names, Portainer endpoint.

### 11.5 Dockerfile
Baseado no Dockerfile REAL. Praticamente idêntico — muda só se a estrutura de pastas mudar.

### 11.6 env.example
Lista TODAS as variáveis possíveis, agrupadas por módulo, com descrição e se é obrigatória. O Claude Code gera apenas as seções dos módulos selecionados.

### 11.7 claude-md.template
Template do CLAUDE.md para o novo projeto, com seções:
- Projeto (nome, descrição, URL, repo)
- Stack Técnica
- Convenções
- Deploy
- Módulos incluídos (lista gerada dinamicamente)
- Blueprint de origem (caminho absoluto)
- Como adicionar módulos

---

## 12. Regra de Atualização (Blueprint Vivo)

### 12.1 Regra no CLAUDE.md do Nexus

```
## Blueprint
Ao concluir funcionalidade reutilizável, SEMPRE verificar:
- Novo módulo genérico? → Criar blueprint/modules/{nome}.md
- Módulo existente evoluiu? → Atualizar blueprint/modules/{nome}.md
- Novo padrão arquitetural? → Criar blueprint/patterns/{nome}.md
- Novo componente UI base? → Atualizar blueprint/core/ui.md
- Mudança no auth/users/profile? → Atualizar blueprint/core/overview.md
- Mudança no schema base? → Atualizar blueprint/core/database.md
- Mudança no deploy? → Atualizar blueprint/core/deploy.md
- Novo valor hardcoded? → Atualizar blueprint/hardcoded-values.md
- Template precisa sync? → Atualizar blueprint/templates/

Pergunta de checkpoint ao finalizar cada feature:
"Essa feature é reutilizável? Se sim, qual parte do blueprint precisa ser atualizada?"
```

### 12.2 Versionamento

O README.md do blueprint tem um campo `versão` e um changelog resumido no final:

```markdown
## Changelog
- v1.0 (2026-04-07) — Versão inicial: core + 6 módulos + 4 patterns
- v1.1 (YYYY-MM-DD) — Adicionado módulo X, atualizado pattern Y
```

---

## 13. Fases de Implementação

### Fase 1 — Fundação (construir agora)
- [ ] `blueprint/README.md` — roteiro guiado completo com catálogo e fluxos
- [ ] `blueprint/architecture.md` — stack, estrutura, padrões de código
- [ ] `blueprint/integration-map.md` — dependências a nível de arquivo
- [ ] `blueprint/hardcoded-values.md` — inventário completo
- [ ] `blueprint/core/overview.md` — 5 subsistemas com detalhe total
- [ ] `blueprint/core/database.md` — schema Prisma base completo
- [ ] `blueprint/core/deploy.md` — Docker, CI/CD, Portainer
- [ ] `blueprint/core/ui.md` — tokens, tema, layout, auth pages, componentes
- [ ] `blueprint/templates/app.config.ts` — identidade centralizada
- [ ] `blueprint/templates/globals.css` — CSS variables completo
- [ ] `blueprint/templates/docker-compose.yml` — compose parametrizado
- [ ] `blueprint/templates/build.yml` — GitHub Actions
- [ ] `blueprint/templates/Dockerfile` — multi-stage build
- [ ] `blueprint/templates/env.example` — variáveis documentadas
- [ ] `blueprint/templates/claude-md.template` — CLAUDE.md base
- [ ] Atualizar CLAUDE.md do Nexus com regra de blueprint

### Fase 2 — Módulos mais usados
- [ ] `blueprint/modules/multi-tenant.md`
- [ ] `blueprint/modules/notifications.md`
- [ ] `blueprint/modules/audit-log.md`
- [ ] `blueprint/modules/toast.md`

### Fase 3 — Módulos e patterns restantes
- [ ] `blueprint/modules/realtime.md`
- [ ] `blueprint/modules/encryption.md`
- [ ] `blueprint/patterns/dashboard.md`
- [ ] `blueprint/patterns/queue.md`
- [ ] `blueprint/patterns/settings.md`
- [ ] `blueprint/patterns/webhook-routing.md`

---

## 14. Pré-requisitos Concluídos

- [x] Role labels centralizados em `src/lib/constants/roles.ts`
- [x] Menu items centralizados em `src/lib/constants/navigation.ts`
- [x] `layout.tsx` usa constants centralizados
- [x] `users.ts` usa constants centralizados
- [x] `sidebar.tsx` usa `getNavItems()` do constants
- [x] `members-tab.tsx` usa styles e options do constants
- [x] Build de produção passa sem erros
- [x] Inventário completo de valores hardcoded mapeado

---

## 15. Critérios de Sucesso

1. O Claude Code lê o blueprint e cria uma plataforma funcional com módulos selecionados em uma sessão
2. A plataforma criada compila (`tsc`), builda (`next build`), e sobe em Docker sem erros
3. O processo é 100% guiado — Claude Code sugere módulos, pergunta configs, e monta tudo
4. Trocar identidade visual requer mudar apenas `app.config.ts` + logo + globals.css
5. Adicionar um módulo depois é possível seguindo a documentação do módulo
6. O blueprint cresce naturalmente junto com o Nexus via regra de atualização
7. Toda plataforma criada tem CLAUDE.md completo e funcional
