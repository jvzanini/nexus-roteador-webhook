"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export interface NotificationItem {
  id: string;
  type: "error" | "warning" | "info";
  title: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: Date;
  companyName: string | null;
}

export async function getNotifications(cursor?: string): Promise<{
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}> {
  const user = await getCurrentUser();
  if (!user) return { items: [], nextCursor: null, unreadCount: 0 };

  const pageSize = 20;

  const cursorClause = cursor
    ? { cursor: { id: cursor }, skip: 1 }
    : undefined;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      ...(cursorClause ?? {}),
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        link: true,
        isRead: true,
        createdAt: true,
        company: { select: { name: true } },
      },
    }),
    prisma.notification.count({
      where: { userId: user.id, isRead: false },
    }),
  ]);

  const items: NotificationItem[] = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt,
    companyName: n.company?.name ?? null,
  }));

  const lastItem = items[items.length - 1];
  const nextCursor = items.length === pageSize ? (lastItem?.id ?? null) : null;

  return { items, nextCursor, unreadCount };
}

export async function getUnreadCount(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;

  return prisma.notification.count({
    where: { userId: user.id, isRead: false },
  });
}

export async function markAsRead(notificationId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { isRead: true },
  });
}

export async function markAllAsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });
}
