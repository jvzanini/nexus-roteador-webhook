import { prisma } from "./prisma";
import type { NotificationType } from "@/generated/prisma/client";

interface CreateNotificationInput {
  userId?: string;
  companyId?: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string;
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId ?? null,
      companyId: input.companyId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
      channelsSent: ["platform"],
    },
  });
}

// Cria notificação para todos os super admins quando uma delivery falha permanentemente
export async function notifyDeliveryFailed(params: {
  companyId: string;
  routeName: string;
  routeDeliveryId: string;
  errorMessage: string;
  attemptCount: number;
}): Promise<void> {
  // Buscar super admins
  const superAdmins = await prisma.user.findMany({
    where: { isSuperAdmin: true },
    select: { id: true },
  });

  if (superAdmins.length === 0) return;

  // Criar uma notificação por super admin
  await prisma.notification.createMany({
    data: superAdmins.map((admin) => ({
      userId: admin.id,
      companyId: params.companyId,
      type: "error" as NotificationType,
      title: `Entrega falhou: ${params.routeName}`,
      message: `Falha após ${params.attemptCount} tentativa${params.attemptCount > 1 ? "s" : ""}. ${params.errorMessage}`,
      link: `/companies/${params.companyId}`,
      channelsSent: ["platform"],
    })),
  });
}
