import { prisma } from "@/lib/prisma";
import { MAX_ROWS_PER_EXPORT } from "../types";
import type { AccessScope, LogsFilters } from "../types";

const BATCH_SIZE = 500;

function toIso(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "");
}

export const LOGS_HEADERS = [
  "Data de recebimento",
  "Empresa",
  "Rota",
  "URL destino",
  "Tipo de evento",
  "Status da entrega",
  "Total de tentativas",
  "Duração última tentativa (ms)",
  "HTTP final",
  "Entregue em",
  "Última tentativa em",
  "Erro da última tentativa",
];

function buildWhere(
  filters: LogsFilters,
  scope: AccessScope
): Record<string, any> {
  const inboundFilter: Record<string, any> = {
    receivedAt: {
      gte: filters.dateFrom,
      lte: filters.dateTo,
    },
  };
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    inboundFilter.eventType = { in: filters.eventTypes };
  }

  const where: Record<string, any> = { inboundWebhook: inboundFilter };

  if (scope !== undefined) {
    where.companyId = { in: scope };
  }
  if (filters.companyId) {
    if (scope !== undefined && !scope.includes(filters.companyId)) {
      where.companyId = { in: [] };
    } else {
      where.companyId = filters.companyId;
    }
  }
  if (filters.routeId) {
    where.routeId = filters.routeId;
  }
  if (filters.statuses && filters.statuses.length > 0) {
    where.status = { in: filters.statuses };
  }

  return where;
}

export async function* generateLogs(
  filters: LogsFilters,
  scope: AccessScope
): AsyncIterable<unknown[]> {
  yield LOGS_HEADERS;

  const where = buildWhere(filters, scope);
  let cursor: string | undefined;
  let emitted = 0;

  while (emitted < MAX_ROWS_PER_EXPORT) {
    const batch = await prisma.routeDelivery.findMany({
      where,
      // Ordenação por id desc (estável) para evitar leaks de paginação
      // quando múltiplos registros têm mesmo createdAt.
      orderBy: { id: "desc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        totalAttempts: true,
        deliveredAt: true,
        lastAttemptAt: true,
        finalHttpStatus: true,
        inboundWebhook: {
          select: { receivedAt: true, eventType: true },
        },
        company: { select: { name: true } },
        route: { select: { name: true, url: true } },
        attempts: {
          select: { durationMs: true, errorMessage: true },
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });

    if (batch.length === 0) break;

    for (const d of batch) {
      const last = d.attempts[0];
      yield [
        toIso(d.inboundWebhook.receivedAt),
        d.company.name,
        d.route.name,
        d.route.url,
        d.inboundWebhook.eventType,
        d.status,
        d.totalAttempts,
        last?.durationMs ?? "",
        d.finalHttpStatus ?? "",
        toIso(d.deliveredAt),
        toIso(d.lastAttemptAt),
        last?.errorMessage ?? "",
      ];
      emitted++;
      if (emitted >= MAX_ROWS_PER_EXPORT) return;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH_SIZE) break;
  }
}

export async function countLogs(
  filters: LogsFilters,
  scope: AccessScope
): Promise<number> {
  return prisma.routeDelivery.count({ where: buildWhere(filters, scope) });
}
