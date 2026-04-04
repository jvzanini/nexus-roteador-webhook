import { createDeliveryWorker } from "./delivery";
import {
  startOrphanRecoveryScheduler,
  stopOrphanRecoveryScheduler,
} from "./orphan-recovery";
import {
  startDlqCleanupScheduler,
  stopDlqCleanupScheduler,
} from "./dlq-cleanup";

console.log("[worker] Starting Nexus webhook worker...");
console.log(`[worker] Node.js ${process.version}`);
console.log(`[worker] PID: ${process.pid}`);

// ─── Inicializar Workers ────────────────────────────────────────

const deliveryWorker = createDeliveryWorker();

// ─── Inicializar Orphan Recovery ────────────────────────────────

const orphanRecoveryIntervalMs = process.env.ORPHAN_RECOVERY_INTERVAL_MS
  ? parseInt(process.env.ORPHAN_RECOVERY_INTERVAL_MS, 10)
  : 5 * 60 * 1000; // 5 min default

startOrphanRecoveryScheduler({
  intervalMs: orphanRecoveryIntervalMs,
});

// ─── Inicializar DLQ Cleanup ────────────────────────────────────

startDlqCleanupScheduler();

console.log("[worker] All workers initialized");

// ─── Graceful Shutdown ──────────────────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[worker] Received ${signal}. Starting graceful shutdown...`);

  // Timeout de segurança: força exit após 30s
  const forceExitTimeout = setTimeout(() => {
    console.error("[worker] Graceful shutdown timeout exceeded. Forcing exit.");
    process.exit(1);
  }, 30_000);
  forceExitTimeout.unref();

  try {
    // 1. Parar de aceitar novos jobs
    console.log("[worker] Closing delivery worker...");
    await deliveryWorker.close();

    // 2. Parar orphan-recovery
    console.log("[worker] Stopping orphan-recovery scheduler...");
    stopOrphanRecoveryScheduler();

    // 3. Parar DLQ cleanup
    console.log("[worker] Stopping DLQ cleanup scheduler...");
    stopDlqCleanupScheduler();

    console.log("[worker] Graceful shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("[worker] Error during shutdown:", (err as Error).message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ─── Uncaught Errors ────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("[worker] Uncaught exception:", err);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("[worker] Unhandled rejection:", reason);
  // Não shutdown — apenas log. BullMQ gerencia jobs individuais.
});
