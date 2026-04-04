import { prisma } from "../lib/prisma";
import { logAudit } from "../lib/audit";

const READ_RETENTION_DAYS = 30;
const UNREAD_RETENTION_DAYS = 90;

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function runNotificationCleanup(): Promise<void> {
  console.log("[notification-cleanup] Iniciando cleanup de notificacoes...");

  const readCutoff = daysAgo(READ_RETENTION_DAYS);
  const unreadCutoff = daysAgo(UNREAD_RETENTION_DAYS);

  // Deletar notificacoes lidas ha mais de 30 dias
  const deletedRead = await prisma.notification.deleteMany({
    where: {
      isRead: true,
      createdAt: { lt: readCutoff },
    },
  });
  console.log(
    `[notification-cleanup] ${deletedRead.count} notificacoes lidas deletadas`
  );

  // Deletar notificacoes nao-lidas ha mais de 90 dias
  const deletedUnread = await prisma.notification.deleteMany({
    where: {
      isRead: false,
      createdAt: { lt: unreadCutoff },
    },
  });
  console.log(
    `[notification-cleanup] ${deletedUnread.count} notificacoes nao-lidas deletadas`
  );

  // Registrar no AuditLog
  await logAudit({
    actorType: "system",
    actorLabel: "notification-cleanup",
    action: "cleanup.notifications",
    resourceType: "Notification",
    details: {
      deletedRead: deletedRead.count,
      deletedUnread: deletedUnread.count,
      readRetentionDays: READ_RETENTION_DAYS,
      unreadRetentionDays: UNREAD_RETENTION_DAYS,
    },
  });

  console.log("[notification-cleanup] Cleanup de notificacoes concluido.");
}
