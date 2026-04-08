# Pattern: Sistema de Filas com BullMQ

## Resumo

Processamento assincrono de tarefas usando BullMQ com Redis como broker. O pattern implementa um pipeline producer-consumer com retry automatico, Dead Letter Queue (DLQ) para falhas permanentes, e um mecanismo de orphan recovery que garante consistencia eventual entre PostgreSQL e Redis (at-least-once delivery).

## Quando Usar

- Tarefas que nao podem bloquear o request HTTP (entregas de webhook, envio de emails, processamento de dados pesados)
- Operacoes que precisam de retry automatico com backoff configuravel
- Cenarios onde falhas transientes sao esperadas (endpoints instáveis, timeouts de rede)
- Qualquer operacao que precisa de auditoria completa de tentativas e resultados

## Arquitetura

```
┌─────────────────┐     ┌───────────┐     ┌──────────────────┐
│  Producer        │     │  Redis     │     │  Worker          │
│  (Server Action  │────>│  Queue     │────>│  (Container      │
│   ou API Route)  │     │  (BullMQ)  │     │   separado)      │
└─────────────────┘     └───────────┘     └──────┬───────────┘
                                                  │
                                          ┌───────┴───────┐
                                          │               │
                                     Sucesso          Falha
                                     (delivered)      (retriable?)
                                          │               │
                                          │         ┌─────┴─────┐
                                          │         │           │
                                          │      Retry       DLQ
                                          │    (re-enqueue   (webhook-dlq)
                                          │     com delay)
                                          │         │
                                          ▼         ▼
                                    ┌──────────────────┐
                                    │  PostgreSQL       │
                                    │  (estado final)   │
                                    └──────────────────┘
```

### Componentes

1. **Producer** -- enfileira jobs na queue do Redis apos persistir o estado no banco
2. **Redis Queue** -- armazena jobs pendentes, gerencia delays de retry
3. **Worker** -- processa jobs com concorrencia configuravel, roda em container Docker separado
4. **DLQ (Dead Letter Queue)** -- recebe entregas que falharam permanentemente para analise posterior
5. **Orphan Recovery** -- scheduler periodico que detecta jobs "perdidos" e reenfileira

## Implementacao no Nexus

### Conexao Redis

**Arquivo:** `src/lib/redis.ts`

Singleton global com `lazyConnect` para build time (quando `REDIS_URL` nao existe) e `maxRetriesPerRequest: null` (exigido pelo BullMQ para blocking commands).

```typescript
// src/lib/redis.ts
import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
};

function createRedisClient(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) {
    return new IORedis({ lazyConnect: true });
  }
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
```

### Definicao das Queues

**Arquivo:** `src/lib/queue.ts`

Duas queues separadas: a principal para entregas e a DLQ para falhas permanentes.

```typescript
// src/lib/queue.ts
import { Queue } from "bullmq";
import { redis } from "./redis";

export const webhookDeliveryQueue = new Queue("webhook-delivery", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 1000,  // Manter ultimos 1000 jobs completos
    removeOnFail: 5000,      // Manter ultimos 5000 jobs falhados
  },
});

export const webhookDlqQueue = new Queue("webhook-dlq", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: false,  // Nunca remover automaticamente
    removeOnFail: false,
  },
});
```

**Decisoes de design:**
- `removeOnComplete: 1000` na queue principal evita acumulo infinito no Redis
- DLQ com `removeOnComplete: false` garante que falhas permanentes ficam disponiveis para analise/reenvio manual
- Retries sao gerenciados pelo worker (nao pelo BullMQ `attempts`), permitindo logica customizada com backoff configuravel via GlobalSettings

### Worker de Entrega

**Arquivo:** `src/worker/delivery.ts`

O worker processa cada job seguindo este fluxo:

1. Busca RouteDelivery com relacoes (route, inboundWebhook)
2. Valida estado (ja finalizado? rota inativa?)
3. Valida URL de destino (protecao SSRF)
4. Monta body (evento normalizado serializado como JSON)
5. Calcula assinatura outbound HMAC-SHA256 (se secret_key configurada)
6. Monta headers (custom headers + headers X-Nexus reservados)
7. Envia via HTTP POST (axios)
8. Classifica resultado: `delivered`, `retriable`, ou `failed`
9. Persiste DeliveryAttempt no banco
10. Finaliza: atualiza status, agenda retry ou move para DLQ

```typescript
// src/worker/delivery.ts (estrutura simplificada)
export interface DeliveryJobData {
  routeDeliveryId: string;
}

export function createDeliveryWorker(): Worker<DeliveryJobData> {
  const worker = new Worker<DeliveryJobData>(
    "webhook-delivery",
    processDeliveryJob,
    {
      connection: redis,
      concurrency: WORKER_CONCURRENCY, // 10
    }
  );

  worker.on("completed", (job) => { /* log */ });
  worker.on("failed", (job, err) => { /* log */ });
  worker.on("error", (err) => { /* log */ });

  return worker;
}
```

**Classificacao de resultados:**

```typescript
// delivered: HTTP 2xx
// retriable: HTTP 408, 409, 425, 429, 500, 502, 503, 504 + erros de rede
// failed: tudo o resto (4xx, redirects, erros desconhecidos)
export function classifyDeliveryResult(
  httpStatus: number | null,
  error: Error | null
): "delivered" | "retriable" | "failed" { ... }
```

**Logica de retry:**

Quando o resultado eh `retriable`, o worker consulta `getRetryConfig()` (GlobalSettings) para decidir se agenda retry. Se `currentAttempt > maxRetries`, trata como `failed`.

```typescript
// Retry com delay configuravel
const retryConfig = await getRetryConfig();
const retryDecision = getNextRetryDelay(attemptNumber, retryConfig);

if (retryDecision) {
  await webhookDeliveryQueue.add(
    "delivery",
    { routeDeliveryId },
    {
      delay: retryDecision.delayMs,
      jobId: `retry-${routeDeliveryId}-${attemptNumber + 1}`,
    }
  );
}
```

**Movendo para DLQ:**

Entregas que falharam permanentemente sao movidas para a DLQ com metadados completos:

```typescript
await webhookDlqQueue.add("dlq", {
  routeDeliveryId,
  reason: errorMessage ?? `HTTP ${httpStatus}`,
  failedAt: new Date().toISOString(),
  totalAttempts: attemptNumber,
});
```

### Politica de Retry

**Arquivo:** `src/lib/retry.ts`

```typescript
// Status codes retriaveis
export const RETRIABLE_STATUS_CODES = new Set([
  408, 409, 425, 429, 500, 502, 503, 504,
]);

// Erros de rede retriaveis
const RETRIABLE_ERROR_CODES = new Set([
  "ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND",
  "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH",
]);

export interface RetryConfig {
  maxRetries: number;           // Default: 3
  intervalsSeconds: number[];   // Default: [10, 30, 90]
  strategy: "exponential" | "fixed";
  jitterEnabled: boolean;       // Default: true (±20%)
}
```

A configuracao de retry eh lida das GlobalSettings (banco de dados), permitindo ajuste em tempo real pelo admin sem redeploy.

### Entrypoint do Worker

**Arquivo:** `src/worker/index.ts`

O worker inicializa todos os processadores e schedulers:

```typescript
// src/worker/index.ts
const deliveryWorker = createDeliveryWorker();
startOrphanRecoveryScheduler({ intervalMs: 5 * 60 * 1000 });
startDlqCleanupScheduler();

// Cleanup jobs agendados via BullMQ repeat (cron)
const cleanupQueue = new Queue("cleanup", { connection: redis });
// "0 0 * * *" -- todo dia a meia-noite
```

Implementa graceful shutdown com timeout de 30s:

```typescript
async function gracefulShutdown(signal: string): Promise<void> {
  await deliveryWorker.close();
  stopOrphanRecoveryScheduler();
  stopDlqCleanupScheduler();
  await cleanupWorker.close();
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

### Orphan Recovery

**Arquivo:** `src/worker/orphan-recovery.ts`

Mecanismo compensatorio que garante at-least-once delivery. Roda a cada 5 minutos e busca RouteDeliveries "orfas":

- `status: pending/delivering` criadas ha mais de 2 minutos (job pode ter sido perdido no Redis)
- `status: retrying` com `next_retry_at` expirado ha mais de 2 minutos (retry agendado mas job perdido)

Para cada candidata, verifica se existe job correspondente no BullMQ. Se nao existe, reenfileira.

```typescript
export async function recoverOrphanDeliveries(thresholdMs: number): Promise<{
  recovered: number;
  checked: number;
}> {
  const orphanCandidates = await prisma.routeDelivery.findMany({
    where: {
      OR: [
        { status: { in: ["pending", "delivering"] }, createdAt: { lt: thresholdDate } },
        { status: "retrying", nextRetryAt: { lte: new Date(Date.now() - thresholdMs) } },
      ],
    },
    take: 100,
  });

  for (const delivery of orphanCandidates) {
    const existingJob = await webhookDeliveryQueue.getJob(`delivery-${delivery.id}`);
    if (!existingJob) {
      await webhookDeliveryQueue.add("delivery", { routeDeliveryId: delivery.id });
      recovered++;
    }
  }
}
```

### Container Docker

No `docker-compose.yml`, o worker roda como container separado usando a mesma imagem mas com entrypoint diferente:

```yaml
worker:
  image: ghcr.io/jvzanini/nexus-roteador-webhook:latest
  command: ["node", "worker/index.js"]
  environment:
    - DATABASE_URL=postgresql://nexus:${DB_PASSWORD}@db:5432/nexus
    - REDIS_URL=redis://redis:6379
```

Isso permite escalar workers independentemente da aplicacao web.

## Como Adaptar para Outro Projeto

### 1. Configurar Redis e Queues

Copie `src/lib/redis.ts` e `src/lib/queue.ts`. Renomeie as queues:

```typescript
// src/lib/queue.ts
export const emailQueue = new Queue("email-send", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 500,
    removeOnFail: 2000,
  },
});

export const emailDlqQueue = new Queue("email-dlq", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});
```

### 2. Definir o Tipo de Dados do Job

```typescript
export interface EmailJobData {
  emailId: string;
  to: string;
  subject: string;
  templateId: string;
}
```

### 3. Implementar o Processador

```typescript
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { emailId, to, subject, templateId } = job.data;

  // 1. Buscar dados completos do banco
  // 2. Renderizar template
  // 3. Enviar via provider (Resend, SES, etc.)
  // 4. Classificar resultado (sucesso, retriable, falha)
  // 5. Persistir tentativa no banco
  // 6. Se retriable: re-enqueue com delay
  // 7. Se falha permanente: mover para DLQ
}
```

### 4. Configurar Politica de Retry

Adapte `src/lib/retry.ts` para seu caso de uso:

```typescript
// Para emails: retry mais agressivo
const EMAIL_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  intervalsSeconds: [5, 15, 60, 300, 900], // 5s, 15s, 1min, 5min, 15min
  strategy: "exponential",
  jitterEnabled: true,
};
```

### 5. Criar o Worker

```typescript
// src/worker/email-worker.ts
export function createEmailWorker(): Worker<EmailJobData> {
  return new Worker<EmailJobData>(
    "email-send",
    processEmailJob,
    { connection: redis, concurrency: 5 }
  );
}
```

### 6. Configurar Container Docker

```yaml
# docker-compose.yml
email-worker:
  image: sua-imagem:latest
  command: ["node", "worker/email-index.js"]
  environment:
    - DATABASE_URL=...
    - REDIS_URL=redis://redis:6379
```

### 7. (Opcional) Implementar Orphan Recovery

Se precisar de garantia at-least-once, implemente um scheduler similar ao `src/worker/orphan-recovery.ts` que busca registros no banco com status pendente ha mais de N minutos e verifica se o job existe na fila.

## Arquivos de Referencia

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/redis.ts` | Singleton Redis (IORedis) com lazyConnect para build time |
| `src/lib/queue.ts` | Definicao das queues BullMQ (webhook-delivery + webhook-dlq) |
| `src/lib/retry.ts` | Logica de retry: status retriaveis, backoff exponencial, jitter |
| `src/lib/global-settings.ts` | Leitura de config de retry do banco (defaults + override) |
| `src/worker/delivery.ts` | Worker de entrega: processamento, classificacao, retry, DLQ |
| `src/worker/index.ts` | Entrypoint do worker: inicializacao + graceful shutdown |
| `src/worker/orphan-recovery.ts` | Recovery de entregas orfas (consistencia eventual) |
| `src/worker/dlq-cleanup.ts` | Limpeza periodica da DLQ |
| `src/worker/log-cleanup.ts` | Limpeza periodica de logs antigos |
| `src/worker/notification-cleanup.ts` | Limpeza periodica de notificacoes lidas |
| `src/lib/webhook/ssrf.ts` | Validacao SSRF de URLs de destino |
| `docker-compose.yml` | Configuracao do container worker (mesma imagem, entrypoint diferente) |
