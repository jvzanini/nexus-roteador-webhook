# Sub-fase 2A: Dashboard com Dados Reais + Reenvio — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir dados mockados do dashboard por métricas reais do banco e implementar reenvio de webhooks com delivery derivada.

**Architecture:** Server Action agregadora `getDashboardData()` com polling de 60s no client. Reenvio cria nova `RouteDelivery` com `origin_delivery_id` apontando pra original. Gráfico via Recharts.

**Tech Stack:** Next.js 14+ (Server Actions), Prisma v7, BullMQ, Recharts, Jest

**Spec:** `docs/superpowers/specs/2026-04-04-fase2a-dashboard-reenvio-design.md` (v3)

---

## Estrutura de Arquivos

```
CRIAR:
  src/actions/dashboard.ts           — Server Action getDashboardData + helpers internos
  src/actions/resend.ts              — Server Actions resendDelivery, resendDeliveries
  src/components/dashboard/stats-cards.tsx      — 4 cards de métricas
  src/components/dashboard/webhook-chart.tsx    — gráfico Recharts
  src/components/dashboard/top-errors.tsx       — tabela top 5 erros
  src/components/dashboard/recent-deliveries.tsx — tabela entregas recentes
  src/components/dashboard/dashboard-filters.tsx — dropdown empresa + período + refresh
  src/actions/__tests__/dashboard.test.ts       — testes da action agregadora
  src/actions/__tests__/resend.test.ts          — testes das actions de reenvio

MODIFICAR:
  prisma/schema.prisma               — adicionar origin_delivery_id em RouteDelivery
  src/lib/__mocks__/prisma-mock.ts   — já existente, sem mudanças (routeDelivery.create já mockado)
  src/components/dashboard/dashboard-content.tsx — refatorar: remover mocks, consumir getDashboardData
  src/app/(protected)/companies/[id]/logs/log-table.tsx — adicionar checkboxes e botão reenviar

NÃO MODIFICAR:
  src/app/(protected)/dashboard/page.tsx — mantém como está (Server Component wrapper)
  src/lib/queue.ts — reutiliza webhookDeliveryQueue existente
  src/worker/delivery.ts — worker existente já processa qualquer RouteDelivery
```

---

### Task 1: Migration — adicionar `origin_delivery_id` em RouteDelivery

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Adicionar campo e self-relation no schema**

Em `prisma/schema.prisma`, dentro do model `RouteDelivery`, adicionar após o campo `createdAt`:

```prisma
  originDeliveryId  String?        @map("origin_delivery_id") @db.Uuid

  originDelivery    RouteDelivery?  @relation("DeliveryResend", fields: [originDeliveryId], references: [id])
  resends           RouteDelivery[] @relation("DeliveryResend")
```

- [ ] **Step 2: Gerar e aplicar migration**

Run: `npx prisma migrate dev --name add_origin_delivery_id`
Expected: Migration criada e aplicada com sucesso. Campo `origin_delivery_id` nullable adicionado à tabela `route_deliveries`.

- [ ] **Step 3: Regenerar Prisma Client**

Run: `npx prisma generate`
Expected: Client regenerado em `src/generated/prisma/`.

- [ ] **Step 4: Verificar que testes existentes continuam passando**

Run: `npx jest --passWithNoTests`
Expected: Todos os testes existentes passam (o campo novo é nullable, sem breaking change).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/generated/
git commit -m "feat: adiciona origin_delivery_id em RouteDelivery para reenvio"
```

---

### Task 2: Instalar Recharts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar dependência**

Run: `npm install recharts`

- [ ] **Step 2: Verificar instalação**

Run: `npm ls recharts`
Expected: `recharts@2.x.x` listado sem erros.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: adiciona recharts para gráficos do dashboard"
```

---

### Task 3: Server Action — `getDashboardData()`

**Files:**
- Create: `src/actions/dashboard.ts`
- Create: `src/actions/__tests__/dashboard.test.ts`

- [ ] **Step 1: Escrever testes para getStats helper**

Criar `src/actions/__tests__/dashboard.test.ts`:

```typescript
import { prismaMock } from "@/lib/__mocks__/prisma-mock";

// Mock prisma
jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

// Mock auth
const mockGetCurrentUser = jest.fn();
jest.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock tenant
const mockGetAccessibleCompanyIds = jest.fn();
const mockAssertCompanyAccess = jest.fn();
jest.mock("@/lib/tenant", () => ({
  getAccessibleCompanyIds: (...args: any[]) => mockGetAccessibleCompanyIds(...args),
  buildTenantFilter: jest.requireActual("@/lib/tenant").buildTenantFilter,
  assertCompanyAccess: (...args: any[]) => mockAssertCompanyAccess(...args),
}));

// Importar depois dos mocks
import { getDashboardData } from "../dashboard";

describe("getDashboardData", () => {
  const superAdmin = { id: "user-1", name: "Admin", email: "admin@test.com", isSuperAdmin: true, avatarUrl: null, theme: "dark" };
  const normalUser = { id: "user-2", name: "User", email: "user@test.com", isSuperAdmin: false, avatarUrl: null, theme: "dark" };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(superAdmin);
    mockGetAccessibleCompanyIds.mockResolvedValue(undefined); // super admin
  });

  it("retorna erro se usuário não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await getDashboardData();
    expect(result).toEqual({ success: false, error: "Não autenticado" });
  });

  it("retorna stats com dados reais para super admin", async () => {
    // Stats: contagem de InboundWebhook
    prismaMock.inboundWebhook.count
      .mockResolvedValueOnce(100)  // período atual
      .mockResolvedValueOnce(80);  // período anterior

    // Stats: contagem de RouteDelivery por status
    prismaMock.routeDelivery.count
      .mockResolvedValueOnce(90)   // delivered atual
      .mockResolvedValueOnce(10)   // failed atual
      .mockResolvedValueOnce(70)   // delivered anterior
      .mockResolvedValueOnce(8);   // failed anterior

    // Chart: groupBy
    prismaMock.routeDelivery.groupBy.mockResolvedValue([]);

    // Top errors: raw query via groupBy em deliveryAttempt
    prismaMock.deliveryAttempt.groupBy.mockResolvedValue([]);

    // Recent deliveries
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.routeDelivery.count.mockResolvedValueOnce(0);

    // Companies para filtro
    prismaMock.company.findMany.mockResolvedValue([]);

    const result = await getDashboardData();

    expect(result.success).toBe(true);
    expect(result.data?.stats.webhooksReceived).toBe(100);
    expect(result.data?.stats.deliveriesCompleted).toBe(90);
    expect(result.data?.stats.deliveriesFailed).toBe(10);
    expect(result.data?.stats.deliverySuccessRate).toBe(90.0);
    expect(result.data?.stats.comparison.webhooksReceived).toBe(25.0); // (100-80)/80*100
  });

  it("retorna comparison null quando período anterior é zero", async () => {
    prismaMock.inboundWebhook.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(0);  // anterior = 0

    prismaMock.routeDelivery.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)  // anterior delivered = 0
      .mockResolvedValueOnce(0); // anterior failed = 0

    prismaMock.routeDelivery.groupBy.mockResolvedValue([]);
    prismaMock.deliveryAttempt.groupBy.mockResolvedValue([]);
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.routeDelivery.count.mockResolvedValueOnce(0);
    prismaMock.company.findMany.mockResolvedValue([]);

    const result = await getDashboardData();

    expect(result.data?.stats.comparison.webhooksReceived).toBeNull();
  });

  it("retorna deliverySuccessRate null quando não há entregas", async () => {
    prismaMock.inboundWebhook.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    prismaMock.routeDelivery.count
      .mockResolvedValueOnce(0)  // delivered = 0
      .mockResolvedValueOnce(0)  // failed = 0
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    prismaMock.routeDelivery.groupBy.mockResolvedValue([]);
    prismaMock.deliveryAttempt.groupBy.mockResolvedValue([]);
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.routeDelivery.count.mockResolvedValueOnce(0);
    prismaMock.company.findMany.mockResolvedValue([]);

    const result = await getDashboardData();

    expect(result.data?.stats.deliverySuccessRate).toBeNull();
  });

  it("filtra por empresa quando companyId fornecido", async () => {
    prismaMock.inboundWebhook.count.mockResolvedValue(0);
    prismaMock.routeDelivery.count.mockResolvedValue(0);
    prismaMock.routeDelivery.groupBy.mockResolvedValue([]);
    prismaMock.deliveryAttempt.groupBy.mockResolvedValue([]);
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([]);

    await getDashboardData("company-123", "today");

    // Verifica que inboundWebhook.count foi chamado com companyId
    expect(prismaMock.inboundWebhook.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: "company-123" }),
      })
    );
  });

  it("aplica tenant scoping para usuário normal", async () => {
    mockGetCurrentUser.mockResolvedValue(normalUser);
    mockGetAccessibleCompanyIds.mockResolvedValue(["comp-1", "comp-2"]);

    prismaMock.inboundWebhook.count.mockResolvedValue(0);
    prismaMock.routeDelivery.count.mockResolvedValue(0);
    prismaMock.routeDelivery.groupBy.mockResolvedValue([]);
    prismaMock.deliveryAttempt.groupBy.mockResolvedValue([]);
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([]);

    await getDashboardData();

    // Verifica que inboundWebhook.count inclui filtro de tenant
    expect(prismaMock.inboundWebhook.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: { in: ["comp-1", "comp-2"] },
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Rodar teste e verificar que falha**

Run: `npx jest src/actions/__tests__/dashboard.test.ts --verbose`
Expected: FAIL — `Cannot find module '../dashboard'`

- [ ] **Step 3: Implementar getDashboardData**

Criar `src/actions/dashboard.ts`:

```typescript
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
  tenantFilter: Record<string, any>,
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
  tenantFilter: Record<string, any>,
  companyId?: string,
): Promise<ChartPoint[]> {
  const range = getPeriodRange(period);
  const companyFilter = companyId ? { companyId } : tenantFilter;
  const isHourly = period === "today";

  // Buscar deliveries agrupadas
  const deliveries = await prisma.routeDelivery.groupBy({
    by: ["status", "createdAt"],
    where: { ...companyFilter, createdAt: { gte: range.start, lt: range.end } },
    _count: true,
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
      bucket.total += row._count;
      if (row.status === "delivered") bucket.delivered += row._count;
      if (row.status === "failed") bucket.failed += row._count;
    }
  }

  return Array.from(buckets.values());
}

async function getTopErrors(
  period: Period,
  tenantFilter: Record<string, any>,
  companyId?: string,
): Promise<TopError[]> {
  const range = getPeriodRange(period);
  const companyFilter = companyId ? { companyId } : tenantFilter;

  // Buscar delivery attempts com erro, incluindo rota e empresa
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
  tenantFilter: Record<string, any>,
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

// --- Action pública ---

export async function getDashboardData(
  companyId?: string,
  period: string = "today",
  page: number = 1,
): Promise<ActionResult<DashboardData>> {
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
  const companies = await prisma.company.findMany({
    where: { isActive: true, ...tenantFilter },
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
}
```

- [ ] **Step 4: Rodar testes e verificar que passam**

Run: `npx jest src/actions/__tests__/dashboard.test.ts --verbose`
Expected: PASS — todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/actions/dashboard.ts src/actions/__tests__/dashboard.test.ts
git commit -m "feat: implementa getDashboardData server action com métricas reais"
```

---

### Task 4: Server Actions — `resendDelivery()` e `resendDeliveries()`

**Files:**
- Create: `src/actions/resend.ts`
- Create: `src/actions/__tests__/resend.test.ts`

- [ ] **Step 1: Escrever testes para resendDelivery**

Criar `src/actions/__tests__/resend.test.ts`:

```typescript
import { prismaMock } from "@/lib/__mocks__/prisma-mock";

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

const mockGetCurrentUser = jest.fn();
jest.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const mockAssertCompanyAccess = jest.fn();
jest.mock("@/lib/tenant", () => ({
  assertCompanyAccess: (...args: any[]) => mockAssertCompanyAccess(...args),
}));

const mockLogAudit = jest.fn();
jest.mock("@/lib/audit", () => ({
  logAudit: (...args: any[]) => mockLogAudit(...args),
}));

const mockQueueAdd = jest.fn();
jest.mock("@/lib/queue", () => ({
  webhookDeliveryQueue: { add: (...args: any[]) => mockQueueAdd(...args) },
}));

import { resendDelivery, resendDeliveries } from "../resend";

describe("resendDelivery", () => {
  const user = { id: "user-1", name: "Admin", email: "admin@test.com", isSuperAdmin: true, avatarUrl: null, theme: "dark" };

  const failedDelivery = {
    id: "del-1",
    inboundWebhookId: "inb-1",
    routeId: "route-1",
    companyId: "comp-1",
    status: "failed",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(user);
    mockAssertCompanyAccess.mockResolvedValue(undefined);
  });

  it("retorna erro se não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await resendDelivery("del-1");
    expect(result).toEqual({ created: false, enqueued: false, newDeliveryId: "", error: "Não autenticado" });
  });

  it("retorna erro se delivery não existe", async () => {
    prismaMock.routeDelivery.findUnique.mockResolvedValue(null);
    const result = await resendDelivery("del-999");
    expect(result.created).toBe(false);
    expect(result.error).toContain("não encontrada");
  });

  it("retorna erro se status não é failed", async () => {
    prismaMock.routeDelivery.findUnique.mockResolvedValue({ ...failedDelivery, status: "delivered" });
    const result = await resendDelivery("del-1");
    expect(result.created).toBe(false);
    expect(result.error).toContain("failed");
  });

  it("cria delivery derivada e enfileira com sucesso", async () => {
    prismaMock.routeDelivery.findUnique.mockResolvedValue(failedDelivery);
    prismaMock.routeDelivery.create.mockResolvedValue({ ...failedDelivery, id: "new-del-1", originDeliveryId: "del-1", status: "pending" });
    mockQueueAdd.mockResolvedValue({ id: "job-1" });

    const result = await resendDelivery("del-1");

    expect(result.created).toBe(true);
    expect(result.enqueued).toBe(true);
    expect(result.newDeliveryId).toBe("new-del-1");

    // Verifica criação da delivery derivada
    expect(prismaMock.routeDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inboundWebhookId: "inb-1",
        routeId: "route-1",
        companyId: "comp-1",
        status: "pending",
        originDeliveryId: "del-1",
      }),
    });

    // Verifica audit log
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery.resend",
        resourceType: "route_delivery",
        resourceId: "new-del-1",
      })
    );
  });

  it("cria delivery mas retorna enqueued=false se BullMQ falha", async () => {
    prismaMock.routeDelivery.findUnique.mockResolvedValue(failedDelivery);
    prismaMock.routeDelivery.create.mockResolvedValue({ ...failedDelivery, id: "new-del-1", originDeliveryId: "del-1", status: "pending" });
    mockQueueAdd.mockRejectedValue(new Error("Redis down"));

    const result = await resendDelivery("del-1");

    expect(result.created).toBe(true);
    expect(result.enqueued).toBe(false);
    expect(result.newDeliveryId).toBe("new-del-1");
  });
});

describe("resendDeliveries", () => {
  const user = { id: "user-1", name: "Admin", email: "admin@test.com", isSuperAdmin: true, avatarUrl: null, theme: "dark" };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(user);
    mockAssertCompanyAccess.mockResolvedValue(undefined);
  });

  it("retorna erro se mais de 50 IDs", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `del-${i}`);
    const result = await resendDeliveries(ids);
    expect(result.error).toContain("50");
  });

  it("deduplica IDs antes de processar", async () => {
    prismaMock.routeDelivery.findMany.mockResolvedValue([
      { id: "del-1", inboundWebhookId: "inb-1", routeId: "r-1", companyId: "c-1", status: "failed" },
    ]);
    prismaMock.routeDelivery.create.mockResolvedValue({ id: "new-1", status: "pending" });
    mockQueueAdd.mockResolvedValue({ id: "job-1" });

    const result = await resendDeliveries(["del-1", "del-1", "del-1"]);

    expect(result.created).toBe(1); // Não 3
  });

  it("pula deliveries inválidas e processa válidas", async () => {
    prismaMock.routeDelivery.findMany.mockResolvedValue([
      { id: "del-1", inboundWebhookId: "inb-1", routeId: "r-1", companyId: "c-1", status: "failed" },
      { id: "del-2", inboundWebhookId: "inb-2", routeId: "r-2", companyId: "c-1", status: "delivered" }, // não é failed
    ]);
    prismaMock.routeDelivery.create.mockResolvedValue({ id: "new-1", status: "pending" });
    mockQueueAdd.mockResolvedValue({ id: "job-1" });

    const result = await resendDeliveries(["del-1", "del-2", "del-999"]); // del-999 não existe

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(2); // del-2 (não failed) + del-999 (não encontrado)
    expect(result.errors.length).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar testes e verificar que falham**

Run: `npx jest src/actions/__tests__/resend.test.ts --verbose`
Expected: FAIL — `Cannot find module '../resend'`

- [ ] **Step 3: Implementar resendDelivery e resendDeliveries**

Criar `src/actions/resend.ts`:

```typescript
"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { webhookDeliveryQueue } from "@/lib/queue";

// --- Tipos ---

export interface ResendResult {
  created: boolean;
  enqueued: boolean;
  newDeliveryId: string;
  error?: string;
}

export interface BatchResendResult {
  created: number;
  enqueued: number;
  enqueueFailed: number;
  skipped: number;
  errors: string[];
  error?: string;
}

// --- Individual ---

export async function resendDelivery(deliveryId: string): Promise<ResendResult> {
  const user = await getCurrentUser();
  if (!user) return { created: false, enqueued: false, newDeliveryId: "", error: "Não autenticado" };

  // Buscar delivery original
  const original = await prisma.routeDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      inboundWebhookId: true,
      routeId: true,
      companyId: true,
      status: true,
    },
  });

  if (!original) {
    return { created: false, enqueued: false, newDeliveryId: "", error: `Entrega ${deliveryId} não encontrada` };
  }

  // Validar acesso
  await assertCompanyAccess(user, original.companyId);

  // Validar status
  if (original.status !== "failed") {
    return { created: false, enqueued: false, newDeliveryId: "", error: `Apenas entregas com status failed podem ser reenviadas. Status atual: ${original.status}` };
  }

  // Criar delivery derivada
  const newDelivery = await prisma.routeDelivery.create({
    data: {
      inboundWebhookId: original.inboundWebhookId,
      routeId: original.routeId,
      companyId: original.companyId,
      status: "pending",
      originDeliveryId: original.id,
    },
  });

  // Enfileirar — best-effort
  let enqueued = false;
  try {
    await webhookDeliveryQueue.add("delivery", { routeDeliveryId: newDelivery.id });
    enqueued = true;
  } catch (err) {
    console.error("[resend] Falha ao enfileirar job, orphan-recovery vai compensar:", err);
  }

  // Audit log
  logAudit({
    actorType: "user",
    actorId: user.id,
    actorLabel: user.email,
    companyId: original.companyId,
    action: "delivery.resend",
    resourceType: "route_delivery",
    resourceId: newDelivery.id,
    details: {
      originalDeliveryId: original.id,
      newDeliveryId: newDelivery.id,
      routeId: original.routeId,
      inboundWebhookId: original.inboundWebhookId,
      enqueued,
    },
  });

  return { created: true, enqueued, newDeliveryId: newDelivery.id };
}

// --- Lote ---

export async function resendDeliveries(deliveryIds: string[]): Promise<BatchResendResult> {
  const user = await getCurrentUser();
  if (!user) return { created: 0, enqueued: 0, enqueueFailed: 0, skipped: 0, errors: [], error: "Não autenticado" };

  // Deduplicar
  const uniqueIds = [...new Set(deliveryIds)];

  // Limitar a 50
  if (uniqueIds.length > 50) {
    return { created: 0, enqueued: 0, enqueueFailed: 0, skipped: 0, errors: [], error: "Máximo 50 entregas por vez" };
  }

  // Buscar todas as deliveries
  const originals = await prisma.routeDelivery.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      inboundWebhookId: true,
      routeId: true,
      companyId: true,
      status: true,
    },
  });

  const foundIds = new Set(originals.map((o) => o.id));
  const errors: string[] = [];
  const toResend: typeof originals = [];

  for (const id of uniqueIds) {
    if (!foundIds.has(id)) {
      errors.push(`${id}: não encontrada`);
      continue;
    }
    const delivery = originals.find((o) => o.id === id)!;
    if (delivery.status !== "failed") {
      errors.push(`${id}: status é ${delivery.status}, não failed`);
      continue;
    }

    // Validar acesso
    try {
      await assertCompanyAccess(user, delivery.companyId);
    } catch {
      errors.push(`${id}: sem acesso à empresa`);
      continue;
    }

    toResend.push(delivery);
  }

  const skipped = uniqueIds.length - toResend.length;

  // Criar deliveries derivadas
  let created = 0;
  let enqueued = 0;
  let enqueueFailed = 0;
  const originalIds: string[] = [];
  const newIds: string[] = [];

  for (const original of toResend) {
    const newDelivery = await prisma.routeDelivery.create({
      data: {
        inboundWebhookId: original.inboundWebhookId,
        routeId: original.routeId,
        companyId: original.companyId,
        status: "pending",
        originDeliveryId: original.id,
      },
    });

    created++;
    originalIds.push(original.id);
    newIds.push(newDelivery.id);

    try {
      await webhookDeliveryQueue.add("delivery", { routeDeliveryId: newDelivery.id });
      enqueued++;
    } catch {
      enqueueFailed++;
    }
  }

  // Audit log
  if (created > 0) {
    logAudit({
      actorType: "user",
      actorId: user.id,
      actorLabel: user.email,
      action: "delivery.resend_batch",
      resourceType: "route_delivery",
      details: { originalIds, newIds, created, enqueued, enqueueFailed, skipped },
    });
  }

  return { created, enqueued, enqueueFailed, skipped, errors };
}
```

- [ ] **Step 4: Rodar testes e verificar que passam**

Run: `npx jest src/actions/__tests__/resend.test.ts --verbose`
Expected: PASS — todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/actions/resend.ts src/actions/__tests__/resend.test.ts
git commit -m "feat: implementa reenvio de webhooks com delivery derivada"
```

---

### Task 5: Componentes UI — Dashboard Filters

**Files:**
- Create: `src/components/dashboard/dashboard-filters.tsx`

- [ ] **Step 1: Criar componente de filtros**

Criar `src/components/dashboard/dashboard-filters.tsx`:

```tsx
"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardFiltersProps {
  companies: { id: string; name: string }[];
  selectedCompanyId: string | undefined;
  selectedPeriod: string;
  isLoading: boolean;
  onCompanyChange: (companyId: string | undefined) => void;
  onPeriodChange: (period: string) => void;
  onRefresh: () => void;
}

const periods = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

export function DashboardFilters({
  companies,
  selectedCompanyId,
  selectedPeriod,
  isLoading,
  onCompanyChange,
  onPeriodChange,
  onRefresh,
}: DashboardFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>

      <div className="flex items-center gap-2 ml-auto">
        {/* Filtro de empresa */}
        <select
          value={selectedCompanyId ?? ""}
          onChange={(e) => onCompanyChange(e.target.value || undefined)}
          className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 outline-none focus:border-zinc-600 transition-colors duration-200 cursor-pointer"
        >
          <option value="">Todas as empresas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Filtro de período */}
        <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => onPeriodChange(p.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 cursor-pointer ${
                selectedPeriod === p.value
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Botão refresh */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/dashboard-filters.tsx
git commit -m "feat: componente de filtros do dashboard (empresa, período, refresh)"
```

---

### Task 6: Componentes UI — Stats Cards

**Files:**
- Create: `src/components/dashboard/stats-cards.tsx`

- [ ] **Step 1: Criar componente de cards**

Criar `src/components/dashboard/stats-cards.tsx`:

```tsx
"use client";

import { motion } from "framer-motion";
import { Inbox, CheckCircle2, XCircle, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DashboardStats } from "@/actions/dashboard";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

interface StatsCardsProps {
  stats: DashboardStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label: "Webhooks Recebidos",
      value: stats.webhooksReceived.toLocaleString("pt-BR"),
      comparison: stats.comparison.webhooksReceived,
      icon: Inbox,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-400",
      invertTrend: false,
    },
    {
      label: "Entregas Concluídas",
      value: stats.deliveriesCompleted.toLocaleString("pt-BR"),
      comparison: stats.comparison.deliveriesCompleted,
      icon: CheckCircle2,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
      invertTrend: false,
    },
    {
      label: "Entregas com Falha",
      value: stats.deliveriesFailed.toLocaleString("pt-BR"),
      comparison: stats.comparison.deliveriesFailed,
      icon: XCircle,
      iconBg: "bg-red-500/10",
      iconColor: "text-red-400",
      invertTrend: true, // mais falhas = vermelho
    },
    {
      label: "Taxa de Sucesso",
      value: stats.deliverySuccessRate !== null
        ? `${stats.deliverySuccessRate.toFixed(1)}%`
        : "\u2014", // —
      sublabel: "(entregas)",
      comparison: stats.comparison.deliverySuccessRate,
      icon: TrendingUp,
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-400",
      invertTrend: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const isPositive = card.comparison !== null && card.comparison > 0;
        const isNegative = card.comparison !== null && card.comparison < 0;
        const trendIsGood = card.invertTrend ? isNegative : isPositive;
        const trendIsBad = card.invertTrend ? isPositive : isNegative;

        return (
          <motion.div key={card.label} variants={itemVariants}>
            <Card className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all duration-200 rounded-xl cursor-default">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className={`p-2.5 rounded-lg ${card.iconBg}`}>
                    <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium">
                    {card.comparison === null ? (
                      <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-500">
                        Novo
                      </Badge>
                    ) : (
                      <span className={trendIsGood ? "text-emerald-400" : trendIsBad ? "text-red-400" : "text-zinc-500"}>
                        <span className="inline-flex items-center gap-0.5">
                          {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : isNegative ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
                          {card.comparison > 0 ? "+" : ""}{card.comparison.toFixed(1)}%
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold text-white tabular-nums">{card.value}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {card.label}
                    {card.sublabel && <span className="ml-1">{card.sublabel}</span>}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/stats-cards.tsx
git commit -m "feat: componente stats-cards com métricas reais e variação"
```

---

### Task 7: Componentes UI — Webhook Chart

**Files:**
- Create: `src/components/dashboard/webhook-chart.tsx`

- [ ] **Step 1: Criar componente de gráfico**

Criar `src/components/dashboard/webhook-chart.tsx`:

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import type { ChartPoint } from "@/actions/dashboard";

interface WebhookChartProps {
  data: ChartPoint[];
  period: string;
}

function formatLabel(date: Date, period: string): string {
  const d = new Date(date);
  if (period === "today") {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-lg">
      <p className="text-xs text-zinc-400 mb-2">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: <span className="font-bold">{entry.value?.toLocaleString("pt-BR")}</span>
        </p>
      ))}
    </div>
  );
}

export function WebhookChart({ data, period }: WebhookChartProps) {
  const title = period === "today" ? "Entregas por Hora" : "Entregas por Dia";

  const chartData = data.map((point) => ({
    label: formatLabel(point.bucketStart, period),
    Total: point.total,
    "Concluídas": point.delivered,
    Falhas: point.failed,
  }));

  const isEmpty = data.every((p) => p.total === 0);

  return (
    <Card className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex items-center justify-center h-[300px] text-sm text-zinc-500">
            Nenhuma entrega no período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="Total" stroke="#a1a1aa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Concluídas" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Falhas" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/webhook-chart.tsx
git commit -m "feat: componente gráfico de entregas com Recharts"
```

---

### Task 8: Componentes UI — Top Errors + Recent Deliveries

**Files:**
- Create: `src/components/dashboard/top-errors.tsx`
- Create: `src/components/dashboard/recent-deliveries.tsx`

- [ ] **Step 1: Criar componente top-errors**

Criar `src/components/dashboard/top-errors.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TopError } from "@/actions/dashboard";

interface TopErrorsProps {
  errors: TopError[];
}

export function TopErrors({ errors }: TopErrorsProps) {
  const router = useRouter();

  return (
    <Card className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          Erros Mais Frequentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {errors.length === 0 ? (
          <div className="flex items-center justify-center h-[120px] text-sm text-zinc-500">
            Nenhum erro no período
          </div>
        ) : (
          <div className="space-y-3">
            {errors.map((error, i) => (
              <div
                key={`${error.routeId}-${i}`}
                onClick={() => router.push(`/companies/${error.companyId}/logs?routeId=${error.routeId}`)}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors duration-200 cursor-pointer"
              >
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm text-zinc-300 truncate" title={error.errorMessage}>
                    {error.errorMessage.length > 60
                      ? error.errorMessage.slice(0, 60) + "..."
                      : error.errorMessage}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {error.routeName} &middot; {error.companyName} &middot;{" "}
                    {formatDistanceToNow(new Date(error.lastOccurrence), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs border-red-500/30 text-red-400 bg-red-500/10 shrink-0">
                  {error.count}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Criar componente recent-deliveries**

Criar `src/components/dashboard/recent-deliveries.tsx`:

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { RecentDeliveryItem } from "@/actions/dashboard";

interface RecentDeliveriesProps {
  items: RecentDeliveryItem[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  delivered: { label: "Entregue", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  failed: { label: "Falhou", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  pending: { label: "Pendente", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  retrying: { label: "Retentando", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  delivering: { label: "Entregando", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

export function RecentDeliveries({ items, currentPage, totalPages, onPageChange }: RecentDeliveriesProps) {
  return (
    <Card className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-400" />
          Entregas Recentes
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-b-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-500 text-xs font-medium h-9">Quando</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9">Evento</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9">Empresa</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9">Rota</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9">Status</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9 text-right">Duração</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9 text-right">Tentativas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                    Nenhuma entrega no período
                  </TableCell>
                </TableRow>
              )}
              {items.map((item) => {
                const status = statusConfig[item.status] ?? statusConfig.pending;
                return (
                  <TableRow key={item.id} className="border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <TableCell className="text-xs text-zinc-500 py-2.5">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="outline" className="font-mono text-xs border-zinc-700 text-zinc-300">
                        {item.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-400 py-2.5">{item.companyName}</TableCell>
                    <TableCell className="text-sm text-zinc-400 py-2.5">{item.routeName}</TableCell>
                    <TableCell className="py-2.5">
                      <span className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-xs ${status.className}`}>
                          {status.label}
                        </Badge>
                        {item.isResend && (
                          <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-500">
                            Reenvio
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-zinc-500 py-2.5">
                      {item.durationMs !== null ? `${item.durationMs}ms` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-zinc-500 py-2.5">
                      {item.totalAttempts}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="gap-1 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="text-xs text-zinc-500">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="gap-1 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/top-errors.tsx src/components/dashboard/recent-deliveries.tsx
git commit -m "feat: componentes top-errors e recent-deliveries do dashboard"
```

---

### Task 9: Refatorar Dashboard Content — conectar tudo

**Files:**
- Modify: `src/components/dashboard/dashboard-content.tsx`

- [ ] **Step 1: Reescrever dashboard-content.tsx com dados reais**

Substituir o conteúdo inteiro de `src/components/dashboard/dashboard-content.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { getDashboardData, type DashboardData } from "@/actions/dashboard";
import { DashboardFilters } from "./dashboard-filters";
import { StatsCards } from "./stats-cards";
import { WebhookChart } from "./webhook-chart";
import { TopErrors } from "./top-errors";
import { RecentDeliveries } from "./recent-deliveries";

interface DashboardContentProps {
  userName: string;
  isSuperAdmin?: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

const POLL_INTERVAL = 60_000; // 60s

export function DashboardContent({ userName }: DashboardContentProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [companyId, setCompanyId] = useState<string | undefined>(undefined);
  const [period, setPeriod] = useState("today");
  const [page, setPage] = useState(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setIsLoading(true);
    try {
      const result = await getDashboardData(companyId, period, page);
      if (result.success && result.data) {
        setData(result.data);
      }
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [companyId, period, page]);

  // Polling
  useEffect(() => {
    fetchData(isInitialLoad);

    timerRef.current = setInterval(() => {
      fetchData(false); // Silencioso
    }, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData, isInitialLoad]);

  function handleRefresh() {
    if (timerRef.current) clearInterval(timerRef.current);
    fetchData(false);
    timerRef.current = setInterval(() => fetchData(false), POLL_INTERVAL);
  }

  function handleCompanyChange(id: string | undefined) {
    setCompanyId(id);
    setPage(1); // Reset página ao mudar empresa
  }

  function handlePeriodChange(p: string) {
    setPeriod(p);
    setPage(1); // Reset página ao mudar período
  }

  function handlePageChange(p: number) {
    setPage(p);
    // Não reinicia timer, busca dados imediatamente via useEffect
  }

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Skeleton loading no primeiro carregamento
  if (isInitialLoad && !data) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 w-48 bg-zinc-800 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-zinc-900 border border-zinc-800 rounded-xl" />
          ))}
        </div>
        <div className="h-[350px] bg-zinc-900 border border-zinc-800 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Greeting */}
      <motion.div variants={itemVariants}>
        <p className="text-sm text-zinc-500 capitalize">{today}</p>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants}>
        <DashboardFilters
          companies={data.companies}
          selectedCompanyId={companyId}
          selectedPeriod={period}
          isLoading={isLoading}
          onCompanyChange={handleCompanyChange}
          onPeriodChange={handlePeriodChange}
          onRefresh={handleRefresh}
        />
      </motion.div>

      {/* Stats Cards */}
      <StatsCards stats={data.stats} />

      {/* Chart + Top Errors (lado a lado em desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <WebhookChart data={data.chart} period={period} />
        </motion.div>
        <motion.div variants={itemVariants}>
          <TopErrors errors={data.topErrors} />
        </motion.div>
      </div>

      {/* Recent Deliveries */}
      <motion.div variants={itemVariants}>
        <RecentDeliveries
          items={data.recentDeliveries.items}
          currentPage={data.recentDeliveries.currentPage}
          totalPages={data.recentDeliveries.totalPages}
          onPageChange={handlePageChange}
        />
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verificar que compila sem erros**

Run: `npx tsc --noEmit`
Expected: Sem erros de tipo.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/dashboard-content.tsx
git commit -m "feat: refatora dashboard para dados reais com polling de 60s"
```

---

### Task 10: Reenvio na tela de Logs

**Files:**
- Modify: `src/app/(protected)/companies/[id]/logs/log-table.tsx`

- [ ] **Step 1: Adicionar reenvio individual e em lote ao log-table**

Modificar `src/app/(protected)/companies/[id]/logs/log-table.tsx`. As mudanças são:

1. Importar `resendDelivery`, `resendDeliveries` de `@/actions/resend`
2. Importar `Checkbox` de `@/components/ui/checkbox`
3. Importar `RefreshCw` de `lucide-react`
4. Importar `toast` de `sonner`
5. Adicionar state `selectedIds` e `resending`
6. Adicionar coluna de checkbox e botão reenviar nas linhas de delivery
7. Adicionar barra de ações de lote no topo

Substituir o conteúdo inteiro de `log-table.tsx`:

```tsx
"use client";

import { useState, useTransition, Fragment } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  RefreshCw,
} from "lucide-react";
import { LogStatusBadge } from "./log-status-badge";
import { LogRowDetail } from "./log-row-detail";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { resendDelivery, resendDeliveries } from "@/actions/resend";
import type { LogEntry, LogsPage } from "@/lib/actions/logs";
import type { DeliveryStatus } from "@/generated/prisma/client";

interface LogTableProps {
  companyId: string;
  page: LogsPage;
}

export function LogTable({ companyId, page }: LogTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [batchResending, setBatchResending] = useState(false);

  // Coletar todos os delivery IDs com status failed na página
  const failedDeliveryIds = page.entries.flatMap((e) =>
    e.deliveries.filter((d) => d.status === "failed").map((d) => d.id)
  );

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(deliveryId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(deliveryId)) next.delete(deliveryId);
      else next.add(deliveryId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === failedDeliveryIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(failedDeliveryIds));
    }
  }

  function loadNextPage() {
    if (!page.nextCursor) return;
    setSelectedIds(new Set()); // Limpar seleção ao navegar
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", page.nextCursor);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function loadFirstPage() {
    setSelectedIds(new Set()); // Limpar seleção ao navegar
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  async function handleResendSingle(deliveryId: string) {
    setResendingId(deliveryId);
    try {
      const result = await resendDelivery(deliveryId);
      if (result.created && result.enqueued) {
        toast.success("Reenvio criado e enfileirado");
      } else if (result.created && !result.enqueued) {
        toast.success("Reenvio criado. Será processado automaticamente");
      } else {
        toast.error(result.error || "Erro ao reenviar");
      }
    } catch {
      toast.error("Erro ao reenviar");
    } finally {
      setResendingId(null);
    }
  }

  async function handleResendBatch() {
    if (selectedIds.size === 0) return;
    if (selectedIds.size > 50) {
      toast.error("Máximo 50 por vez");
      return;
    }

    const confirmed = window.confirm(
      `Tem certeza que deseja reenviar ${selectedIds.size} entrega${selectedIds.size > 1 ? "s" : ""}? Novas entregas serão criadas e enfileiradas.`
    );
    if (!confirmed) return;

    setBatchResending(true);
    try {
      const result = await resendDeliveries([...selectedIds]);
      if (result.error) {
        toast.error(result.error);
      } else if (result.created > 0) {
        let msg = `${result.created} reenvio${result.created > 1 ? "s" : ""} criado${result.created > 1 ? "s" : ""}`;
        if (result.enqueueFailed > 0) {
          msg += `. ${result.enqueueFailed} será${result.enqueueFailed > 1 ? "ão" : ""} processado${result.enqueueFailed > 1 ? "s" : ""} automaticamente`;
        }
        if (result.skipped > 0) {
          msg += `. ${result.skipped} ignorado${result.skipped > 1 ? "s" : ""}`;
        }
        toast.success(msg);
      } else {
        toast.error("Nenhuma entrega pôde ser reenviada");
      }
      setSelectedIds(new Set());
    } catch {
      toast.error("Erro ao reenviar");
    } finally {
      setBatchResending(false);
    }
  }

  function getPrimaryStatus(entry: LogEntry): DeliveryStatus {
    if (entry.deliveries.length === 0) return "pending";
    const statuses = entry.deliveries.map((d) => d.status);
    if (statuses.includes("failed")) return "failed";
    if (statuses.includes("retrying")) return "retrying";
    if (statuses.includes("delivering")) return "delivering";
    if (statuses.includes("pending")) return "pending";
    return "delivered";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-500">
          {page.totalCount} registro{page.totalCount !== 1 ? "s" : ""} encontrado
          {page.totalCount !== 1 ? "s" : ""}
        </div>

        {/* Barra de ações de lote */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">
              {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResendBatch}
              disabled={batchResending || selectedIds.size > 50}
              className="gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer transition-all duration-200"
              title={selectedIds.size > 50 ? "Máximo 50 por vez" : undefined}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${batchResending ? "animate-spin" : ""}`} />
              Reenviar selecionados
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="w-8 text-zinc-500 text-xs">
                {failedDeliveryIds.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selectedIds.size === failedDeliveryIds.length && failedDeliveryIds.length > 0}
                    onChange={toggleSelectAll}
                    className="cursor-pointer accent-blue-600"
                  />
                )}
              </TableHead>
              <TableHead className="w-8 text-zinc-500 text-xs" />
              <TableHead className="w-[180px] text-zinc-500 text-xs">Timestamp</TableHead>
              <TableHead className="text-zinc-500 text-xs">Evento</TableHead>
              <TableHead className="text-zinc-500 text-xs">Rota(s)</TableHead>
              <TableHead className="w-[120px] text-zinc-500 text-xs">Status</TableHead>
              <TableHead className="w-[100px] text-right text-zinc-500 text-xs">Duração</TableHead>
              <TableHead className="w-[80px] text-right text-zinc-500 text-xs">Tentativas</TableHead>
              <TableHead className="w-[50px] text-zinc-500 text-xs" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-zinc-500 py-8">
                  Nenhum log encontrado para os filtros selecionados.
                </TableCell>
              </TableRow>
            )}
            {page.entries.map((entry) => {
              const isExpanded = expandedRows.has(entry.id);
              const primaryStatus = getPrimaryStatus(entry);
              const totalAttempts = entry.deliveries.reduce((acc, d) => acc + d.totalAttempts, 0);
              const maxDuration = entry.deliveries.reduce(
                (max, d) => (d.durationMs !== null && d.durationMs > max ? d.durationMs : max),
                0
              );

              // Checkbox: mostra se alguma delivery é failed
              const failedInEntry = entry.deliveries.filter((d) => d.status === "failed");
              const hasFailedDelivery = failedInEntry.length > 0;
              const entryFailedIds = failedInEntry.map((d) => d.id);
              const allSelected = entryFailedIds.every((id) => selectedIds.has(id));

              return (
                <Fragment key={entry.id}>
                  <TableRow className="cursor-pointer hover:bg-zinc-800/30 transition-colors duration-200 border-zinc-800/50">
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {hasFailedDelivery && (
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => {
                            const next = new Set(selectedIds);
                            if (allSelected) {
                              entryFailedIds.forEach((id) => next.delete(id));
                            } else {
                              entryFailedIds.forEach((id) => next.add(id));
                            }
                            setSelectedIds(next);
                          }}
                          className="cursor-pointer accent-blue-600"
                        />
                      )}
                    </TableCell>
                    <TableCell onClick={() => toggleRow(entry.id)}>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-zinc-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-zinc-500" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400" onClick={() => toggleRow(entry.id)}>
                      {format(new Date(entry.receivedAt), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                    </TableCell>
                    <TableCell onClick={() => toggleRow(entry.id)}>
                      <Badge variant="outline" className="font-mono text-xs border-zinc-700 text-zinc-300">
                        {entry.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={() => toggleRow(entry.id)}>
                      <div className="flex flex-wrap gap-1">
                        {entry.deliveries.map((d) => (
                          <span key={d.id} className="text-xs text-zinc-400">{d.routeName}</span>
                        ))}
                        {entry.deliveries.length === 0 && (
                          <span className="text-xs text-zinc-500">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={() => toggleRow(entry.id)}>
                      <LogStatusBadge status={primaryStatus} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-zinc-500" onClick={() => toggleRow(entry.id)}>
                      {maxDuration > 0 ? `${maxDuration}ms` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-zinc-500" onClick={() => toggleRow(entry.id)}>
                      {totalAttempts}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {hasFailedDelivery && (
                        <button
                          onClick={() => handleResendSingle(entryFailedIds[0])}
                          disabled={resendingId !== null}
                          className="p-1 rounded hover:bg-zinc-700 transition-colors duration-200 cursor-pointer text-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                          title="Reenviar"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${resendingId === entryFailedIds[0] ? "animate-spin" : ""}`} />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={9} className="p-0">
                        <LogRowDetail companyId={companyId} inboundWebhookId={entry.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={loadFirstPage}
          disabled={!searchParams.get("cursor") || isPending}
          className="gap-1 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
        >
          <ChevronLeft className="h-4 w-4" />
          Início
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={loadNextPage}
          disabled={!page.nextCursor || isPending}
          className="gap-1 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
        >
          Próxima
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: Sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/companies/[id]/logs/log-table.tsx
git commit -m "feat: reenvio individual e em lote na tela de logs"
```

---

### Task 11: Build e Verificação Final

**Files:** Nenhum novo — verificação do conjunto

- [ ] **Step 1: Rodar todos os testes**

Run: `npx jest --verbose`
Expected: Todos os testes passam (existentes + novos).

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: Build completo sem erros.

- [ ] **Step 3: Verificar lint se configurado**

Run: `npm run lint 2>/dev/null || echo "Sem lint configurado"`
Expected: Sem erros de lint, ou lint não configurado.

- [ ] **Step 4: Commit final se houver ajustes**

Se algum ajuste foi necessário nos steps anteriores:
```bash
git add -A
git commit -m "fix: ajustes de build e compatibilidade da Sub-fase 2A"
```
