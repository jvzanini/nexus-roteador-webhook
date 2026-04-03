# Fase 1 — Sub-plano 1: Setup + Infra

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar o projeto Next.js com TypeScript, Prisma, Docker e CI/CD — base funcional para todos os sub-planos seguintes.

**Architecture:** Monolito Next.js 14+ com App Router. Prisma como ORM conectando a PostgreSQL 16. Redis 7 para filas BullMQ. Docker Swarm Stack com 4 containers (app, worker, db, redis). GitHub Actions para CI/CD.

**Tech Stack:** Next.js 14+, TypeScript, Prisma, PostgreSQL 16, Redis 7, BullMQ, Docker, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md`

---

## Estrutura de Arquivos

```
/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Redirect para /login
│   │   └── api/
│   │       └── health/
│   │           └── route.ts          # Health check endpoint
│   ├── lib/
│   │   ├── prisma.ts                 # Prisma client singleton
│   │   ├── redis.ts                  # Redis client singleton
│   │   ├── queue.ts                  # BullMQ queue definitions
│   │   └── encryption.ts            # AES-256-GCM encrypt/decrypt
│   └── worker/
│       └── index.ts                  # Worker entrypoint (worker.js)
├── prisma/
│   ├── schema.prisma                 # Schema completo
│   └── seed.ts                       # Seeding super admin
├── docker/
│   ├── Dockerfile                    # Multi-stage build
│   └── docker-compose.yml            # Swarm stack
├── .github/
│   └── workflows/
│       └── build.yml                 # CI/CD pipeline
├── .env.example                      # Template de variáveis
├── next.config.ts                    # Next.js config
├── tailwind.config.ts                # Tailwind config
├── tsconfig.json                     # TypeScript config
└── package.json
```

---

### Task 1: Inicializar projeto Next.js com TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `.env.example`

- [ ] **Step 1: Criar projeto Next.js**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

Quando perguntado, aceitar os defaults.

- [ ] **Step 2: Instalar dependências do projeto**

```bash
npm install prisma @prisma/client bullmq ioredis next-auth@beta @auth/prisma-adapter zod axios lucide-react framer-motion resend @react-email/components nanoid bcryptjs
npm install -D @types/bcryptjs
```

- [ ] **Step 3: Instalar shadcn/ui**

```bash
npx shadcn@latest init -d
```

- [ ] **Step 4: Criar .env.example**

```bash
cat > .env.example << 'ENVEOF'
# Database
DATABASE_URL=postgresql://nexus:changeme@localhost:5432/nexus

# Redis
REDIS_URL=redis://localhost:6379

# Auth
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=https://roteadorwebhook.nexusai360.com

# Encryption
ENCRYPTION_KEY=generate-with-openssl-rand-hex-32

# Email
RESEND_API_KEY=re_xxxxxxxxxxxx

# Super Admin (seeding)
ADMIN_EMAIL=admin@nexusai360.com
ADMIN_PASSWORD=changeme-min-12-chars

# Database password (used in docker-compose)
DB_PASSWORD=changeme
ENVEOF
```

- [ ] **Step 5: Atualizar .gitignore para incluir .env**

Verificar que `.env` e `.env.local` já estão no `.gitignore` (adicionados na config inicial).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: inicializa projeto Next.js com dependências"
```

---

### Task 2: Configurar Prisma com schema completo

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`

- [ ] **Step 1: Inicializar Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Escrever schema completo**

Substituir `prisma/schema.prisma` com:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(uuid()) @db.Uuid
  name          String
  email         String   @unique
  password      String
  isSuperAdmin  Boolean  @default(false) @map("is_super_admin")
  avatarUrl     String?  @map("avatar_url")
  theme         Theme    @default(dark)
  isActive      Boolean  @default(true) @map("is_active")
  invitedById   String?  @map("invited_by") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  invitedBy     User?    @relation("UserInvites", fields: [invitedById], references: [id])
  invitees      User[]   @relation("UserInvites")
  memberships   UserCompanyMembership[]
  notifications Notification[]
  auditLogs     AuditLog[]     @relation("AuditActor")

  @@map("users")
}

enum Theme {
  dark
  light
  system
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

enum CompanyRole {
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

enum ProcessingStatus {
  received
  queued
  processed
  no_routes
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

  inboundWebhook    InboundWebhook @relation(fields: [inboundWebhookId], references: [id], onDelete: Restrict)
  route             WebhookRoute   @relation(fields: [routeId], references: [id], onDelete: Restrict)
  company           Company        @relation(fields: [companyId], references: [id], onDelete: Restrict)
  attempts          DeliveryAttempt[]

  @@index([companyId, createdAt(sort: Desc)], name: "idx_delivery_company_created")
  @@index([routeId, createdAt(sort: Desc)], name: "idx_delivery_route_created")
  @@index([inboundWebhookId], name: "idx_delivery_inbound")
  @@map("route_deliveries")
}

enum DeliveryStatus {
  pending
  delivering
  delivered
  retrying
  failed
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

model GlobalSettings {
  id        String   @id @default(uuid()) @db.Uuid
  key       String   @unique
  value     Json     @db.JsonB
  updatedBy String   @map("updated_by") @db.Uuid
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("global_settings")
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

enum NotificationType {
  error
  warning
  info
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

enum ActorType {
  user
  system
}
```

- [ ] **Step 3: Criar Prisma client singleton**

Criar `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Gerar migration inicial**

```bash
npx prisma migrate dev --name init
```

Expected: Migration criada com sucesso em `prisma/migrations/`.

- [ ] **Step 5: Commit**

```bash
git add prisma/ src/lib/prisma.ts
git commit -m "feat: adiciona schema Prisma completo com migration inicial"
```

---

### Task 3: Configurar Redis e BullMQ

**Files:**
- Create: `src/lib/redis.ts`
- Create: `src/lib/queue.ts`

- [ ] **Step 1: Criar Redis client singleton**

Criar `src/lib/redis.ts`:

```typescript
import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
};

function createRedisClient(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not defined");
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
```

- [ ] **Step 2: Criar definições de filas BullMQ**

Criar `src/lib/queue.ts`:

```typescript
import { Queue } from "bullmq";
import { redis } from "./redis";

export const webhookDeliveryQueue = new Queue("webhook-delivery", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export const webhookDlqQueue = new Queue("webhook-dlq", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/redis.ts src/lib/queue.ts
git commit -m "feat: adiciona Redis client e filas BullMQ"
```

---

### Task 4: Módulo de criptografia AES-256-GCM

**Files:**
- Create: `src/lib/encryption.ts`
- Create: `src/lib/__tests__/encryption.test.ts`

- [ ] **Step 1: Escrever teste para encrypt/decrypt**

Criar `src/lib/__tests__/encryption.test.ts`:

```typescript
import { encrypt, decrypt } from "../encryption";

describe("encryption", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "a".repeat(64); // 32 bytes hex
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it("encrypts and decrypts a string correctly", () => {
    const plaintext = "my-secret-api-key-12345";
    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(":"); // iv:authTag:ciphertext

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    parts[2] = "tampered" + parts[2];
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
});
```

- [ ] **Step 2: Instalar Jest e configurar**

```bash
npm install -D jest @types/jest ts-jest
```

Criar `jest.config.ts`:

```typescript
import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default config;
```

Adicionar ao `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  }
}
```

- [ ] **Step 3: Rodar teste para verificar que falha**

```bash
npm test -- --testPathPattern=encryption
```

Expected: FAIL — `Cannot find module '../encryption'`

- [ ] **Step 4: Implementar módulo de criptografia**

Criar `src/lib/encryption.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivHex, authTagHex, encrypted] = ciphertext.split(":");

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export function mask(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars) return "****";
  return "****..." + value.slice(-visibleChars);
}
```

- [ ] **Step 5: Rodar teste para verificar que passa**

```bash
npm test -- --testPathPattern=encryption
```

Expected: PASS — 3 tests passing

- [ ] **Step 6: Commit**

```bash
git add src/lib/encryption.ts src/lib/__tests__/encryption.test.ts jest.config.ts
git commit -m "feat: módulo de criptografia AES-256-GCM com testes"
```

---

### Task 5: Health check endpoint

**Files:**
- Create: `src/app/api/health/route.ts`

- [ ] **Step 1: Criar endpoint de health check**

Criar `src/app/api/health/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function GET() {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};

  // PostgreSQL
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch {
    checks.database = { status: "error", latencyMs: Date.now() - dbStart };
  }

  // Redis
  const redisStart = Date.now();
  try {
    await redis.ping();
    checks.redis = { status: "ok", latencyMs: Date.now() - redisStart };
  } catch {
    checks.redis = { status: "error", latencyMs: Date.now() - redisStart };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === "ok");

  return NextResponse.json(
    { status: allHealthy ? "healthy" : "degraded", checks },
    { status: allHealthy ? 200 : 503 }
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "feat: endpoint /api/health com checks de PostgreSQL e Redis"
```

---

### Task 6: Dockerfile multi-stage e docker-compose

**Files:**
- Create: `docker/Dockerfile`
- Create: `docker-compose.yml` (raiz do projeto)
- Create: `src/worker/index.ts`

- [ ] **Step 1: Criar worker entrypoint básico**

Criar `src/worker/index.ts`:

```typescript
import { Worker } from "bullmq";
import { redis } from "../lib/redis";

console.log("[worker] Starting Nexus webhook worker...");

const deliveryWorker = new Worker(
  "webhook-delivery",
  async (job) => {
    console.log(`[worker] Processing job ${job.id}`, job.data);
    // Implementado no sub-plano 5 (Worker + Delivery)
  },
  { connection: redis, concurrency: 10 }
);

deliveryWorker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} completed`);
});

deliveryWorker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

process.on("SIGTERM", async () => {
  console.log("[worker] Shutting down...");
  await deliveryWorker.close();
  process.exit(0);
});
```

- [ ] **Step 2: Criar Dockerfile multi-stage**

Criar `docker/Dockerfile`:

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/worker ./worker
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

- [ ] **Step 3: Atualizar next.config.ts para standalone output**

Atualizar `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 4: Criar docker-compose.yml na raiz**

Criar `docker-compose.yml`:

```yaml
version: "3.8"

services:
  app:
    image: ghcr.io/jvzanini/nexus-roteador-webhook:latest
    command: ["node", "server.js"]
    environment:
      - DATABASE_URL=postgresql://nexus:${DB_PASSWORD}@db:5432/nexus
      - REDIS_URL=redis://redis:6379
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=https://roteadorwebhook.nexusai360.com
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - RESEND_API_KEY=${RESEND_API_KEY}
      - ADMIN_EMAIL=${ADMIN_EMAIL}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    networks:
      - traefik-public
      - internal
    deploy:
      labels:
        - traefik.enable=true
        - traefik.http.routers.nexus.rule=Host(`roteadorwebhook.nexusai360.com`)
        - traefik.http.routers.nexus.entrypoints=websecure
        - traefik.http.services.nexus.loadbalancer.server.port=3000

  worker:
    image: ghcr.io/jvzanini/nexus-roteador-webhook:latest
    command: ["node", "worker/index.js"]
    environment:
      - DATABASE_URL=postgresql://nexus:${DB_PASSWORD}@db:5432/nexus
      - REDIS_URL=redis://redis:6379
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - RESEND_API_KEY=${RESEND_API_KEY}
    networks:
      - internal

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=nexus
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=nexus
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - internal

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - internal

volumes:
  postgres_data:
  redis_data:

networks:
  traefik-public:
    external: true
  internal:
    driver: overlay
```

- [ ] **Step 5: Commit**

```bash
git add docker/ docker-compose.yml src/worker/index.ts next.config.ts
git commit -m "feat: Dockerfile multi-stage e docker-compose para Swarm stack"
```

---

### Task 7: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/build.yml`

- [ ] **Step 1: Criar workflow de build e push**

Criar `.github/workflows/build.yml`:

```yaml
name: Build and Push

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha
            type=raw,value=latest

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "feat: GitHub Actions CI/CD para build e push da imagem Docker"
```

---

### Task 8: Seed do Super Admin

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (adicionar script prisma seed)

- [ ] **Step 1: Criar script de seed**

Criar `prisma/seed.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("[seed] ADMIN_EMAIL e ADMIN_PASSWORD não definidos. Pulando seed.");
    return;
  }

  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD deve ter no mínimo 12 caracteres");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] Super admin ${email} já existe. Pulando.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name: "Super Admin",
      email,
      password: hashedPassword,
      isSuperAdmin: true,
    },
  });

  console.log(`[seed] Super admin criado: ${user.email} (${user.id})`);
}

main()
  .catch((e) => {
    console.error("[seed] Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Configurar prisma seed no package.json**

Adicionar ao `package.json`:

```json
{
  "prisma": {
    "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

Instalar ts-node:

```bash
npm install -D ts-node
```

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat: seed do super admin via variáveis de ambiente"
```

---

## Self-Review Checklist

- [x] **Spec coverage Fase 1:** Setup ✅, Prisma schema completo ✅, Docker ✅, CI/CD ✅, Health check ✅, Seed ✅, Encryption ✅, Redis/BullMQ ✅
- [x] **Placeholder scan:** Nenhum TBD/TODO. Worker tem implementação mínima (será expandido no sub-plano 5)
- [x] **Type consistency:** PrismaClient types consistentes em todos os arquivos. Nomes de campos alinhados com schema
- [x] **Campos nullable:** raw_body e raw_payload nullable no schema ✅
- [x] **is_super_admin boolean:** Correto, não enum ✅
- [x] **AuditLog com actor_id:** Correto, não user_id ✅
