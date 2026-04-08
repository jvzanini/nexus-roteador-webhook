# Mapa de Integracoes — Nexus Roteador Webhook

Como os modulos se conectam a nivel de arquivo no projeto Nexus.

---

## 1. Fluxo de Autenticacao

Cadeia completa de arquivos desde o request HTTP ate o banco de dados:

```
Request HTTP
  |
  v
src/middleware.ts
  - Importa NextAuth + authConfig
  - Matcher regex: /((?!_next/static|_next/image|favicon\.ico|api/health|api/webhook|api/auth|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)
  - Delega para auth() do NextAuth
  |
  v
src/auth.ts
  - Configura NextAuth com provider Credentials
  - Valida schema (email + password) via Zod
  - Extrai IP do header x-forwarded-for
  - Chama authorizeCredentials()
  |
  v
src/auth.config.ts
  - Define rotas publicas: /login, /forgot-password, /reset-password, /verify-email, /api/webhook/*, /api/auth/*
  - Callback authorized(): redireciona nao-autenticados para /login
  - Callback jwt(): em TODA requisicao, recarrega dados do usuario do banco (role, status, avatar, tema)
  - Callback session(): injeta id, isSuperAdmin, platformRole, avatarUrl, theme na sessao
  - JWT strategy com maxAge: 7 dias
  |
  v
src/lib/auth-helpers.ts
  - authorizeCredentials(): busca usuario no banco, valida bcrypt, verifica isActive
  - Chama checkLoginRateLimit() antes de qualquer operacao
  - Registra login no audit log via logAudit() (fire-and-forget)
  - Retorna AuthUser {id, email, name, isSuperAdmin, platformRole, avatarUrl, theme}
  |
  v
src/lib/rate-limit.ts
  - checkLoginRateLimit(): 5 tentativas por minuto, lockout de 15 minutos
  - Usa Redis para sliding window (keys: login:attempts:{email}:{ip}, login:lockout:{email}:{ip})
  |
  v
src/lib/redis.ts
  - Singleton IORedis com lazyConnect para build time
  - Conecta via REDIS_URL
  |
  v
src/lib/prisma.ts
  - Singleton PrismaClient com adapter PrismaPg
  - Importa de @/generated/prisma/client (Prisma v7)
  - Conecta via DATABASE_URL
```

### Arquivo auxiliar de sessao

```
src/lib/auth.ts
  - getCurrentUser(): extrai usuario da sessao NextAuth
  - Retorna CurrentUser {id, name, email, isSuperAdmin, platformRole, avatarUrl, theme}
  - Usado por TODAS as server actions como ponto de entrada de autenticacao
```

---

## 2. Impacto por Modulo

### 2.1 Multi-tenant

| Acao | Arquivo | Mudanca |
|------|---------|---------|
| Criar modelo Company | `prisma/schema.prisma` | Model Company com id, name, slug, webhookKey, logoUrl, isActive |
| Criar modelo UserCompanyMembership | `prisma/schema.prisma` | Model com userId, companyId, role (CompanyRole), isActive. Unique constraint [userId, companyId] |
| Criar enums | `prisma/schema.prisma` | CompanyRole (super_admin, company_admin, manager, viewer), PlatformRole (super_admin, admin, manager, viewer) |
| Criar lib tenant | `src/lib/tenant.ts` | getAccessibleCompanyIds() — retorna undefined para super_admin (sem filtro), array de IDs para demais |
| Criar lib tenant | `src/lib/tenant.ts` | buildTenantFilter() — retorna {} para super_admin ou { companyId: { in: [...] } } |
| Criar lib tenant | `src/lib/tenant.ts` | assertCompanyAccess() — verifica acesso a empresa, lanca erro se negado |
| Criar lib tenant | `src/lib/tenant.ts` | getUserCompanyRole() — retorna role do usuario na empresa ou null |
| Criar action company | `src/lib/actions/company.ts` | CRUD completo de empresas com tenant scoping |
| Criar paginas empresa | `src/app/(protected)/companies/` | Listagem, detalhe com tabs (Visao Geral, WhatsApp Cloud, Rotas, Logs, Membros) |
| Adicionar nav | `src/lib/constants/navigation.ts` | Item "Empresas" com href "/companies" e icone Building2 |
| Criar constantes roles | `src/lib/constants/roles.ts` | PLATFORM_ROLE_LABELS, COMPANY_ROLE_LABELS, HIERARCHY, STYLES, OPTIONS |
| Modificar actions de dados | `src/lib/actions/credential.ts`, `webhook-routes.ts`, `logs.ts`, `dashboard.ts` | Tenant scoping via buildTenantFilter() e assertCompanyAccess() |
| Modificar JWT | `src/auth.config.ts` | Incluir isSuperAdmin e platformRole no token (refresh em cada request) |
| Criar action users | `src/lib/actions/users.ts` | CRUD de usuarios + memberships com controle hierarquico de acesso |
| Modificar layout | `src/app/(protected)/layout.tsx` | Extrai platformRole e isSuperAdmin da sessao para sidebar |

### 2.2 Notifications

| Acao | Arquivo | Mudanca |
|------|---------|---------|
| Criar modelo | `prisma/schema.prisma` | Model Notification com userId, companyId, type (error/warning/info), title, message, link, isRead, channelsSent |
| Criar enum | `prisma/schema.prisma` | NotificationType (error, warning, info) |
| Criar action | `src/lib/actions/notifications.ts` | getNotifications() com cursor-based pagination, getUnreadCount(), markAsRead(), markAllAsRead() |
| Criar componente bell | `src/components/layout/notification-bell.tsx` | NotificationBell com dropdown, contagem de nao lidas, polling 30s, real-time via useRealtime |
| Integrar no layout | `src/app/(protected)/layout.tsx` | Adicionar NotificationBell no header (atualmente integrado via sidebar) |
| Receber eventos | `src/components/layout/notification-bell.tsx` | Reage a evento "notification:new" do SSE para atualizar contagem em tempo real |

### 2.3 Audit Log

| Acao | Arquivo | Mudanca |
|------|---------|---------|
| Criar modelo | `prisma/schema.prisma` | Model AuditLog com actorType (user/system), actorId, actorLabel, companyId, action, resourceType, resourceId, details (JSONB), ipAddress, userAgent |
| Criar enum | `prisma/schema.prisma` | ActorType (user, system) |
| Criar lib | `src/lib/audit.ts` | logAudit() — fire-and-forget, erros no console sem propagar |
| Modificar auth-helpers | `src/lib/auth-helpers.ts` | Chama logAudit() no login (action: "auth.login") |
| Modificar actions de mutacao | `src/lib/actions/credential.ts` | logAudit() em credential.create, credential.update, credential.delete |
| Padrao de acoes | — | auth.login, auth.logout, auth.invalid_signature, credential.create/update/delete, cleanup.logs, cleanup.notifications, delivery.orphan_recovery |

### 2.4 Realtime (SSE)

| Acao | Arquivo | Mudanca |
|------|---------|---------|
| Criar lib | `src/lib/realtime.ts` | publishRealtimeEvent() via Redis Pub/Sub no canal "nexus:realtime" |
| Criar tipos | `src/lib/realtime.ts` | RealtimeEvent: delivery:completed, delivery:failed, notification:new, webhook:received |
| Criar API route SSE | `src/app/api/events/route.ts` | GET handler com ReadableStream, subscriber Redis dedicado, heartbeat 30s |
| Criar hook | `src/hooks/use-realtime.ts` | useRealtime(onEvent) — EventSource para /api/events com auto-reconnect 5s |
| Depende de | `src/lib/redis.ts` | Subscriber Redis separado para subscribe (requisito do Redis) |
| Consumido por | `src/components/layout/notification-bell.tsx` | Usa useRealtime para atualizar notificacoes em tempo real |
| Publicado pelo | `src/worker/delivery.ts` | Worker publica eventos delivery:completed e delivery:failed |

### 2.5 Encryption

| Acao | Arquivo | Mudanca |
|------|---------|---------|
| Criar lib | `src/lib/encryption.ts` | encrypt() — AES-256-GCM, retorna "iv:authTag:encrypted" |
| Criar lib | `src/lib/encryption.ts` | decrypt() — reverte encrypt(), valida formato |
| Criar lib | `src/lib/encryption.ts` | mask() — retorna "••••••••" + ultimos N caracteres |
| Variavel de ambiente | `docker-compose.yml` | ENCRYPTION_KEY (64 hex chars = 32 bytes) |
| Consumido por | `src/lib/actions/credential.ts` | Encripta accessToken e metaAppSecret ao salvar credenciais |
| Consumido por | `src/lib/actions/credential.ts` | Decripta ao ler credenciais, mask() para exibicao |

### 2.6 Toast

| Acao | Arquivo | Mudanca |
|------|---------|---------|
| Criar componente | `src/components/ui/sonner.tsx` | Toaster customizado com MutationObserver para pilha bottom-up |
| Estilos CSS | `src/app/globals.css` | Progress bar ::before com animacao toast-shrink (4s), close button estilizado, gradiente roxo |
| Integrar no layout raiz | `src/app/layout.tsx` | `<Toaster />` dentro de `<Providers>` (disponivel em toda a aplicacao) |
| Configuracao | `src/components/ui/sonner.tsx` | visibleToasts: 4, position: bottom-right, duration: 4000ms, closeButton: true |
| Mecanismo | `src/components/ui/sonner.tsx` | pointer-events: none no `<ol>` (container), auto em cada `<li>` (toast) — timers independentes |
| Animacao entrada | `src/components/ui/sonner.tsx` | translateY(80px) -> none via cubic-bezier(0.21, 1.02, 0.73, 1) |
| Animacao saida | `src/components/ui/sonner.tsx` | Colapso suave: opacity 0, height 0, margin 0 em 0.3-0.4s |
| Icones | `src/components/ui/sonner.tsx` | Lucide: CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon |

---

## 3. Diagrama de Dependencias

```
prisma/schema.prisma (modelos e enums)
  |
  +-- src/generated/prisma/client (gerado pelo Prisma v7)
       |
       +-- src/lib/prisma.ts (singleton PrismaClient + PrismaPg adapter)
            |
            +-- src/lib/tenant.ts (multi-tenant scoping)
            |    |
            |    +-- src/lib/actions/company.ts
            |    +-- src/lib/actions/credential.ts
            |    +-- src/lib/actions/webhook-routes.ts
            |    +-- src/lib/actions/logs.ts
            |    +-- src/lib/actions/dashboard.ts
            |    +-- src/lib/actions/users.ts
            |
            +-- src/lib/audit.ts (audit log)
            |    |
            |    +-- src/lib/auth-helpers.ts (login audit)
            |    +-- src/lib/actions/credential.ts (mutation audit)
            |
            +-- src/lib/actions/notifications.ts (CRUD notificacoes)
            |    |
            |    +-- src/components/layout/notification-bell.tsx
            |
            +-- src/lib/auth-helpers.ts (authorize)
                 |
                 +-- src/auth.ts (NextAuth provider)
                      |
                      +-- src/auth.config.ts (callbacks JWT/session)
                           |
                           +-- src/middleware.ts (protecao de rotas)

src/lib/redis.ts (singleton IORedis)
  |
  +-- src/lib/rate-limit.ts (login rate limiting)
  |    |
  |    +-- src/lib/auth-helpers.ts
  |
  +-- src/lib/realtime.ts (Redis Pub/Sub)
       |
       +-- src/app/api/events/route.ts (SSE endpoint)
       |    |
       |    +-- src/hooks/use-realtime.ts (EventSource hook)
       |         |
       |         +-- src/components/layout/notification-bell.tsx
       |
       +-- src/worker/delivery.ts (publica eventos)

src/lib/encryption.ts (AES-256-GCM)
  |
  +-- src/lib/actions/credential.ts (encrypt/decrypt/mask tokens)

src/lib/auth.ts (getCurrentUser helper)
  |
  +-- TODAS as server actions em src/lib/actions/*

src/lib/constants/roles.ts (labels, hierarchy, styles)
  |
  +-- src/app/(protected)/layout.tsx
  +-- src/lib/actions/users.ts
  +-- src/components/ (tabelas de membros, usuarios)

src/lib/constants/navigation.ts (menu items)
  |
  +-- src/components/layout/sidebar.tsx

src/components/ui/sonner.tsx (Toast)
  |
  +-- src/app/layout.tsx (raiz, disponivel globalmente)

src/lib/email.ts (Resend)
  |
  +-- src/lib/actions/password-reset.ts
  +-- src/lib/actions/profile.ts (email change verification)
```

### Dependencias Externas (npm)

```
next-auth v5         -> src/auth.ts, src/auth.config.ts, src/middleware.ts
@prisma/adapter-pg   -> src/lib/prisma.ts
ioredis              -> src/lib/redis.ts
bullmq               -> src/worker/ (fila de entregas)
bcryptjs             -> src/lib/auth-helpers.ts
resend               -> src/lib/email.ts
sonner               -> src/components/ui/sonner.tsx
framer-motion        -> src/components/ (animacoes)
recharts             -> src/app/(protected)/dashboard/ (graficos)
lucide-react         -> Icones em toda a aplicacao
next-themes          -> src/components/providers/theme-provider.tsx
zod                  -> src/auth.ts, server actions (validacao)
```
