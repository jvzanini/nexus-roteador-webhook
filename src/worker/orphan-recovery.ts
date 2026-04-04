import { prisma } from "../lib/prisma";
import { webhookDeliveryQueue } from "../lib/queue";
import { logAudit } from "../lib/audit";

/**
 * Job de recuperação de entregas órfãs.
 *
 * Roda periodicamente e busca RouteDeliveries que ficaram "presas":
 * - status pending/delivering há mais de 2min (criado/atualizado mas sem job na fila)
 * - status retrying com next_retry_at <= NOW() há mais de 2min (retry agendado mas job perdido)
 *
 * Para cada órfã, verifica se existe job correspondente no BullMQ.
 * Se não existe, reenfileira.
 *
 * Este job é o mecanismo compensatório que garante consistência eventual
 * entre PostgreSQL e Redis (at-least-once delivery).
 */

const ORPHAN_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutos
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

export interface OrphanRecoveryOptions {
  intervalMs?: number;
  thresholdMs?: number;
}

export async function recoverOrphanDeliveries(
  thresholdMs: number = ORPHAN_THRESHOLD_MS
): Promise<{ recovered: number; checked: number }> {
  const thresholdDate = new Date(Date.now() - thresholdMs);

  // Buscar RouteDeliveries potencialmente órfãs
  const orphanCandidates = await prisma.routeDelivery.findMany({
    where: {
      OR: [
        // pending ou delivering há mais de threshold
        {
          status: { in: ["pending", "delivering"] },
          createdAt: { lt: thresholdDate },
        },
        // retrying com next_retry_at expirado há mais de threshold
        {
          status: "retrying",
          nextRetryAt: { lte: new Date(Date.now() - thresholdMs) },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      totalAttempts: true,
    },
    take: 100, // Limitar batch para não sobrecarregar
  });

  if (orphanCandidates.length === 0) {
    return { recovered: 0, checked: 0 };
  }

  console.log(`[orphan-recovery] Found ${orphanCandidates.length} orphan candidates`);

  let recovered = 0;

  for (const delivery of orphanCandidates) {
    try {
      // Verificar se já existe job na fila para esta entrega
      const existingJob = await webhookDeliveryQueue.getJob(
        `delivery-${delivery.id}`
      );

      // Também verificar jobs de retry
      const retryJobId = `retry-${delivery.id}-${delivery.totalAttempts + 1}`;
      const existingRetryJob = await webhookDeliveryQueue.getJob(retryJobId);

      if (existingJob || existingRetryJob) {
        // Job existe na fila — não é órfão
        continue;
      }

      // Reenfileirar
      await webhookDeliveryQueue.add(
        "delivery",
        { routeDeliveryId: delivery.id },
        {
          jobId: `orphan-recovery-${delivery.id}-${Date.now()}`,
        }
      );

      recovered++;
      console.log(
        `[orphan-recovery] Re-enqueued delivery ${delivery.id} (was ${delivery.status}, attempt ${delivery.totalAttempts})`
      );
    } catch (err) {
      console.error(
        `[orphan-recovery] Failed to recover delivery ${delivery.id}:`,
        (err as Error).message
      );
    }
  }

  // Registrar no AuditLog se houve recuperacoes
  if (recovered > 0) {
    logAudit({
      actorType: "system",
      actorLabel: "orphan-recovery",
      action: "delivery.orphan_recovery",
      resourceType: "RouteDelivery",
      details: {
        recoveredCount: recovered,
        checkedCount: orphanCandidates.length,
      },
    });
  }

  return { recovered, checked: orphanCandidates.length };
}

// ─── Scheduler ──────────────────────────────────────────────────

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startOrphanRecoveryScheduler(
  options: OrphanRecoveryOptions = {}
): void {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const thresholdMs = options.thresholdMs ?? ORPHAN_THRESHOLD_MS;

  console.log(
    `[orphan-recovery] Starting scheduler (interval: ${intervalMs / 1000}s, threshold: ${thresholdMs / 1000}s)`
  );

  // Rodar imediatamente na primeira vez
  recoverOrphanDeliveries(thresholdMs)
    .then(({ recovered, checked }) => {
      if (checked > 0) {
        console.log(`[orphan-recovery] Initial run: checked ${checked}, recovered ${recovered}`);
      }
    })
    .catch((err) => {
      console.error("[orphan-recovery] Initial run failed:", (err as Error).message);
    });

  // Agendar execuções periódicas
  intervalHandle = setInterval(async () => {
    try {
      const { recovered, checked } = await recoverOrphanDeliveries(thresholdMs);
      if (checked > 0) {
        console.log(`[orphan-recovery] Checked ${checked}, recovered ${recovered}`);
      }
    } catch (err) {
      console.error("[orphan-recovery] Scheduled run failed:", (err as Error).message);
    }
  }, intervalMs);
}

export function stopOrphanRecoveryScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[orphan-recovery] Scheduler stopped");
  }
}
