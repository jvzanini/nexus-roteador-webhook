# Database — Referência Completa do Prisma Schema

Referência completa do schema Prisma usado no Nexus Roteador Webhook. Todos os modelos, enums, indexes e configurações estão documentados aqui exatamente como aparecem no `prisma/schema.prisma`.

---

## 1. Configuração

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

**Pontos importantes:**

- **Prisma v7** gera o client em `src/generated/prisma/`. O import correto no código é `@/generated/prisma/client` (NUNCA `@prisma/client`).
- O adapter usado é `@prisma/adapter-pg` (PrismaPg), configurado no singleton (ver seção 8).
- O `datasource` usa apenas `provider = "postgresql"` — a URL vem de `DATABASE_URL` no ambiente.

---

## 2. Enums Base

Enums compartilhados por múltiplos módulos.

```prisma
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

- `PlatformRole` — papel global do usuário na plataforma (hierarquia: super_admin > admin > manager > viewer).
- `Theme` — preferência visual do usuário (dark é o padrão).

---

## 3. Modelo User

Modelo central de autenticação e perfil. Campos marcados com o subsistema que os utiliza.

```prisma
model User {
  id            String       @id @default(uuid()) @db.Uuid
  name          String
  email         String       @unique
  password      String
  platformRole  PlatformRole @default(viewer) @map("platform_role")       // Auth
  isSuperAdmin  Boolean      @default(false) @map("is_super_admin")       // Auth
  avatarUrl     String?      @map("avatar_url")                           // Profile
  theme         Theme        @default(dark)                                // Profile
  isActive      Boolean      @default(true) @map("is_active")
  invitedById   String?      @map("invited_by") @db.Uuid                  // Users
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
```

**Subsistemas por campo:**

| Campo | Subsistema |
|---|---|
| `avatarUrl`, `theme` | Profile |
| `invitedById`, `invitees` | Users (convites) |
| `isSuperAdmin`, `platformRole` | Auth (controle de acesso) |
| `memberships` | Multi-tenant |
| `notifications` | Notifications |
| `auditLogs` | Audit Log |
| `passwordResetTokens` | Password Reset |
| `emailChangeTokens` | Profile (troca de email) |

---

## 4. Modelo PasswordResetToken

Token de redefinição de senha com expiração e controle de uso.

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

---

## 5. Modelo EmailChangeToken

Token para confirmação de troca de email com verificação.

```prisma
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
```

---

## 6. Modelos por Módulo

### 6.1 Multi-tenant — Company + UserCompanyMembership + CompanyRole

```prisma
enum CompanyRole {
  super_admin
  company_admin
  manager
  viewer
}

model Company {
  id         String   @id @default(uuid()) @db.Uuid
  name       String
  slug       String   @unique
  webhookKey String   @unique @map("webhook_key")
  logoUrl    String?  @map("logo_url")
  isActive   Boolean  @default(true) @map("is_active")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  credential    CompanyCredential?
  memberships   UserCompanyMembership[]
  routes        WebhookRoute[]
  inboundWebhooks InboundWebhook[]
  routeDeliveries RouteDelivery[]
  notifications   Notification[]
  auditLogs       AuditLog[]

  @@map("companies")
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
```

**Nota:** `CompanyRole` e `PlatformRole` são hierarquias independentes (duas camadas). O `PlatformRole` define acesso global, o `CompanyRole` define acesso dentro de uma empresa específica.

---

### 6.2 Notifications

```prisma
enum NotificationType {
  error
  warning
  info
}

model Notification {
  id           String           @id @default(uuid()) @db.Uuid
  userId       String?          @map("user_id") @db.Uuid
  companyId    String?          @map("company_id") @db.Uuid
  type         NotificationType
  title        String
  message      String
  link         String
  channelsSent Json             @map("channels_sent") @db.JsonB
  isRead       Boolean          @default(false) @map("is_read")
  createdAt    DateTime         @default(now()) @map("created_at")

  user         User?            @relation(fields: [userId], references: [id], onDelete: Restrict)
  company      Company?         @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@index([userId, isRead, createdAt(sort: Desc)], name: "idx_notification_user_read")
  @@map("notifications")
}
```

---

### 6.3 Audit Log

```prisma
enum ActorType {
  user
  system
}

model AuditLog {
  id           String    @id @default(uuid()) @db.Uuid
  actorType    ActorType @map("actor_type")
  actorId      String?   @map("actor_id") @db.Uuid
  actorLabel   String    @map("actor_label")
  companyId    String?   @map("company_id") @db.Uuid
  action       String
  resourceType String    @map("resource_type")
  resourceId   String?   @map("resource_id") @db.Uuid
  details      Json      @db.JsonB
  ipAddress    String?   @map("ip_address")
  userAgent    String?   @map("user_agent")
  createdAt    DateTime  @default(now()) @map("created_at")

  actor        User?     @relation("AuditActor", fields: [actorId], references: [id], onDelete: Restrict)
  company      Company?  @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@index([companyId, createdAt(sort: Desc)], name: "idx_audit_company")
  @@map("audit_logs")
}
```

---

### 6.4 Settings

```prisma
model GlobalSettings {
  id        String   @id @default(uuid()) @db.Uuid
  key       String   @unique
  value     Json     @db.JsonB
  updatedBy String   @map("updated_by") @db.Uuid
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("global_settings")
}
```

**Nota:** `GlobalSettings` usa chave-valor (key/value JSON) para configurações dinâmicas. Apenas super admin e admin podem alterar.

---

### 6.5 Webhook Domain (modelos específicos do Nexus)

Estes modelos representam o domínio de negócio específico do Nexus Roteador Webhook. Cada plataforma que use o blueprint terá seus próprios modelos de domínio.

```prisma
enum ProcessingStatus {
  received
  queued
  processed
  no_routes
}

enum DeliveryStatus {
  pending
  delivering
  delivered
  retrying
  failed
}

model CompanyCredential {
  id              String   @id @default(uuid()) @db.Uuid
  companyId       String   @unique @map("company_id") @db.Uuid
  metaAppId       String   @map("meta_app_id")
  metaAppSecret   String   @map("meta_app_secret")
  verifyToken     String   @map("verify_token")
  phoneNumberId   String?  @map("phone_number_id")
  wabaId          String?  @map("waba_id")
  accessToken     String   @map("access_token")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  company         Company  @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@map("company_credentials")
}

model WebhookRoute {
  id         String   @id @default(uuid()) @db.Uuid
  companyId  String   @map("company_id") @db.Uuid
  name       String
  icon       String
  url        String
  secretKey  String?  @map("secret_key")
  events     Json     @db.JsonB
  isActive   Boolean  @default(true) @map("is_active")
  headers    Json?    @db.JsonB
  timeoutMs  Int      @default(30000) @map("timeout_ms")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  company    Company  @relation(fields: [companyId], references: [id], onDelete: Restrict)
  deliveries RouteDelivery[]

  @@map("webhook_routes")
}

model InboundWebhook {
  id               String           @id @default(uuid()) @db.Uuid
  companyId        String           @map("company_id") @db.Uuid
  receivedAt       DateTime         @map("received_at")
  rawBody          String?          @map("raw_body")
  rawPayload       Json?            @map("raw_payload") @db.JsonB
  eventType        String           @map("event_type")
  dedupeKey        String           @map("dedupe_key")
  processingStatus ProcessingStatus @default(received) @map("processing_status")
  createdAt        DateTime         @default(now()) @map("created_at")

  company          Company          @relation(fields: [companyId], references: [id], onDelete: Restrict)
  deliveries       RouteDelivery[]

  @@index([companyId, createdAt(sort: Desc)], name: "idx_inbound_company_created")
  @@index([dedupeKey, createdAt(sort: Desc)], name: "idx_inbound_dedupe")
  @@index([eventType, createdAt(sort: Desc)], name: "idx_inbound_event_type")
  @@map("inbound_webhooks")
}

model RouteDelivery {
  id                String         @id @default(uuid()) @db.Uuid
  inboundWebhookId  String         @map("inbound_webhook_id") @db.Uuid
  routeId           String         @map("route_id") @db.Uuid
  companyId         String         @map("company_id") @db.Uuid
  status            DeliveryStatus @default(pending)
  firstAttemptAt    DateTime?      @map("first_attempt_at")
  lastAttemptAt     DateTime?      @map("last_attempt_at")
  deliveredAt       DateTime?      @map("delivered_at")
  finalHttpStatus   Int?           @map("final_http_status")
  totalAttempts     Int            @default(0) @map("total_attempts")
  nextRetryAt       DateTime?      @map("next_retry_at")
  createdAt         DateTime       @default(now()) @map("created_at")
  originDeliveryId  String?        @map("origin_delivery_id") @db.Uuid

  originDelivery    RouteDelivery?  @relation("DeliveryResend", fields: [originDeliveryId], references: [id])
  resends           RouteDelivery[] @relation("DeliveryResend")

  inboundWebhook    InboundWebhook @relation(fields: [inboundWebhookId], references: [id], onDelete: Restrict)
  route             WebhookRoute   @relation(fields: [routeId], references: [id], onDelete: Restrict)
  company           Company        @relation(fields: [companyId], references: [id], onDelete: Restrict)
  attempts          DeliveryAttempt[]

  @@index([companyId, createdAt(sort: Desc)], name: "idx_delivery_company_created")
  @@index([routeId, createdAt(sort: Desc)], name: "idx_delivery_route_created")
  @@index([inboundWebhookId], name: "idx_delivery_inbound")
  @@map("route_deliveries")
}

model DeliveryAttempt {
  id              String        @id @default(uuid()) @db.Uuid
  routeDeliveryId String        @map("route_delivery_id") @db.Uuid
  attemptNumber   Int           @map("attempt_number")
  startedAt       DateTime      @map("started_at")
  finishedAt      DateTime      @map("finished_at")
  durationMs      Int           @map("duration_ms")
  httpStatus      Int?          @map("http_status")
  responseBody    String?       @map("response_body")
  errorMessage    String?       @map("error_message")
  createdAt       DateTime      @default(now()) @map("created_at")

  routeDelivery   RouteDelivery @relation(fields: [routeDeliveryId], references: [id], onDelete: Restrict)

  @@index([routeDeliveryId, attemptNumber], name: "idx_attempt_delivery")
  @@map("delivery_attempts")
}
```

---

## 7. Indexes e Performance

Referência dos indexes compostos usados no Nexus como boas práticas para qualquer projeto.

### Padrão: `[scopeId, createdAt(sort: Desc)]`

Usado para queries paginadas por cursor dentro de um escopo (empresa, usuário, rota). O `sort: Desc` otimiza queries que buscam os registros mais recentes primeiro.

| Index | Modelo | Campos |
|---|---|---|
| `idx_inbound_company_created` | InboundWebhook | `[companyId, createdAt DESC]` |
| `idx_inbound_dedupe` | InboundWebhook | `[dedupeKey, createdAt DESC]` |
| `idx_inbound_event_type` | InboundWebhook | `[eventType, createdAt DESC]` |
| `idx_delivery_company_created` | RouteDelivery | `[companyId, createdAt DESC]` |
| `idx_delivery_route_created` | RouteDelivery | `[routeId, createdAt DESC]` |
| `idx_delivery_inbound` | RouteDelivery | `[inboundWebhookId]` |
| `idx_attempt_delivery` | DeliveryAttempt | `[routeDeliveryId, attemptNumber]` |
| `idx_notification_user_read` | Notification | `[userId, isRead, createdAt DESC]` |
| `idx_audit_company` | AuditLog | `[companyId, createdAt DESC]` |
| `idx_reset_token` | PasswordResetToken | `[token]` |
| `idx_reset_user` | PasswordResetToken | `[userId, createdAt DESC]` |
| `idx_email_change_token` | EmailChangeToken | `[token]` |
| `idx_email_change_user` | EmailChangeToken | `[userId, createdAt DESC]` |

### Boas práticas observadas:

1. **Cursor-based pagination** — sempre indexar `[scopeId, createdAt DESC]` para queries com `cursor` e `take`.
2. **Token lookup** — indexes em `[token]` para busca O(1) em tokens de reset/verificação.
3. **Filtro + ordenação** — combinar campo de filtro com campo de ordenação no mesmo index (ex: `[userId, isRead, createdAt DESC]`).
4. **onDelete: Restrict** — padrão para relações de negócio (impede exclusão acidental de dados referenciados).
5. **onDelete: Cascade** — apenas para tokens efêmeros (PasswordResetToken, EmailChangeToken) que devem ser removidos junto com o usuário.
6. **@@map()** — todos os modelos mapeiam para snake_case no PostgreSQL.
7. **@map()** — todos os campos camelCase mapeiam para snake_case nas colunas.

---

## 8. Singleton Prisma

Padrão para instanciar o PrismaClient uma única vez, evitando múltiplas conexões em desenvolvimento (hot reload do Next.js).

```typescript
// src/lib/prisma.ts
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg(process.env.DATABASE_URL!);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**Pontos-chave:**

- `PrismaPg` adapter — conecta via `@prisma/adapter-pg` em vez do driver nativo do Prisma.
- `globalForPrisma` — armazena a instância no `globalThis` para sobreviver ao hot reload em dev.
- `log: ["query"]` — ativo apenas em desenvolvimento para debug de queries.
- Em produção, uma nova instância é criada por cold start (comportamento esperado em serverless/containers).
