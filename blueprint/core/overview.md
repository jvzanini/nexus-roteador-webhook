# Core — Subsistemas Centrais

> Documentacao completa dos 5 subsistemas centrais do Nexus Roteador Webhook: Auth, Users, Profile, Password Reset e Email. Estes modulos sao inseparaveis e formam a base de identidade, acesso e comunicacao da plataforma.

---

## 1. Auth

### O que faz

Sistema de autenticacao baseado em NextAuth.js v5 com estrategia JWT stateless. Gerencia login por email/senha, protecao de rotas via middleware, refresh automatico do token em toda requisicao autenticada (garantindo que mudancas de role/status tomam efeito imediato), e rate limiting por email+IP via Redis para prevenir ataques de forca bruta.

### Arquivos no Nexus

| Arquivo | Descricao |
|---------|-----------|
| `src/auth.ts` | Configuracao principal do NextAuth com provider Credentials, schema Zod de login e extracao de IP |
| `src/auth.config.ts` | Callbacks JWT/session, rotas publicas, estrategia JWT com maxAge de 7 dias, refresh de dados do DB em toda requisicao |
| `src/middleware.ts` | Middleware de protecao de rotas com matcher regex que exclui assets estaticos, webhook, auth e health |
| `src/lib/auth.ts` | Helper `getCurrentUser()` que retorna o usuario autenticado da sessao atual |
| `src/lib/auth-helpers.ts` | Funcao `authorizeCredentials()` que valida credenciais, verifica rate limit, checa status ativo e registra audit log |
| `src/lib/rate-limit.ts` | Rate limiting de login via Redis com sliding window de 1 minuto, max 5 tentativas e lockout de 15 minutos |

### Pacotes npm

- `next-auth` (v5, beta)
- `bcryptjs`
- `ioredis`
- `zod`

### Variaveis de ambiente

| Variavel | Descricao | Como gerar/exemplo |
|----------|-----------|-------------------|
| `NEXTAUTH_SECRET` | Chave secreta para assinar tokens JWT | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | URL base da aplicacao | `https://roteadorwebhook.nexusai360.com` |
| `REDIS_URL` | String de conexao do Redis | `redis://redis:6379` |

### Schema Prisma

```prisma
model User {
  id            String       @id @default(uuid()) @db.Uuid
  name          String
  email         String       @unique
  password      String
  platformRole  PlatformRole @default(viewer) @map("platform_role")
  isSuperAdmin  Boolean      @default(false) @map("is_super_admin")
  avatarUrl     String?      @map("avatar_url")
  theme         Theme        @default(dark)
  isActive      Boolean      @default(true) @map("is_active")
  invitedById   String?      @map("invited_by") @db.Uuid
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  invitedBy     User?    @relation("UserInvites", fields: [invitedById], references: [id])
  invitees      User[]   @relation("UserInvites")
  memberships   UserCompanyMembership[]
  notifications Notification[]
  auditLogs     AuditLog[]     @relation("AuditActor")
  passwordResetTokens PasswordResetToken[]
  emailChangeTokens   EmailChangeToken[]

  @@map("users")
}

enum PlatformRole {
  super_admin
  admin
  manager
  viewer
}

enum Theme {
  dark
  light
  system
}
```

### Server Actions / Funcoes exportadas

**`src/auth.ts`**

- `signIn(provider, credentials)` — Inicia o fluxo de login. Valida email/senha com Zod, extrai IP dos headers, delega para `authorizeCredentials()`
- `signOut()` — Encerra a sessao do usuario
- `auth()` — Retorna a sessao atual (usado internamente por `getCurrentUser()`)

**`src/lib/auth.ts`**

- `getCurrentUser(): Promise<CurrentUser | null>` — Retorna o usuario autenticado com campos `{ id, name, email, isSuperAdmin, platformRole, avatarUrl, theme }`. Retorna `null` se nao autenticado.

**`src/lib/auth-helpers.ts`**

- `authorizeCredentials(credentials: { email, password }, ipAddress: string): Promise<AuthUser | null>` — Valida credenciais contra o banco. Verifica rate limit antes de qualquer operacao, rejeita usuarios inativos, compara hash bcrypt, registra login no audit log (fire-and-forget). Retorna `{ id, email, name, isSuperAdmin, platformRole, avatarUrl, theme }` ou `null`.
- `isPublicRoute(pathname: string): boolean` — Verifica se o pathname e uma rota publica. Rotas publicas: `/login`, `/forgot-password`. Prefixos publicos: `/api/webhook/`, `/api/auth/`, `/api/health`.

**`src/lib/rate-limit.ts`**

- `checkLoginRateLimit(email: string, ip: string): Promise<RateLimitResult>` — Verifica se o par email+IP esta bloqueado. Retorna `{ allowed: boolean, remaining: number, retryAfterSeconds?: number }`. Usa sliding window de 1 minuto com max 5 tentativas. Ao atingir o limite, cria lockout de 15 minutos no Redis.
- `clearLoginRateLimit(email: string, ip: string): Promise<void>` — Limpa o contador de tentativas e lockout para o par email+IP.

### O que customizar por plataforma

- **Rotas publicas:** Array `PUBLIC_ROUTES` e `PUBLIC_PREFIXES` em `auth-helpers.ts`, e a lista `isPublicRoute` em `auth.config.ts`
- **Matcher do middleware:** Regex em `middleware.ts` que define quais caminhos passam pelo middleware de auth
- **Session maxAge:** Atualmente 7 dias (`7 * 24 * 60 * 60`), configuravel em `auth.config.ts`
- **Rate limit:** Constantes `MAX_ATTEMPTS` (5), `WINDOW_SECONDS` (60), `LOCKOUT_SECONDS` (900) em `rate-limit.ts`
- **Schema de login:** Validacao Zod em `auth.ts` (email + senha minima)
- **Campos do token JWT:** Definidos no callback `jwt` em `auth.config.ts` — adicionar/remover campos conforme necessidade
- **Provider de autenticacao:** Atualmente apenas Credentials, pode adicionar OAuth providers em `auth.ts`

### Seguranca

- **Bcrypt:** Senhas hasheadas com bcrypt (cost factor 12)
- **Rate limiting por email+IP:** Sliding window de 1 minuto, max 5 tentativas, lockout de 15 minutos via Redis
- **JWT refresh em toda requisicao:** O callback `jwt` consulta o banco em cada request para atualizar `platformRole`, `isSuperAdmin`, `isActive`, `name`, `avatarUrl`, `theme`. Mudancas de role tomam efeito imediato sem esperar expiracao do token
- **Usuario inativo = sessao invalidada:** Se `isActive` for `false` no DB, o callback `jwt` retorna `null`, matando a sessao
- **IP tracking:** IP extraido de `x-forwarded-for` ou `x-real-ip` para rate limiting e audit log
- **Protecao contra enumeracao de usuarios:** Login retorna `null` generico tanto para usuario inexistente quanto senha errada
- **Audit log de login:** Cada login bem-sucedido e registrado com IP e timestamp
- **trustHost:** Habilitado para funcionar corretamente atras de reverse proxy (Docker Swarm + Traefik)

---

## 2. Users

### O que faz

CRUD completo de usuarios com controle de acesso hierarquico em duas camadas (platformRole para plataforma, CompanyRole para empresas). Gerencia listagem, criacao, edicao, exclusao (hard delete com remocao de memberships), ativacao/desativacao, e vinculacao de usuarios a empresas com roles independentes.

### Arquivos no Nexus

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/actions/users.ts` | Server Actions de CRUD de usuarios e memberships com validacao Zod e controle hierarquico |
| `src/lib/constants/roles.ts` | Labels, hierarquia numerica, estilos CSS e opcoes de select para platform roles e company roles |
| `src/lib/constants/navigation.ts` | Itens de navegacao com restricao por role (sidebar) |

### Pacotes npm

- `bcryptjs`
- `zod`

### Variaveis de ambiente

Nenhuma variavel especifica — usa as mesmas do Auth (banco via Prisma, sessao via NextAuth).

### Schema Prisma

```prisma
model User {
  id            String       @id @default(uuid()) @db.Uuid
  name          String
  email         String       @unique
  password      String
  platformRole  PlatformRole @default(viewer) @map("platform_role")
  isSuperAdmin  Boolean      @default(false) @map("is_super_admin")
  avatarUrl     String?      @map("avatar_url")
  theme         Theme        @default(dark)
  isActive      Boolean      @default(true) @map("is_active")
  invitedById   String?      @map("invited_by") @db.Uuid
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  invitedBy     User?    @relation("UserInvites", fields: [invitedById], references: [id])
  invitees      User[]   @relation("UserInvites")
  memberships   UserCompanyMembership[]
  notifications Notification[]
  auditLogs     AuditLog[]     @relation("AuditActor")
  passwordResetTokens PasswordResetToken[]
  emailChangeTokens   EmailChangeToken[]

  @@map("users")
}

model UserCompanyMembership {
  id        String          @id @default(uuid()) @db.Uuid
  userId    String          @map("user_id") @db.Uuid
  companyId String          @map("company_id") @db.Uuid
  role      CompanyRole
  isActive  Boolean         @default(true) @map("is_active")
  createdAt DateTime        @default(now()) @map("created_at")
  updatedAt DateTime        @updatedAt @map("updated_at")

  user      User            @relation(fields: [userId], references: [id], onDelete: Restrict)
  company   Company         @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@unique([userId, companyId])
  @@map("user_company_memberships")
}

enum PlatformRole {
  super_admin
  admin
  manager
  viewer
}

enum CompanyRole {
  super_admin
  company_admin
  manager
  viewer
}
```

### Server Actions / Funcoes exportadas

**`src/lib/actions/users.ts`**

- `getUsers(): Promise<ActionResult<UserItem[]>>` — Lista todos os usuarios com contagem de empresas, role mais alto, e flags `canEdit`/`canDelete` calculadas pela hierarquia. Apenas `super_admin` e `admin` podem acessar. Admin nao ve super admins na lista.
- `getUserDetail(userId: string): Promise<ActionResult<UserDetail>>` — Retorna detalhes completos de um usuario incluindo memberships com nome da empresa. Apenas `super_admin` pode acessar.
- `createUser(data: { name, email, password, role }): Promise<ActionResult<{ id: string }>>` — Cria usuario com hash bcrypt (cost 12), mapeando role legado para platformRole. Valida com Zod (nome 2-100 chars, email valido, senha min 8). Admin nao pode criar super admin. Registra `invitedById`.
- `updateUser(userId: string, data: { name?, email?, password?, role?, platformRole?, isActive? }): Promise<ActionResult>` — Atualiza usuario com validacao hierarquica completa. Nao pode alterar a si mesmo. Super admin nao pode ser inativado. Admin nao edita super admin nem outro admin. Ao promover para super_admin, vincula a todas as empresas. Ao rebaixar de super_admin, atualiza todas as memberships. Ao definir viewer, todas as memberships viram viewer.
- `deleteUser(userId: string): Promise<ActionResult>` — Exclui usuario (hard delete) removendo todas as memberships primeiro. Nao pode deletar a si mesmo. Admin nao pode deletar super admin nem outro admin.
- `getCompanyMembers(companyId: string): Promise<ActionResult<MemberItem[]>>` — Lista membros de uma empresa. Super admin ou membro da empresa pode visualizar. Retorna role, status, platformRole e flag isSuperAdmin.
- `addCompanyMember(data: { userId, companyId, role }): Promise<ActionResult>` — Adiciona usuario como membro de uma empresa. Apenas super_admin. Valida duplicidade (unique constraint userId+companyId).
- `updateMembership(data: { membershipId, role?, isActive? }): Promise<ActionResult>` — Atualiza role ou status de um membership. Apenas super_admin.
- `removeMembership(membershipId: string): Promise<ActionResult>` — Remove um membership (hard delete). Apenas super_admin.

**`src/lib/constants/roles.ts`**

Constantes exportadas:

```typescript
PLATFORM_ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Gerente",
  viewer: "Visualizador",
}

PLATFORM_ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 4,
  admin: 3,
  manager: 2,
  viewer: 1,
}

PLATFORM_ROLE_STYLES: Record<string, { label: string; className: string }> = {
  super_admin: { label: "Super Admin", className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  admin: { label: "Admin", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  manager: { label: "Gerente", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  viewer: { label: "Visualizador", className: "bg-zinc-800 text-zinc-400 border-zinc-700" },
}

COMPANY_ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  manager: "Gerente",
  viewer: "Visualizador",
}

COMPANY_ROLE_HIERARCHY: Record<string, number> = {
  company_admin: 3,
  manager: 2,
  viewer: 1,
}

COMPANY_ROLE_STYLES: Record<string, { label: string; className: string }> = {
  company_admin: { label: "Admin", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  manager: { label: "Gerente", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  viewer: { label: "Visualizador", className: "bg-zinc-800 text-zinc-400 border-zinc-700" },
}

COMPANY_ROLE_OPTIONS = [
  { value: "company_admin", label: "Admin", description: "Gerencia a empresa", bg: "..." },
  { value: "manager", label: "Gerente", description: "Gerencia rotas e webhooks", bg: "..." },
  { value: "viewer", label: "Visualizador", description: "Apenas visualizacao", bg: "..." },
]
```

**`src/lib/constants/navigation.ts`**

```typescript
interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  allowedRoles?: string[];
}

MAIN_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Empresas", href: "/companies", icon: Building2 },
]

RESTRICTED_NAV_ITEMS: NavItem[] = [
  { label: "Usuarios", href: "/users", icon: Users, allowedRoles: ["super_admin", "admin"] },
  { label: "Configuracoes", href: "/settings", icon: Settings, allowedRoles: ["super_admin"] },
]

getNavItems(platformRole: string): NavItem[] — Retorna itens visiveis para o role, filtrando RESTRICTED_NAV_ITEMS por allowedRoles.
```

### O que customizar por plataforma

- **Hierarquia de roles:** Constantes `PLATFORM_ROLE_HIERARCHY` e `COMPANY_ROLE_HIERARCHY` — ajustar niveis numericos e adicionar/remover roles
- **Labels e estilos:** `PLATFORM_ROLE_LABELS`, `PLATFORM_ROLE_STYLES`, `COMPANY_ROLE_*` — textos e classes CSS dos badges
- **Opcoes de select:** `COMPANY_ROLE_OPTIONS` — labels e descricoes nos selects de role
- **Itens de navegacao:** `MAIN_NAV_ITEMS` e `RESTRICTED_NAV_ITEMS` — rotas, icones e restricoes de acesso
- **Regras de permissao:** Logica de `canEdit`/`canDelete` em `getUsers()` e validacoes hierarquicas em `updateUser()`/`deleteUser()`
- **Schemas de validacao:** `CreateUserSchema` e `UpdateUserSchema` — campos obrigatorios, tamanhos minimos/maximos
- **Mapeamento platformRole para CompanyRole:** Constante `PLATFORM_TO_COMPANY_ROLE` em `updateUser()`

### Seguranca

- **Hierarquia de permissoes:** Super Admin > Admin > Gerente > Visualizador. Ninguem edita ou exclui nivel igual ou superior (exceto super admin que edita todos menos a si mesmo)
- **Protecao do Super Admin:** Super admin nao pode ser inativado, nao pode ser excluido pela plataforma, nao pode ser rebaixado por admin
- **Auto-protecao:** Ninguem pode alterar ou excluir a si mesmo via `updateUser()`/`deleteUser()`
- **Admin isolado:** Admin nao ve super admins na listagem, nao edita admins, nao cria super admins
- **Validacao Zod:** Todos os inputs sao validados com schemas Zod antes de qualquer operacao no banco
- **Transacao atomica:** `updateUser()` usa `prisma.$transaction` para garantir consistencia entre update do user e update das memberships
- **Hash bcrypt:** Senhas de novos usuarios e alteracoes sao hasheadas com cost factor 12

---

## 3. Profile

### O que faz

Gerenciamento do perfil do usuario autenticado. Permite alterar nome, avatar (URL), tema (dark/light/system), senha (exigindo senha atual), e solicitar troca de email com verificacao via token enviado ao novo endereco. O email so e efetivamente alterado apos confirmacao do link.

### Arquivos no Nexus

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/actions/profile.ts` | Server Actions de perfil: consulta, atualizacao de nome/avatar, senha, tema, e fluxo completo de troca de email com token |

### Pacotes npm

- `nanoid`
- `bcryptjs`

### Variaveis de ambiente

| Variavel | Descricao | Como gerar/exemplo |
|----------|-----------|-------------------|
| `NEXTAUTH_URL` | URL base para montar o link de verificacao de email | `https://roteadorwebhook.nexusai360.com` |

### Schema Prisma

```prisma
model User {
  id            String       @id @default(uuid()) @db.Uuid
  name          String
  email         String       @unique
  password      String
  platformRole  PlatformRole @default(viewer) @map("platform_role")
  isSuperAdmin  Boolean      @default(false) @map("is_super_admin")
  avatarUrl     String?      @map("avatar_url")
  theme         Theme        @default(dark)
  isActive      Boolean      @default(true) @map("is_active")
  invitedById   String?      @map("invited_by") @db.Uuid
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  invitedBy     User?    @relation("UserInvites", fields: [invitedById], references: [id])
  invitees      User[]   @relation("UserInvites")
  memberships   UserCompanyMembership[]
  notifications Notification[]
  auditLogs     AuditLog[]     @relation("AuditActor")
  passwordResetTokens PasswordResetToken[]
  emailChangeTokens   EmailChangeToken[]

  @@map("users")
}

model EmailChangeToken {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  newEmail  String   @map("new_email")
  token     String   @unique
  expiresAt DateTime @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime @default(now()) @map("created_at")

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token], name: "idx_email_change_token")
  @@index([userId, createdAt(sort: Desc)], name: "idx_email_change_user")
  @@map("email_change_tokens")
}

enum Theme {
  dark
  light
  system
}
```

### Server Actions / Funcoes exportadas

**`src/lib/actions/profile.ts`**

- `getProfile(): Promise<{ success: boolean, data?: { id, name, email, avatarUrl, theme, isSuperAdmin, createdAt }, error?: string }>` — Retorna dados do perfil do usuario autenticado. Consulta o banco para dados frescos (nao depende apenas do JWT).
- `updateProfile(name: string, avatarUrl: string | null): Promise<ActionResult>` — Atualiza nome e avatar. Nome minimo 2 caracteres (trimmed). Revalida cache de `/profile` e layout.
- `changePassword(currentPassword: string, newPassword: string): Promise<ActionResult>` — Altera a senha do usuario. Exige senha atual para validacao. Nova senha minimo 6 caracteres. Hash bcrypt com cost 12.
- `updateTheme(theme: "dark" | "light" | "system"): Promise<ActionResult>` — Atualiza o tema do usuario no banco. Revalida layout para aplicacao imediata.
- `requestEmailChange(newEmail: string, currentPassword: string): Promise<ActionResult>` — Solicita troca de email. Valida senha atual, verifica se novo email esta disponivel, aplica rate limit de 2 minutos entre solicitacoes (via query no banco), gera token nanoid(48), salva `EmailChangeToken` com expiracao de 1 hora, e envia email de verificacao para o novo endereco.
- `confirmEmailChange(token: string): Promise<ActionResult>` — Confirma a troca de email usando o token. Valida: token existe, nao foi usado, nao expirou, usuario esta ativo, novo email ainda disponivel. Atualiza email e marca token como usado em transacao atomica.

### O que customizar por plataforma

- **Campos do perfil:** Adicionar/remover campos em `getProfile()` e `updateProfile()` (ex: telefone, bio, cargo)
- **Validacao de nome:** Tamanho minimo (atualmente 2 caracteres) em `updateProfile()`
- **Validacao de senha:** Tamanho minimo (atualmente 6 caracteres) em `changePassword()`
- **Expiracao do token de email:** Constante `TOKEN_EXPIRY_MS` (atualmente 1 hora)
- **Rate limit de troca de email:** Constante `RATE_LIMIT_MS` (atualmente 2 minutos)
- **Opcoes de tema:** Enum `Theme` no Prisma (atualmente dark/light/system)
- **URL base do link de verificacao:** Variavel `NEXTAUTH_URL` usada para montar `verifyUrl`
- **Revalidacao de cache:** Paths revalidados em `updateProfile()` e `updateTheme()`

### Seguranca

- **Senha atual obrigatoria:** Troca de senha e troca de email exigem a senha atual como confirmacao
- **Token de verificacao de email:** Gerado com `nanoid(48)` (entropia criptografica), expira em 1 hora, uso unico (campo `usedAt`)
- **Rate limit de troca de email:** 2 minutos entre solicitacoes (verificado via query no banco, nao Redis)
- **Verificacao de disponibilidade:** Novo email e checado tanto na solicitacao quanto na confirmacao (previne race condition)
- **Transacao atomica:** Confirmacao de email atualiza user e marca token como usado em `$transaction`
- **Usuario inativo bloqueado:** `confirmEmailChange()` verifica `isActive` antes de aplicar a troca
- **Autenticacao obrigatoria:** Todas as actions (exceto `confirmEmailChange`) verificam `getCurrentUser()`

---

## 4. Password Reset

### O que faz

Fluxo de "esqueci minha senha" com envio de email contendo link com token seguro. O usuario solicita o reset informando seu email, recebe um link, e ao clicar define uma nova senha. O sistema e projetado para nao vazar informacao sobre existencia de contas (sempre retorna sucesso na solicitacao).

### Arquivos no Nexus

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/actions/password-reset.ts` | Server Actions de solicitacao e redefinicao de senha com token, rate limit e protecao contra enumeracao |

### Pacotes npm

- `nanoid`
- `bcryptjs`

### Variaveis de ambiente

| Variavel | Descricao | Como gerar/exemplo |
|----------|-----------|-------------------|
| `NEXTAUTH_URL` | URL base para montar o link de reset | `https://roteadorwebhook.nexusai360.com` |

### Schema Prisma

```prisma
model PasswordResetToken {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  token     String   @unique
  expiresAt DateTime @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime @default(now()) @map("created_at")

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token], name: "idx_reset_token")
  @@index([userId, createdAt(sort: Desc)], name: "idx_reset_user")
  @@map("password_reset_tokens")
}
```

### Server Actions / Funcoes exportadas

**`src/lib/actions/password-reset.ts`**

- `requestPasswordReset(email: string): Promise<ActionResult>` — Solicita redefinicao de senha. Normaliza email (trim + lowercase). Se usuario nao existe ou esta inativo, retorna `{ success: true }` (protecao contra enumeracao). Aplica rate limit de 2 minutos entre tokens para o mesmo usuario. Gera token `nanoid(48)`, salva `PasswordResetToken` com expiracao de 1 hora, monta URL `{baseUrl}/reset-password?token={token}` e envia email via `sendPasswordResetEmail()`.
- `resetPassword(token: string, newPassword: string): Promise<ActionResult>` — Redefine a senha usando o token. Valida: token existe, nao foi usado (`usedAt` null), nao expirou, usuario esta ativo, senha minimo 6 caracteres. Hash bcrypt com cost 12. Atualiza senha e marca token como usado em transacao atomica (`$transaction`).

### O que customizar por plataforma

- **Expiracao do token:** Constante `TOKEN_EXPIRY_MS` (atualmente 1 hora / 3.600.000ms)
- **Rate limit entre tokens:** Constante `RATE_LIMIT_MS` (atualmente 2 minutos / 120.000ms)
- **Tamanho minimo da senha:** Validacao em `resetPassword()` (atualmente 6 caracteres)
- **URL do link de reset:** Formato `{NEXTAUTH_URL}/reset-password?token={token}` — ajustar path se necessario
- **Rota publica:** `/forgot-password` e `/reset-password` devem estar nas rotas publicas do auth config

### Seguranca

- **Protecao contra enumeracao de usuarios:** `requestPasswordReset()` sempre retorna `{ success: true }` mesmo quando email nao existe ou usuario esta inativo — atacante nao consegue descobrir quais emails estao cadastrados
- **Rate limit silencioso:** Se o usuario ja solicitou um token nos ultimos 2 minutos, retorna sucesso sem gerar novo token (nao revela o rate limit)
- **Token seguro:** Gerado com `nanoid(48)` — 48 caracteres alfanumericos com entropia criptografica
- **Expiracao de 1 hora:** Token tem validade curta para minimizar janela de ataque
- **Uso unico:** Campo `usedAt` impede reutilizacao do mesmo token
- **Usuario inativo bloqueado:** `resetPassword()` verifica `isActive` antes de permitir redefinicao
- **Transacao atomica:** Update de senha e marcacao do token como usado ocorrem na mesma transacao
- **Cascade delete:** Se o usuario for excluido, todos os tokens sao removidos automaticamente (`onDelete: Cascade`)

---

## 5. Email

### O que faz

Envio de emails transacionais via Resend SDK. Fornece duas funcoes para enviar emails com templates HTML estilizados em tema dark: redefinicao de senha e verificacao de troca de email. Os templates seguem o visual da marca Nexus com fundo escuro, botao com gradiente azul e rodape com copyright.

### Arquivos no Nexus

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/email.ts` | Funcoes de envio de email com Resend SDK e templates HTML inline |

### Pacotes npm

- `resend`

### Variaveis de ambiente

| Variavel | Descricao | Como gerar/exemplo |
|----------|-----------|-------------------|
| `RESEND_API_KEY` | Chave de API do Resend para envio de emails | Obter em https://resend.com/api-keys — formato `re_xxxxxxxxx` |

### Schema Prisma

Nenhum model proprio — este modulo e chamado por `password-reset.ts` e `profile.ts` que gerenciam os tokens.

### Server Actions / Funcoes exportadas

**`src/lib/email.ts`**

- `sendPasswordResetEmail(to: string, userName: string, resetUrl: string): Promise<void>` — Envia email de redefinicao de senha para o endereco `to`. Template com saudacao personalizada, texto explicativo, botao "Redefinir minha senha" apontando para `resetUrl`, aviso de expiracao de 1 hora, e rodape com copyright NexusAI360. Lanca erro se o envio falhar.
- `sendEmailChangeVerification(to: string, userName: string, verifyUrl: string): Promise<void>` — Envia email de confirmacao de troca de email para o novo endereco `to`. Template com saudacao personalizada, texto mostrando o novo email em destaque, botao "Confirmar novo e-mail" apontando para `verifyUrl`, aviso de expiracao de 1 hora, e rodape com copyright NexusAI360. Lanca erro se o envio falhar.

**Configuracao interna:**

```typescript
const FROM_EMAIL = "Nexus <noreply@nexusai360.com>";
```

### Estrutura dos templates HTML

Ambos os templates seguem a mesma estrutura:

1. **Container:** `max-width: 480px`, fundo `#09090b` (zinc-950), texto `#fafafa`, font-family system stack
2. **Header:** Icone com fundo `#2563eb` (blue-600), border-radius 12px, seguido do titulo "Nexus Roteador Webhook" em 20px bold
3. **Corpo:** Saudacao "Ola, {userName}" com nome em bold branco, texto explicativo em `#a1a1aa` (zinc-400)
4. **Botao CTA:** `display: inline-block`, gradiente `#2563eb → #3b82f6` (blue-600 → blue-500), border-radius 12px, padding 12px 32px, texto branco 14px semibold
5. **Aviso:** Texto em `#71717a` (zinc-500) informando expiracao de 1 hora
6. **Separador:** `border-top: 1px solid #27272a` (zinc-800)
7. **Rodape:** "NexusAI360 (c) {ano}" em `#52525b` (zinc-600), 11px, centralizado

### O que customizar por plataforma

- **Remetente:** Constante `FROM_EMAIL` — alterar nome e dominio (ex: `"SuaMarca <noreply@seudominio.com>"`)
- **Nome da plataforma:** Texto "Nexus Roteador Webhook" no header do template
- **Nome da empresa no rodape:** Texto "NexusAI360" no copyright
- **Cores do botao:** Gradiente `#2563eb → #3b82f6` — ajustar para a cor primaria da plataforma
- **Icone do header:** Atualmente um emoji (raio) — substituir por logo ou icone da marca
- **Cor de fundo:** `#09090b` — ajustar se a marca usar tema claro para emails
- **Subject dos emails:** Textos "Redefinicao de senha — Nexus Roteador Webhook" e "Confirme seu novo e-mail — Nexus Roteador Webhook"
- **Dominio de envio:** Configurar dominio verificado no Resend para deliverability
- **Novos tipos de email:** Adicionar novas funcoes seguindo o mesmo padrao (ex: convite de usuario, alerta de seguranca)

### Seguranca

- **Resend SDK:** Comunicacao via HTTPS com API do Resend, chave de API nunca exposta ao client
- **Erro propagado:** Se o envio falhar, a funcao lanca excecao — o chamador decide como tratar (em password-reset, o erro e logado e retorna mensagem generica)
- **Sem dados sensiveis no email:** Os templates nao incluem senha, token bruto (apenas URL completa com token), nem informacoes internas do sistema
- **Dominio verificado:** O `FROM_EMAIL` usa dominio `nexusai360.com` que deve estar verificado no Resend para evitar rejeicao por SPF/DKIM
