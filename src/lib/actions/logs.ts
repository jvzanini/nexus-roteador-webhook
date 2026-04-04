"use server";

import { prisma } from "@/lib/prisma";
import type { DeliveryStatus } from "@/generated/prisma";
import { z } from "zod";

// --- Schemas de validação ---

const DeliveryStatusValues = [
  "pending",
  "delivering",
  "delivered",
  "retrying",
  "failed",
] as const;

const LogFiltersSchema = z.object({
  companyId: z.string().uuid(),
  statuses: z
    .array(z.enum(DeliveryStatusValues))
    .optional(),
  eventTypes: z.array(z.string()).optional(),
  routeId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  cursor: z.string().uuid().optional(),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export type LogFilters = z.infer<typeof LogFiltersSchema>;

// --- Tipos de resposta ---

export interface LogEntry {
  id: string;
  receivedAt: Date;
  eventType: string;
  processingStatus: string;
  deliveries: {
    id: string;
    routeId: string;
    routeName: string;
    status: DeliveryStatus;
    totalAttempts: number;
    durationMs: number | null;
    deliveredAt: Date | null;
    lastAttemptAt: Date | null;
  }[];
}

export interface LogDetailEntry {
  id: string;
  receivedAt: Date;
  eventType: string;
  rawBody: string | null;
  rawPayload: unknown;
  deliveries: {
    id: string;
    routeId: string;
    routeName: string;
    routeUrl: string;
    status: DeliveryStatus;
    totalAttempts: number;
    deliveredAt: Date | null;
    finalHttpStatus: number | null;
    attempts: {
      id: string;
      attemptNumber: number;
      startedAt: Date;
      finishedAt: Date;
      durationMs: number;
      httpStatus: number | null;
      responseBody: string | null;
      errorMessage: string | null;
    }[];
  }[];
}

export interface LogsPage {
  entries: LogEntry[];
  nextCursor: string | null;
  totalCount: number;
}

// --- Actions ---

export async function getWebhookLogs(filters: LogFilters): Promise<LogsPage> {
  const parsed = LogFiltersSchema.parse(filters);

  // Monta WHERE clause dinamicamente
  const where: Record<string, unknown> = {
    companyId: parsed.companyId,
  };

  if (parsed.eventTypes && parsed.eventTypes.length > 0) {
    where.eventType = { in: parsed.eventTypes };
  }

  if (parsed.dateFrom || parsed.dateTo) {
    where.receivedAt = {
      ...(parsed.dateFrom ? { gte: parsed.dateFrom } : {}),
      ...(parsed.dateTo ? { lte: parsed.dateTo } : {}),
    };
  }

  // Filtro por status exige subquery via deliveries
  if (parsed.statuses && parsed.statuses.length > 0) {
    where.deliveries = {
      some: {
        status: { in: parsed.statuses },
      },
    };
  }

  if (parsed.routeId) {
    where.deliveries = {
      ...((where.deliveries as Record<string, unknown>) || {}),
      some: {
        ...((
          (where.deliveries as Record<string, unknown>)?.some as Record<
            string,
            unknown
          >
        ) || {}),
        routeId: parsed.routeId,
      },
    };
  }

  // Cursor-based pagination
  const cursorClause = parsed.cursor
    ? { cursor: { id: parsed.cursor }, skip: 1 }
    : {};

  const [entries, totalCount] = await Promise.all([
    prisma.inboundWebhook.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: parsed.pageSize,
      ...cursorClause,
      select: {
        id: true,
        receivedAt: true,
        eventType: true,
        processingStatus: true,
        deliveries: {
          select: {
            id: true,
            routeId: true,
            status: true,
            totalAttempts: true,
            deliveredAt: true,
            lastAttemptAt: true,
            route: {
              select: { name: true },
            },
            attempts: {
              select: { durationMs: true },
              orderBy: { attemptNumber: "desc" as const },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.inboundWebhook.count({ where }),
  ]);

  const mapped: LogEntry[] = entries.map((e) => ({
    id: e.id,
    receivedAt: e.receivedAt,
    eventType: e.eventType,
    processingStatus: e.processingStatus,
    deliveries: e.deliveries.map((d) => ({
      id: d.id,
      routeId: d.routeId,
      routeName: d.route.name,
      status: d.status,
      totalAttempts: d.totalAttempts,
      durationMs: d.attempts[0]?.durationMs ?? null,
      deliveredAt: d.deliveredAt,
      lastAttemptAt: d.lastAttemptAt,
    })),
  }));

  const lastEntry = mapped[mapped.length - 1];
  const nextCursor =
    mapped.length === parsed.pageSize ? (lastEntry?.id ?? null) : null;

  return { entries: mapped, nextCursor, totalCount };
}

export async function getWebhookLogDetail(
  companyId: string,
  inboundWebhookId: string
): Promise<LogDetailEntry | null> {
  const entry = await prisma.inboundWebhook.findFirst({
    where: {
      id: inboundWebhookId,
      companyId, // Tenant scoping obrigatório
    },
    select: {
      id: true,
      receivedAt: true,
      eventType: true,
      rawBody: true,
      rawPayload: true,
      deliveries: {
        select: {
          id: true,
          routeId: true,
          status: true,
          totalAttempts: true,
          deliveredAt: true,
          finalHttpStatus: true,
          route: {
            select: { name: true, url: true },
          },
          attempts: {
            select: {
              id: true,
              attemptNumber: true,
              startedAt: true,
              finishedAt: true,
              durationMs: true,
              httpStatus: true,
              responseBody: true,
              errorMessage: true,
            },
            orderBy: { attemptNumber: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!entry) return null;

  return {
    id: entry.id,
    receivedAt: entry.receivedAt,
    eventType: entry.eventType,
    rawBody: entry.rawBody,
    rawPayload: entry.rawPayload,
    deliveries: entry.deliveries.map((d) => ({
      id: d.id,
      routeId: d.routeId,
      routeName: d.route.name,
      routeUrl: d.route.url,
      status: d.status,
      totalAttempts: d.totalAttempts,
      deliveredAt: d.deliveredAt,
      finalHttpStatus: d.finalHttpStatus,
      attempts: d.attempts,
    })),
  };
}

export async function getAvailableEventTypes(
  companyId: string
): Promise<string[]> {
  const result = await prisma.inboundWebhook.findMany({
    where: { companyId },
    select: { eventType: true },
    distinct: ["eventType"],
    orderBy: { eventType: "asc" },
  });

  return result.map((r) => r.eventType);
}

export async function getAvailableRoutes(
  companyId: string
): Promise<{ id: string; name: string }[]> {
  return prisma.webhookRoute.findMany({
    where: { companyId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
