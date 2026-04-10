import { prisma } from "@/lib/prisma";
import { MAX_ROWS_PER_EXPORT } from "../types";
import type { AccessScope, RoutesFilters } from "../types";

function toIso(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "");
}

function formatEvents(events: unknown): string {
  if (Array.isArray(events)) {
    return events.filter((e) => typeof e === "string").join("; ");
  }
  return "";
}

export const ROUTES_HEADERS = [
  "Empresa",
  "Nome da rota",
  "URL destino",
  "Eventos inscritos",
  "Status",
  "Timeout (ms)",
  "Data de criação",
];

function buildWhere(
  filters: RoutesFilters,
  scope: AccessScope
): Record<string, any> {
  const where: Record<string, any> = {};
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
  return where;
}

export async function* generateRoutes(
  filters: RoutesFilters,
  scope: AccessScope
): AsyncIterable<unknown[]> {
  yield ROUTES_HEADERS;

  const where = buildWhere(filters, scope);
  const routes = await prisma.webhookRoute.findMany({
    where,
    take: MAX_ROWS_PER_EXPORT,
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      url: true,
      events: true,
      isActive: true,
      timeoutMs: true,
      createdAt: true,
      company: { select: { name: true } },
    },
  });

  for (const r of routes) {
    yield [
      r.company.name,
      r.name,
      r.url,
      formatEvents(r.events),
      r.isActive ? "ativa" : "inativa",
      r.timeoutMs,
      toIso(r.createdAt),
    ];
  }
}

export async function countRoutes(
  filters: RoutesFilters,
  scope: AccessScope
): Promise<number> {
  return prisma.webhookRoute.count({ where: buildWhere(filters, scope) });
}
