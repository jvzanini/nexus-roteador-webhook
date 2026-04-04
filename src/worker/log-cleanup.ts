import { prisma } from "../lib/prisma";
import { logAudit } from "../lib/audit";

const DEFAULT_FULL_RETENTION_DAYS = 90;
const DEFAULT_SUMMARY_RETENTION_DAYS = 180;

async function getRetentionSetting(
  key: string,
  defaultValue: number
): Promise<number> {
  const setting = await prisma.globalSettings.findUnique({
    where: { key },
  });

  if (!setting) return defaultValue;

  const value = setting.value as number;
  return typeof value === "number" && value > 0 ? value : defaultValue;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function runLogCleanup(): Promise<void> {
  console.log("[log-cleanup] Iniciando cleanup de logs...");

  const fullRetentionDays = await getRetentionSetting(
    "log_full_retention_days",
    DEFAULT_FULL_RETENTION_DAYS
  );

  const summaryRetentionDays = await getRetentionSetting(
    "log_summary_retention_days",
    DEFAULT_SUMMARY_RETENTION_DAYS
  );

  const fullRetentionDate = daysAgo(fullRetentionDays);
  const summaryRetentionDate = daysAgo(summaryRetentionDays);

  console.log(
    `[log-cleanup] Full retention: ${fullRetentionDays} dias (antes de ${fullRetentionDate.toISOString()})`
  );
  console.log(
    `[log-cleanup] Summary retention: ${summaryRetentionDays} dias (antes de ${summaryRetentionDate.toISOString()})`
  );

  // Passo 1: Limpar raw_body e raw_payload de InboundWebhooks antigos
  const pruneResult = await prisma.inboundWebhook.updateMany({
    where: {
      receivedAt: { lt: fullRetentionDate },
      OR: [
        { rawBody: { not: null } },
        { rawPayload: { not: { equals: null } } },
      ],
    },
    data: {
      rawBody: null,
      rawPayload: null,
    },
  });
  console.log(
    `[log-cleanup] Passo 1: ${pruneResult.count} payloads removidos`
  );

  // Passo 3: Deletar DeliveryAttempts mais antigos que full retention
  const deletedAttempts = await prisma.deliveryAttempt.deleteMany({
    where: {
      createdAt: { lt: fullRetentionDate },
    },
  });
  console.log(
    `[log-cleanup] Passo 3: ${deletedAttempts.count} delivery attempts deletados`
  );

  // Passo 4: Deletar RouteDeliveries mais antigos que summary retention
  const deletedDeliveries = await prisma.routeDelivery.deleteMany({
    where: {
      createdAt: { lt: summaryRetentionDate },
    },
  });
  console.log(
    `[log-cleanup] Passo 4: ${deletedDeliveries.count} route deliveries deletados`
  );

  // Passo 2 (executado por ultimo): Deletar InboundWebhooks antigos
  const deletedWebhooks = await prisma.inboundWebhook.deleteMany({
    where: {
      receivedAt: { lt: summaryRetentionDate },
    },
  });
  console.log(
    `[log-cleanup] Passo 2: ${deletedWebhooks.count} inbound webhooks deletados`
  );

  // Registrar no AuditLog
  await logAudit({
    actorType: "system",
    actorLabel: "log-cleanup",
    action: "cleanup.logs",
    resourceType: "InboundWebhook",
    details: {
      prunedPayloads: pruneResult.count,
      deletedAttempts: deletedAttempts.count,
      deletedDeliveries: deletedDeliveries.count,
      deletedWebhooks: deletedWebhooks.count,
      fullRetentionDays,
      summaryRetentionDays,
    },
  });

  console.log("[log-cleanup] Cleanup de logs concluido.");
}
