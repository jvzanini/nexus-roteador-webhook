import { Worker, Job } from "bullmq";
import axios, { AxiosError } from "axios";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { computeOutboundSignature } from "../lib/outbound-signature";
import { isRetriableStatus, isRetriableError, getNextRetryDelay } from "../lib/retry";
import { getRetryConfig } from "../lib/global-settings";
import { decrypt } from "../lib/encryption";
import { validateUrl } from "../lib/webhook/ssrf";
import { webhookDeliveryQueue, webhookDlqQueue } from "../lib/queue";
import { notifyDeliveryFailed } from "../lib/notifications";
import { publishRealtimeEvent } from "../lib/realtime";

// ─── Constantes ─────────────────────────────────────────────────

const MAX_RESPONSE_BODY_LENGTH = 4096; // 4KB
const WORKER_CONCURRENCY = 10;

// ─── Tipos ──────────────────────────────────────────────────────

export interface DeliveryJobData {
  routeDeliveryId: string;
}

interface DeliveryHeadersInput {
  deliveryId: string;
  attemptNumber: number;
  eventType: string;
  timestamp: string;
  signature: string | null;
  customHeaders: Record<string, string> | null;
}

type DeliveryClassification = "delivered" | "retriable" | "failed";

// ─── Helpers exportados (testáveis) ─────────────────────────────

/**
 * Serializa o evento normalizado como JSON.
 * Usa JSON.stringify canônico (sem sorting, consistente por natureza do V8).
 */
export function buildDeliveryBody(normalizedEvent: unknown): string {
  return JSON.stringify(normalizedEvent);
}

/**
 * Monta headers da entrega com proteção contra override de X-Nexus headers.
 */
export function buildDeliveryHeaders(input: DeliveryHeadersInput): Record<string, string> {
  const headers: Record<string, string> = {};

  // Custom headers primeiro (para que os X-Nexus possam sobrescrever)
  if (input.customHeaders) {
    for (const [key, value] of Object.entries(input.customHeaders)) {
      // Bloqueia override de headers reservados
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.startsWith("x-nexus-") ||
        lowerKey === "content-type"
      ) {
        continue;
      }
      headers[key] = value;
    }
  }

  // Headers obrigatórios (sempre sobrescrevem)
  headers["Content-Type"] = "application/json";
  headers["X-Nexus-Delivery-Id"] = input.deliveryId;
  headers["X-Nexus-Attempt"] = String(input.attemptNumber);
  headers["X-Nexus-Event-Type"] = input.eventType;
  headers["X-Nexus-Timestamp"] = input.timestamp;

  if (input.signature) {
    headers["X-Nexus-Signature-256"] = input.signature;
  }

  return headers;
}

/**
 * Trunca response body para no máximo 4KB.
 */
export function truncateResponseBody(body: string | null | undefined): string | null {
  if (body === null || body === undefined) return null;
  if (body.length <= MAX_RESPONSE_BODY_LENGTH) return body;
  return body.substring(0, MAX_RESPONSE_BODY_LENGTH) + " [truncated]";
}

/**
 * Classifica o resultado de uma tentativa de entrega.
 */
export function classifyDeliveryResult(
  httpStatus: number | null,
  error: Error | null
): DeliveryClassification {
  // Sucesso: 2xx
  if (httpStatus !== null && httpStatus >= 200 && httpStatus < 300) {
    return "delivered";
  }

  // Status retriable
  if (httpStatus !== null && isRetriableStatus(httpStatus)) {
    return "retriable";
  }

  // Erro de rede/timeout (sem HTTP response)
  if (error !== null && isRetriableError(error)) {
    return "retriable";
  }

  // Tudo o resto: non-retriable (4xx, redirects, erros desconhecidos)
  return "failed";
}

// ─── Processador do Job ─────────────────────────────────────────

async function processDeliveryJob(job: Job<DeliveryJobData>): Promise<void> {
  const { routeDeliveryId } = job.data;

  // 1. Buscar RouteDelivery com relações
  const routeDelivery = await prisma.routeDelivery.findUnique({
    where: { id: routeDeliveryId },
    include: {
      route: true,
      inboundWebhook: true,
    },
  });

  if (!routeDelivery) {
    console.error(`[delivery] RouteDelivery ${routeDeliveryId} not found. Skipping.`);
    return;
  }

  // Não reprocessar entregas já finalizadas
  if (routeDelivery.status === "delivered" || routeDelivery.status === "failed") {
    console.log(`[delivery] RouteDelivery ${routeDeliveryId} already ${routeDelivery.status}. Skipping.`);
    return;
  }

  const { route, inboundWebhook } = routeDelivery;

  // Verificar se a rota está ativa
  if (!route.isActive) {
    console.log(`[delivery] Route ${route.id} is inactive. Marking as failed.`);
    await prisma.routeDelivery.update({
      where: { id: routeDeliveryId },
      data: { status: "failed" },
    });
    return;
  }

  // 2. Atualizar status para delivering
  const attemptNumber = routeDelivery.totalAttempts + 1;
  const now = new Date();

  await prisma.routeDelivery.update({
    where: { id: routeDeliveryId },
    data: {
      status: "delivering",
      firstAttemptAt: routeDelivery.firstAttemptAt ?? now,
      lastAttemptAt: now,
    },
  });

  // 3. Validar URL (proteção SSRF)
  try {
    validateUrl(route.url);
  } catch (ssrfError) {
    console.error(`[delivery] SSRF validation failed for route ${route.id}: ${(ssrfError as Error).message}`);
    await finalizeDelivery(routeDeliveryId, attemptNumber, now, {
      httpStatus: null,
      responseBody: null,
      errorMessage: `SSRF validation failed: ${(ssrfError as Error).message}`,
      classification: "failed",
      companyId: routeDelivery.companyId,
      routeName: route.name,
    });
    return;
  }

  // 4. Montar body: evento normalizado individual
  const normalizedEvent = inboundWebhook.rawPayload;
  const body = buildDeliveryBody(normalizedEvent);

  // 5. Calcular assinatura outbound (se secret_key configurada)
  let signature: string | null = null;
  if (route.secretKey) {
    try {
      const decryptedSecret = decrypt(route.secretKey);
      signature = computeOutboundSignature(body, decryptedSecret);
    } catch (err) {
      console.error(`[delivery] Failed to decrypt secret_key for route ${route.id}:`, err);
      // Continua sem assinatura — não bloqueia entrega
    }
  }

  // 6. Montar headers
  const timestamp = new Date().toISOString();
  const customHeaders = route.headers as Record<string, string> | null;
  const headers = buildDeliveryHeaders({
    deliveryId: routeDelivery.id,
    attemptNumber,
    eventType: inboundWebhook.eventType,
    timestamp,
    signature,
    customHeaders,
  });

  // 7. Enviar via axios
  const startedAt = new Date();
  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  let deliveryError: Error | null = null;

  try {
    const response = await axios.post(route.url, body, {
      headers,
      timeout: route.timeoutMs,
      maxRedirects: 0,
      validateStatus: () => true, // Aceita qualquer status para classificar manualmente
      maxContentLength: 1024 * 1024, // 1MB max response
      responseType: "text",
    });

    httpStatus = response.status;
    responseBody = typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);
  } catch (err) {
    deliveryError = err as Error;

    if (err instanceof AxiosError) {
      httpStatus = err.response?.status ?? null;
      responseBody = err.response?.data
        ? typeof err.response.data === "string"
          ? err.response.data
          : JSON.stringify(err.response.data)
        : null;
      errorMessage = err.message;
    } else {
      errorMessage = (err as Error).message;
    }
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  // 8. Classificar resultado
  const classification = classifyDeliveryResult(httpStatus, deliveryError);

  // 9. Criar DeliveryAttempt
  await prisma.deliveryAttempt.create({
    data: {
      routeDeliveryId,
      attemptNumber,
      startedAt,
      finishedAt,
      durationMs,
      httpStatus,
      responseBody: truncateResponseBody(responseBody),
      errorMessage,
    },
  });

  // 10. Atualizar RouteDelivery conforme resultado
  await finalizeDelivery(routeDeliveryId, attemptNumber, now, {
    httpStatus,
    responseBody,
    errorMessage,
    classification,
    companyId: routeDelivery.companyId,
    routeName: route.name,
  });
}

// ─── Finalização da Entrega ─────────────────────────────────────

interface DeliveryResult {
  httpStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  classification: DeliveryClassification;
  // Dados para notificação
  companyId: string;
  routeName: string;
}

async function finalizeDelivery(
  routeDeliveryId: string,
  attemptNumber: number,
  attemptStartedAt: Date,
  result: DeliveryResult
): Promise<void> {
  const { httpStatus, errorMessage, classification } = result;

  if (classification === "delivered") {
    // Sucesso
    await prisma.routeDelivery.update({
      where: { id: routeDeliveryId },
      data: {
        status: "delivered",
        deliveredAt: new Date(),
        finalHttpStatus: httpStatus,
        totalAttempts: attemptNumber,
        nextRetryAt: null,
      },
    });

    console.log(`[delivery] ${routeDeliveryId} delivered (HTTP ${httpStatus}) on attempt ${attemptNumber}`);
    await publishRealtimeEvent({ type: "delivery:completed", companyId: result.companyId });
    await checkAndUpdateInboundStatus(routeDeliveryId);
    return;
  }

  if (classification === "retriable") {
    // Verificar se pode fazer retry
    const retryConfig = await getRetryConfig();
    const retryDecision = getNextRetryDelay(attemptNumber, retryConfig);

    if (retryDecision) {
      // Agendar retry
      const nextRetryAt = new Date(Date.now() + retryDecision.delayMs);

      await prisma.routeDelivery.update({
        where: { id: routeDeliveryId },
        data: {
          status: "retrying",
          finalHttpStatus: httpStatus,
          totalAttempts: attemptNumber,
          nextRetryAt,
        },
      });

      // Enfileirar job com delay
      await webhookDeliveryQueue.add(
        "delivery",
        { routeDeliveryId },
        {
          delay: retryDecision.delayMs,
          jobId: `retry-${routeDeliveryId}-${attemptNumber + 1}`,
        }
      );

      console.log(
        `[delivery] ${routeDeliveryId} retry ${attemptNumber}/${retryConfig.maxRetries} scheduled in ${retryDecision.delayMs}ms` +
        (httpStatus ? ` (HTTP ${httpStatus})` : ` (${errorMessage})`)
      );
      return;
    }

    // Esgotou retries — tratar como failed
    console.log(`[delivery] ${routeDeliveryId} exhausted retries (${attemptNumber} attempts)`);
  }

  // Failed (non-retriable ou retries esgotados)
  await prisma.routeDelivery.update({
    where: { id: routeDeliveryId },
    data: {
      status: "failed",
      finalHttpStatus: httpStatus,
      totalAttempts: attemptNumber,
      nextRetryAt: null,
    },
  });

  console.log(
    `[delivery] ${routeDeliveryId} FAILED on attempt ${attemptNumber}` +
    (httpStatus ? ` (HTTP ${httpStatus})` : ` (${errorMessage})`)
  );

  // Mover para DLQ
  await webhookDlqQueue.add(
    "dlq",
    {
      routeDeliveryId,
      reason: errorMessage ?? `HTTP ${httpStatus}`,
      failedAt: new Date().toISOString(),
      totalAttempts: attemptNumber,
    },
    {
      removeOnComplete: false,
      removeOnFail: false,
    }
  );

  // Notificação de falha permanente
  try {
    await notifyDeliveryFailed({
      companyId: result.companyId,
      routeName: result.routeName,
      routeDeliveryId,
      errorMessage: errorMessage ?? `HTTP ${httpStatus}`,
      attemptCount: attemptNumber,
    });
  } catch (notifyErr) {
    console.error("[delivery] Falha ao criar notificacao:", (notifyErr as Error).message);
  }

  await publishRealtimeEvent({ type: "delivery:failed", companyId: result.companyId });

  await checkAndUpdateInboundStatus(routeDeliveryId);
}

/**
 * Verifica se todas as RouteDeliveries de um InboundWebhook atingiram estado terminal.
 * Se sim, atualiza InboundWebhook.processing_status para 'processed'.
 */
async function checkAndUpdateInboundStatus(routeDeliveryId: string): Promise<void> {
  try {
    const delivery = await prisma.routeDelivery.findUnique({
      where: { id: routeDeliveryId },
      select: { inboundWebhookId: true },
    });

    if (!delivery) return;

    const pendingCount = await prisma.routeDelivery.count({
      where: {
        inboundWebhookId: delivery.inboundWebhookId,
        status: { notIn: ["delivered", "failed"] },
      },
    });

    if (pendingCount === 0) {
      await prisma.inboundWebhook.update({
        where: { id: delivery.inboundWebhookId },
        data: { processingStatus: "processed" },
      });
    }
  } catch (err) {
    // Best-effort — não falha o job por isso
    console.error("[delivery] Failed to update inbound status:", err);
  }
}

// ─── Criação do Worker BullMQ ───────────────────────────────────

export function createDeliveryWorker(): Worker<DeliveryJobData> {
  const worker = new Worker<DeliveryJobData>(
    "webhook-delivery",
    processDeliveryJob,
    {
      connection: redis,
      concurrency: WORKER_CONCURRENCY,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[delivery] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[delivery] Job ${job?.id} failed unexpectedly:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[delivery] Worker error:", err.message);
  });

  return worker;
}
