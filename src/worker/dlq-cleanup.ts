import { webhookDlqQueue } from "../lib/queue";

/**
 * Remove jobs da DLQ com mais de 7 dias.
 * BullMQ não tem TTL nativo em jobs — fazemos cleanup manual.
 */

const DLQ_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hora

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export async function cleanupDlqJobs(): Promise<number> {
  const cutoffTimestamp = Date.now() - DLQ_RETENTION_MS;
  let removed = 0;

  // Buscar jobs completed e failed
  const completedJobs = await webhookDlqQueue.getCompleted(0, 500);
  const failedJobs = await webhookDlqQueue.getFailed(0, 500);
  const waitingJobs = await webhookDlqQueue.getWaiting(0, 500);

  const allJobs = [...completedJobs, ...failedJobs, ...waitingJobs];

  for (const job of allJobs) {
    if (job.timestamp < cutoffTimestamp) {
      try {
        await job.remove();
        removed++;
      } catch {
        // Job pode ter sido removido por outro processo
      }
    }
  }

  if (removed > 0) {
    console.log(`[dlq-cleanup] Removed ${removed} expired DLQ jobs`);
  }

  return removed;
}

export function startDlqCleanupScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  console.log(`[dlq-cleanup] Starting scheduler (interval: ${intervalMs / 1000}s)`);

  intervalHandle = setInterval(async () => {
    try {
      await cleanupDlqJobs();
    } catch (err) {
      console.error("[dlq-cleanup] Cleanup failed:", (err as Error).message);
    }
  }, intervalMs);
}

export function stopDlqCleanupScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[dlq-cleanup] Scheduler stopped");
  }
}
