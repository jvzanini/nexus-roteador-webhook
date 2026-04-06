"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleCompanyIds, buildTenantFilter, assertCompanyAccess } from "@/lib/tenant";
import type { DeliveryStatus } from "@/generated/prisma/client";

// --- Tipos ---

export interface DashboardStats {
  webhooksReceived: number;
  deliveriesCompleted: number;
  deliveriesFailed: number;
  deliverySuccessRate: number | null;
  comparison: {
    webhooksReceived: number | null;
    deliveriesCompleted: number | null;
    deliveriesFailed: number | null;
    deliverySuccessRate: number | null;
  };
}

export interface ChartPoint {
  bucketStart: Date;
  total: number;
  delivered: number;
  failed: number;
}

export interface TopError {
  errorMessage: string;
  count: number;
  lastOccurrence: Date;
  routeName: string;
  routeId: string;
  companyId: string;
  companyName: string;
}

export interface RecentDeliveryItem {
  id: string;
  createdAt: Date;
  eventType: string;
  companyName: string;
  companyId: string;
  routeName: string;
  routeId: string;
  status: DeliveryStatus;
  durationMs: number | null;
  totalAttempts: number;
  isResend: boolean;
}

export interface DashboardData {
  stats: DashboardStats;
  chart: ChartPoint[];
  topErrors: TopError[];
  recentDeliveries: {
    items: RecentDeliveryItem[];
    totalPages: number;
    currentPage: number;
  };
  companies: { id: string; name: string }[];
}

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

type Period = "today" | "7d" | "30d";

// --- Helpers de período ---

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  switch (period) {
    case "today":
      return { start: todayStart, end: now };
    case "7d": {
      const start = new Date(todayStart);
      start.setUTCDate(start.getUTCDate() - 7);
      return { start, end: todayStart };
    }
    case "30d": {
      const start = new Date(todayStart);
      start.setUTCDate(start.getUTCDate() - 30);
      return { start, end: todayStart };
    }
  }
}

function getPreviousPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  switch (period) {
    case "today": {
      // Ontem até o mesmo horário de agora
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
      const yesterdaySameTime = new Date(yesterdayStart);
      yesterdaySameTime.setUTCHours(now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
      return { start: yesterdayStart, end: yesterdaySameTime };
    }
    case "7d": {
      const currentStart = new Date(todayStart);
      currentStart.setUTCDate(currentStart.getUTCDate() - 7);
      const prevStart = new Date(currentStart);
      prevStart.setUTCDate(prevStart.getUTCDate() - 7);
      return { start: prevStart, end: currentStart };
    }
    case "30d": {
      const currentStart = new Date(todayStart);
      currentStart.setUTCDate(currentStart.getUTCDate() - 30);
      const prevStart = new Date(currentStart);
      prevStart.setUTCDate(prevStart.getUTCDate() - 30);
      return { start: prevStart, end: currentStart };
    }
  }
}

function computeComparison(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10; // 1 casa decimal
}

// --- Helpers de dados ---

async function getStats(
  period: Period,
  tenantFilter: Record<string, unknown>,
  companyId?: string,
): Promise<DashboardStats> {
  const range = getPeriodRange(period);
  const prevRange = getPreviousPeriodRange(period);

  const companyFilter = companyId ? { companyId } : tenantFilter;

  const dateFilter = { createdAt: { gte: range.start, lt: range.end } };
  const prevDateFilter = { createdAt: { gte: prevRange.start, lt: prevRange.end } };

  const [
    webhooksReceived, prevWebhooksReceived,
    deliveriesCompleted, deliveriesFailed,
    prevDeliveriesCompleted, prevDeliveriesFailed,
  ] = await Promise.all([
    prisma.inboundWebhook.count({ where: { ...companyFilter, ...dateFilter } }),
    prisma.inboundWebhook.count({ where: { ...companyFilter, ...prevDateFilter } }),
    prisma.routeDelivery.count({ where: { ...companyFilter, ...dateFilter, status: "delivered" as DeliveryStatus } }),
    prisma.routeDelivery.count({ where: { ...companyFilter, ...dateFilter, status: "failed" as DeliveryStatus } }),
    prisma.routeDelivery.count({ where: { ...companyFilter, ...prevDateFilter, status: "delivered" as DeliveryStatus } }),
    prisma.routeDelivery.count({ where: { ...companyFilter, ...prevDateFilter, status: "failed" as DeliveryStatus } }),
  ]);

  const total = deliveriesCompleted + deliveriesFailed;
  const prevTotal = prevDeliveriesCompleted + prevDeliveriesFailed;

  const successRate = total === 0 ? null : Math.round((deliveriesCompleted / total) * 1000) / 10;
  const prevSuccessRate = prevTotal === 0 ? null : Math.round((prevDeliveriesCompleted / prevTotal) * 1000) / 10;

  return {
    webhooksReceived,
    deliveriesCompleted,
    deliveriesFailed,
    deliverySuccessRate: successRate,
    comparison: {
      webhooksReceived: computeComparison(webhooksReceived, prevWebhooksReceived),
      deliveriesCompleted: computeComparison(deliveriesCompleted, prevDeliveriesCompleted),
      deliveriesFailed: computeComparison(deliveriesFailed, prevDeliveriesFailed),
      deliverySuccessRate: successRate !== null && prevSuccessRate !== null
        ? Math.round((successRate - prevSuccessRate) * 10) / 10
        : null,
    },
  };
}

async function getChart(
  period: Period,
  tenantFilter: Record<string, unknown>,
  companyId?: string,
): Promise<ChartPoint[]> {
  const range = getPeriodRange(period);
  const companyFilter = companyId ? { companyId } : tenantFilter;
  const isHourly = period === "today";

  // Buscar deliveries individuais — groupBy não agrega porque createdAt tem precisão de milissegundos
  // (cada linha teria createdAt único, tornando-o equivalente a findMany sem ganho algum)
  const deliveries = await prisma.routeDelivery.findMany({
    where: { ...companyFilter, createdAt: { gte: range.start, lt: range.end } },
    select: { status: true, createdAt: true },
  });

  // Gerar série completa de buckets
  const buckets: Map<string, ChartPoint> = new Map();

  if (isHourly) {
    // 24 horas (ou até hora atual)
    const now = new Date();
    for (let h = 0; h < 24; h++) {
      const bucketStart = new Date(range.start);
      bucketStart.setUTCHours(h, 0, 0, 0);
      if (bucketStart > now) break;
      buckets.set(bucketStart.toISOString(), { bucketStart, total: 0, delivered: 0, failed: 0 });
    }
  } else {
    // Dias
    const days = period === "7d" ? 7 : 30;
    for (let d = 0; d < days; d++) {
      const bucketStart = new Date(range.start);
      bucketStart.setUTCDate(bucketStart.getUTCDate() + d);
      buckets.set(bucketStart.toISOString(), { bucketStart, total: 0, delivered: 0, failed: 0 });
    }
  }

  // Distribuir deliveries nos buckets
  for (const row of deliveries) {
    const created = new Date(row.createdAt);
    let bucketKey: Date;

    if (isHourly) {
      bucketKey = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate(), created.getUTCHours(), 0, 0, 0));
    } else {
      bucketKey = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate(), 0, 0, 0, 0));
    }

    const bucket = buckets.get(bucketKey.toISOString());
    if (bucket) {
      bucket.total += 1;
      if (row.status === "delivered") bucket.delivered += 1;
      if (row.status === "failed") bucket.failed += 1;
    }
  }

  return Array.from(buckets.values());
}

async function getTopErrors(
  period: Period,
  tenantFilter: Record<string, unknown>,
  companyId?: string,
): Promise<TopError[]> {
  const range = getPeriodRange(period);
  const companyFilter = companyId ? { companyId } : tenantFilter;

  // Filtramos por DeliveryAttempt.createdAt (quando o erro ocorreu de fato),
  // não por RouteDelivery.createdAt — o que importa é quando a tentativa aconteceu.
  const attempts = await prisma.deliveryAttempt.findMany({
    where: {
      errorMessage: { not: null },
      createdAt: { gte: range.start, lt: range.end },
      routeDelivery: companyFilter,
    },
    select: {
      errorMessage: true,
      createdAt: true,
      routeDelivery: {
        select: {
          routeId: true,
          companyId: true,
          route: { select: { name: true } },
          company: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Agrupar por errorMessage + routeId
  const groups = new Map<string, {
    errorMessage: string;
    count: number;
    lastOccurrence: Date;
    routeName: string;
    routeId: string;
    companyId: string;
    companyName: string;
  }>();

  for (const a of attempts) {
    const key = `${a.errorMessage}|${a.routeDelivery.routeId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      if (a.createdAt > existing.lastOccurrence) {
        existing.lastOccurrence = a.createdAt;
      }
    } else {
      groups.set(key, {
        errorMessage: a.errorMessage!,
        count: 1,
        lastOccurrence: a.createdAt,
        routeName: a.routeDelivery.route.name,
        routeId: a.routeDelivery.routeId,
        companyId: a.routeDelivery.companyId,
        companyName: a.routeDelivery.company.name,
      });
    }
  }

  // Ordenar por count DESC, desempate por lastOccurrence DESC, limit 5
  return Array.from(groups.values())
    .sort((a, b) => b.count - a.count || b.lastOccurrence.getTime() - a.lastOccurrence.getTime())
    .slice(0, 5);
}

async function getRecentDeliveries(
  tenantFilter: Record<string, unknown>,
  companyId?: string,
  page: number = 1,
): Promise<{ items: RecentDeliveryItem[]; totalPages: number; currentPage: number }> {
  const pageSize = 20;
  const skip = (page - 1) * pageSize;
  const companyFilter = companyId ? { companyId } : tenantFilter;

  const [deliveries, totalCount] = await Promise.all([
    prisma.routeDelivery.findMany({
      where: companyFilter,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        createdAt: true,
        status: true,
        totalAttempts: true,
        originDeliveryId: true,
        companyId: true,
        routeId: true,
        inboundWebhook: {
          select: { eventType: true },
        },
        route: {
          select: { name: true },
        },
        company: {
          select: { name: true },
        },
        attempts: {
          select: { durationMs: true },
          orderBy: { attemptNumber: "desc" as const },
          take: 1,
        },
      },
    }),
    prisma.routeDelivery.count({ where: companyFilter }),
  ]);

  return {
    items: deliveries.map((d) => ({
      id: d.id,
      createdAt: d.createdAt,
      eventType: d.inboundWebhook.eventType,
      companyName: d.company.name,
      companyId: d.companyId,
      routeName: d.route.name,
      routeId: d.routeId,
      status: d.status,
      durationMs: d.attempts[0]?.durationMs ?? null,
      totalAttempts: d.totalAttempts,
      isResend: d.originDeliveryId !== null,
    })),
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    currentPage: page,
  };
}

// --- Tipos e action: Visão Geral da empresa ---

export interface CompanyOverviewData {
  stats: {
    webhooksReceived: number;
    deliveriesCompleted: number;
    deliveriesFailed: number;
    successRate: number | null;
  };
  chart: Array<{
    date: string; // "Seg", "Ter", etc.
    delivered: number;
    failed: number;
  }>;
  routes: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
  activeRoutes: number;
  totalRoutes: number;
}

export async function getCompanyOverviewData(companyId: string): Promise<CompanyOverviewData> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado");

  await assertCompanyAccess(user, companyId);

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [webhooksReceived, deliveriesCompleted, deliveriesFailed, deliveries7d, routes] = await Promise.all([
    prisma.inboundWebhook.count({
      where: { companyId, receivedAt: { gte: twentyFourHoursAgo } },
    }),
    prisma.routeDelivery.count({
      where: { companyId, createdAt: { gte: twentyFourHoursAgo }, status: "delivered" as DeliveryStatus },
    }),
    prisma.routeDelivery.count({
      where: { companyId, createdAt: { gte: twentyFourHoursAgo }, status: "failed" as DeliveryStatus },
    }),
    prisma.routeDelivery.findMany({
      where: { companyId, createdAt: { gte: sevenDaysAgo } },
      select: { status: true, createdAt: true },
    }),
    prisma.webhookRoute.findMany({
      where: { companyId },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const total = deliveriesCompleted + deliveriesFailed;
  const successRate = total === 0 ? null : Math.round((deliveriesCompleted / total) * 1000) / 10;

  // Montar gráfico dos últimos 7 dias com abreviações em português
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const chartMap = new Map<string, { date: string; delivered: number; failed: number }>();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    chartMap.set(key, { date: dayNames[d.getDay()], delivered: 0, failed: 0 });
  }

  for (const row of deliveries7d) {
    const key = new Date(row.createdAt).toISOString().slice(0, 10);
    const bucket = chartMap.get(key);
    if (bucket) {
      if (row.status === "delivered") bucket.delivered++;
      if (row.status === "failed") bucket.failed++;
    }
  }

  return {
    stats: { webhooksReceived, deliveriesCompleted, deliveriesFailed, successRate },
    chart: Array.from(chartMap.values()),
    routes,
    activeRoutes: routes.filter((r: { isActive: boolean }) => r.isActive).length,
    totalRoutes: routes.length,
  };
}

// --- Action pública ---

export async function getDashboardData(
  companyId?: string,
  period: string = "today",
  page: number = 1,
): Promise<ActionResult<DashboardData>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };

    const validPeriod = (["today", "7d", "30d"].includes(period) ? period : "today") as Period;

    // Tenant scoping
    const accessibleCompanyIds = await getAccessibleCompanyIds(user);
    const tenantFilter = buildTenantFilter(accessibleCompanyIds);

    // Se companyId fornecido, validar acesso
    if (companyId) {
      await assertCompanyAccess(user, companyId);
    }

    // Buscar lista de empresas para dropdown
    // tenantFilter usa companyId, mas Company model usa id — converter
    const companyFilter = accessibleCompanyIds === undefined
      ? {}
      : { id: { in: accessibleCompanyIds } };
    const companies = await prisma.company.findMany({
      where: companyFilter,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const [stats, chart, topErrors, recentDeliveries] = await Promise.all([
      getStats(validPeriod, tenantFilter, companyId),
      getChart(validPeriod, tenantFilter, companyId),
      getTopErrors(validPeriod, tenantFilter, companyId),
      getRecentDeliveries(tenantFilter, companyId, page),
    ]);

    return {
      success: true,
      data: { stats, chart, topErrors, recentDeliveries, companies },
    };
  } catch (error) {
    console.error("[dashboard] Erro ao buscar dados:", error);
    return { success: false, error: "Erro ao carregar dados do dashboard" };
  }
}
