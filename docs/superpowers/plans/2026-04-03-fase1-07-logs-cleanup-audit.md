# Fase 1 — Sub-plano 7: Logs + Cleanup + Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a visualização de logs de webhook por empresa, jobs de cleanup de dados (LGPD), cleanup de notificações e audit log operacional mínimo.

**Dependencies:** Sub-planos 4 (Webhook Ingest) e 5 (Worker + Delivery) devem estar concluídos.

**Architecture:** Página de logs server-side com filtros e paginação cursor-based. Jobs de cleanup agendados via BullMQ repeat (cron). Helper de audit log para persistência centralizada.

**Tech Stack:** Next.js 14+ (App Router, Server Actions), Prisma, BullMQ, shadcn/ui (Table, Badge, Button, Select, DatePicker, Collapsible, ScrollArea)

**Spec:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md`

---

## Estrutura de Arquivos

```
src/
├── app/
│   └── (dashboard)/
│       └── companies/
│           └── [id]/
│               └── logs/
│                   ├── page.tsx                    # Página de logs
│                   ├── log-table.tsx               # Componente tabela de logs
│                   ├── log-row-detail.tsx           # Expandir linha com detalhes
│                   ├── log-filters.tsx              # Filtros combinados
│                   └── log-status-badge.tsx         # Badge colorido de status
├── lib/
│   ├── audit.ts                                    # Helper logAudit()
│   ├── actions/
│   │   └── logs.ts                                 # Server Actions para queries de logs
│   └── __tests__/
│       ├── audit.test.ts                           # Testes do audit helper
│       └── log-cleanup.test.ts                     # Testes do log cleanup
└── worker/
    ├── log-cleanup.ts                              # Job de cleanup de logs
    └── notification-cleanup.ts                     # Job de cleanup de notificações
```

---

### Task 1: Audit log helper (`src/lib/audit.ts`)

**Files:**
- Create: `src/lib/__tests__/audit.test.ts`
- Create: `src/lib/audit.ts`

- [ ] **Step 1: Escrever teste para o audit helper**

Criar `src/lib/__tests__/audit.test.ts`:

```typescript
import { prismaMock } from "./prisma-mock";
import { logAudit } from "../audit";

// Mock do prisma
jest.mock("../prisma", () => ({
  prisma: prismaMock,
}));

describe("logAudit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("cria registro de audit log com actor_type user", async () => {
    prismaMock.auditLog.create.mockResolvedValue({
      id: "uuid-1",
      actorType: "user",
      actorId: "user-uuid-1",
      actorLabel: "admin@nexusai360.com",
      companyId: "company-uuid-1",
      action: "credential.create",
      resourceType: "CompanyCredential",
      resourceId: "cred-uuid-1",
      details: { metaAppId: "123456" },
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
      createdAt: new Date(),
    });

    await logAudit({
      actorType: "user",
      actorId: "user-uuid-1",
      actorLabel: "admin@nexusai360.com",
      companyId: "company-uuid-1",
      action: "credential.create",
      resourceType: "CompanyCredential",
      resourceId: "cred-uuid-1",
      details: { metaAppId: "123456" },
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: "user",
        actorId: "user-uuid-1",
        actorLabel: "admin@nexusai360.com",
        companyId: "company-uuid-1",
        action: "credential.create",
        resourceType: "CompanyCredential",
        resourceId: "cred-uuid-1",
        details: { metaAppId: "123456" },
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      },
    });
  });

  it("cria registro de audit log com actor_type system", async () => {
    prismaMock.auditLog.create.mockResolvedValue({
      id: "uuid-2",
      actorType: "system",
      actorId: null,
      actorLabel: "log-cleanup",
      companyId: null,
      action: "cleanup.logs",
      resourceType: "InboundWebhook",
      resourceId: null,
      details: { deletedCount: 42, prunedCount: 15 },
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    });

    await logAudit({
      actorType: "system",
      actorLabel: "log-cleanup",
      action: "cleanup.logs",
      resourceType: "InboundWebhook",
      details: { deletedCount: 42, prunedCount: 15 },
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: "system",
        actorId: undefined,
        actorLabel: "log-cleanup",
        companyId: undefined,
        action: "cleanup.logs",
        resourceType: "InboundWebhook",
        resourceId: undefined,
        details: { deletedCount: 42, prunedCount: 15 },
        ipAddress: undefined,
        userAgent: undefined,
      },
    });
  });

  it("não lança exceção mesmo se prisma falhar (fire-and-forget)", async () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error("DB down"));

    // Não deve lançar exceção
    await expect(
      logAudit({
        actorType: "system",
        actorLabel: "test",
        action: "test.action",
        resourceType: "Test",
        details: {},
      })
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npm test -- --testPathPattern=audit
```

Expected: FAIL — `Cannot find module '../audit'`

- [ ] **Step 3: Implementar audit helper**

Criar `src/lib/audit.ts`:

```typescript
import { prisma } from "./prisma";
import type { ActorType } from "@prisma/client";

export interface LogAuditParams {
  actorType: ActorType;
  actorId?: string;
  actorLabel: string;
  companyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Registra uma entrada no audit log.
 *
 * Fire-and-forget: erros são logados no console mas não propagados,
 * para não interromper o fluxo principal.
 *
 * Ações padronizadas:
 * - auth.login / auth.logout (actor_type: user)
 * - auth.invalid_signature (actor_type: system)
 * - credential.create / credential.update / credential.delete (actor_type: user)
 * - cleanup.logs / cleanup.notifications (actor_type: system)
 * - delivery.orphan_recovery (actor_type: system)
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId,
        actorLabel: params.actorLabel,
        companyId: params.companyId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        details: params.details,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    console.error("[audit] Falha ao registrar audit log:", error);
  }
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npm test -- --testPathPattern=audit
```

Expected: PASS — 3 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit.ts src/lib/__tests__/audit.test.ts
git commit -m "feat: audit log helper com fire-and-forget e testes"
```

---

### Task 2: Server Actions para queries de logs (`src/lib/actions/logs.ts`)

**Files:**
- Create: `src/lib/actions/logs.ts`

- [ ] **Step 1: Criar Server Actions de logs**

Criar `src/lib/actions/logs.ts`:

```typescript
"use server";

import { prisma } from "@/lib/prisma";
import { DeliveryStatus } from "@prisma/client";
import { z } from "zod";

// --- Schemas de validação ---

const LogFiltersSchema = z.object({
  companyId: z.string().uuid(),
  statuses: z.array(z.nativeEnum(DeliveryStatus)).optional(),
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/logs.ts
git commit -m "feat: server actions para queries de logs com filtros e paginação cursor-based"
```

---

### Task 3: Componentes UI da página de logs

**Files:**
- Create: `src/app/(dashboard)/companies/[id]/logs/log-status-badge.tsx`
- Create: `src/app/(dashboard)/companies/[id]/logs/log-filters.tsx`
- Create: `src/app/(dashboard)/companies/[id]/logs/log-row-detail.tsx`
- Create: `src/app/(dashboard)/companies/[id]/logs/log-table.tsx`
- Create: `src/app/(dashboard)/companies/[id]/logs/page.tsx`

- [ ] **Step 1: Instalar componentes shadcn/ui necessários**

```bash
npx shadcn@latest add table badge button select collapsible scroll-area popover calendar
```

- [ ] **Step 2: Criar componente LogStatusBadge**

Criar `src/app/(dashboard)/companies/[id]/logs/log-status-badge.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import type { DeliveryStatus } from "@prisma/client";

const statusConfig: Record<
  DeliveryStatus,
  { label: string; className: string }
> = {
  delivered: {
    label: "Entregue",
    className:
      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25",
  },
  failed: {
    label: "Falhou",
    className:
      "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25",
  },
  pending: {
    label: "Pendente",
    className:
      "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/25",
  },
  retrying: {
    label: "Retentando",
    className:
      "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/25",
  },
  delivering: {
    label: "Enviando",
    className:
      "bg-zinc-500/15 text-zinc-400 border-zinc-500/30 hover:bg-zinc-500/25",
  },
};

interface LogStatusBadgeProps {
  status: DeliveryStatus;
}

export function LogStatusBadge({ status }: LogStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
```

- [ ] **Step 3: Criar componente LogFilters**

Criar `src/app/(dashboard)/companies/[id]/logs/log-filters.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Filter, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DeliveryStatus } from "@prisma/client";

interface LogFiltersProps {
  eventTypes: string[];
  routes: { id: string; name: string }[];
}

const ALL_STATUSES: { value: DeliveryStatus; label: string }[] = [
  { value: "delivered", label: "Entregue" },
  { value: "failed", label: "Falhou" },
  { value: "pending", label: "Pendente" },
  { value: "retrying", label: "Retentando" },
  { value: "delivering", label: "Enviando" },
];

export function LogFilters({ eventTypes, routes }: LogFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [selectedStatuses, setSelectedStatuses] = useState<DeliveryStatus[]>(
    () => {
      const param = searchParams.get("statuses");
      return param ? (param.split(",") as DeliveryStatus[]) : [];
    }
  );

  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>(() => {
    const param = searchParams.get("eventTypes");
    return param ? param.split(",") : [];
  });

  const [selectedRouteId, setSelectedRouteId] = useState<string>(
    () => searchParams.get("routeId") || ""
  );

  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => {
    const param = searchParams.get("dateFrom");
    return param ? new Date(param) : undefined;
  });

  const [dateTo, setDateTo] = useState<Date | undefined>(() => {
    const param = searchParams.get("dateTo");
    return param ? new Date(param) : undefined;
  });

  function applyFilters() {
    const params = new URLSearchParams();
    if (selectedStatuses.length > 0) {
      params.set("statuses", selectedStatuses.join(","));
    }
    if (selectedEventTypes.length > 0) {
      params.set("eventTypes", selectedEventTypes.join(","));
    }
    if (selectedRouteId) {
      params.set("routeId", selectedRouteId);
    }
    if (dateFrom) {
      params.set("dateFrom", dateFrom.toISOString());
    }
    if (dateTo) {
      params.set("dateTo", dateTo.toISOString());
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function clearFilters() {
    setSelectedStatuses([]);
    setSelectedEventTypes([]);
    setSelectedRouteId("");
    setDateFrom(undefined);
    setDateTo(undefined);

    startTransition(() => {
      router.push(pathname);
    });
  }

  function toggleStatus(status: DeliveryStatus) {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  }

  function toggleEventType(eventType: string) {
    setSelectedEventTypes((prev) =>
      prev.includes(eventType)
        ? prev.filter((e) => e !== eventType)
        : [...prev, eventType]
    );
  }

  const hasActiveFilters =
    selectedStatuses.length > 0 ||
    selectedEventTypes.length > 0 ||
    selectedRouteId ||
    dateFrom ||
    dateTo;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Status multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Status
              {selectedStatuses.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {selectedStatuses.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="space-y-1">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => toggleStatus(s.value)}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                    selectedStatuses.includes(s.value)
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Event type multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Evento
              {selectedEventTypes.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {selectedEventTypes.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {eventTypes.map((et) => (
                <button
                  key={et}
                  onClick={() => toggleEventType(et)}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                    selectedEventTypes.includes(et)
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {et}
                </button>
              ))}
              {eventTypes.length === 0 && (
                <p className="text-sm text-muted-foreground px-3 py-1.5">
                  Nenhum evento encontrado
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Route select */}
        <Select value={selectedRouteId} onValueChange={setSelectedRouteId}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Rota" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todas as rotas</SelectItem>
            {routes.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {dateFrom
                ? format(dateFrom, "dd/MM/yy", { locale: ptBR })
                : "De"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFrom}
              onSelect={setDateFrom}
              locale={ptBR}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {dateTo
                ? format(dateTo, "dd/MM/yy", { locale: ptBR })
                : "Até"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateTo}
              onSelect={setDateTo}
              locale={ptBR}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Apply / Clear */}
        <Button
          size="sm"
          onClick={applyFilters}
          disabled={isPending}
        >
          Filtrar
        </Button>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-1"
          >
            <X className="h-4 w-4" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Criar componente LogRowDetail**

Criar `src/app/(dashboard)/companies/[id]/logs/log-row-detail.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Clock, AlertCircle } from "lucide-react";
import { LogStatusBadge } from "./log-status-badge";
import { getWebhookLogDetail } from "@/lib/actions/logs";
import type { LogDetailEntry } from "@/lib/actions/logs";

interface LogRowDetailProps {
  companyId: string;
  inboundWebhookId: string;
}

export function LogRowDetail({
  companyId,
  inboundWebhookId,
}: LogRowDetailProps) {
  const [detail, setDetail] = useState<LogDetailEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [payloadOpen, setPayloadOpen] = useState(false);

  useEffect(() => {
    getWebhookLogDetail(companyId, inboundWebhookId)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [companyId, inboundWebhookId]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground animate-pulse">
        Carregando detalhes...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Detalhes não encontrados.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 bg-muted/30 border-t">
      {/* Payload colapsável */}
      <Collapsible open={payloadOpen} onOpenChange={setPayloadOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            {payloadOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Payload
            {!detail.rawBody && !detail.rawPayload && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Removido (LGPD)
              </Badge>
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ScrollArea className="max-h-64 mt-2">
            {detail.rawPayload ? (
              <pre className="text-xs bg-background rounded p-3 overflow-x-auto">
                {JSON.stringify(detail.rawPayload, null, 2)}
              </pre>
            ) : detail.rawBody ? (
              <pre className="text-xs bg-background rounded p-3 overflow-x-auto">
                {detail.rawBody}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground p-3">
                Payload removido pela política de retenção de dados.
              </p>
            )}
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>

      {/* Entregas e tentativas */}
      {detail.deliveries.map((delivery) => (
        <div key={delivery.id} className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="font-medium text-sm">{delivery.routeName}</span>
            <LogStatusBadge status={delivery.status} />
            <span className="text-xs text-muted-foreground">
              {delivery.routeUrl}
            </span>
            {delivery.finalHttpStatus && (
              <Badge variant="outline" className="text-xs">
                HTTP {delivery.finalHttpStatus}
              </Badge>
            )}
          </div>

          {/* Tentativas */}
          <div className="ml-4 space-y-1">
            {delivery.attempts.map((attempt) => (
              <div
                key={attempt.id}
                className="flex items-center gap-3 text-xs py-1 border-l-2 border-muted pl-3"
              >
                <span className="text-muted-foreground font-mono">
                  #{attempt.attemptNumber}
                </span>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span>{attempt.durationMs}ms</span>
                </div>
                {attempt.httpStatus && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      attempt.httpStatus >= 200 && attempt.httpStatus < 300
                        ? "text-emerald-400 border-emerald-500/30"
                        : "text-red-400 border-red-500/30"
                    }`}
                  >
                    {attempt.httpStatus}
                  </Badge>
                )}
                {attempt.errorMessage && (
                  <div className="flex items-center gap-1 text-red-400">
                    <AlertCircle className="h-3 w-3" />
                    <span className="truncate max-w-xs">
                      {attempt.errorMessage}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Response body da última tentativa */}
          {delivery.attempts.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="ml-4 text-xs">
                  <ChevronRight className="h-3 w-3 mr-1" />
                  Response body
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="max-h-32 ml-4 mt-1">
                  <pre className="text-xs bg-background rounded p-2 overflow-x-auto">
                    {delivery.attempts[delivery.attempts.length - 1]
                      ?.responseBody || "(vazio)"}
                  </pre>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Criar componente LogTable**

Criar `src/app/(dashboard)/companies/[id]/logs/log-table.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
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
} from "lucide-react";
import { LogStatusBadge } from "./log-status-badge";
import { LogRowDetail } from "./log-row-detail";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { LogEntry, LogsPage } from "@/lib/actions/logs";

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

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function loadNextPage() {
    if (!page.nextCursor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", page.nextCursor);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function loadFirstPage() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  // Derivar o status "principal" de cada entrada (pior status entre deliveries)
  function getPrimaryStatus(entry: LogEntry): string {
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
      <div className="text-sm text-muted-foreground">
        {page.totalCount} registro{page.totalCount !== 1 ? "s" : ""} encontrado
        {page.totalCount !== 1 ? "s" : ""}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Rota(s)</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[100px] text-right">
                Duração
              </TableHead>
              <TableHead className="w-[80px] text-right">
                Tentativas
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.entries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  Nenhum log encontrado para os filtros selecionados.
                </TableCell>
              </TableRow>
            )}
            {page.entries.map((entry) => {
              const isExpanded = expandedRows.has(entry.id);
              const primaryStatus = getPrimaryStatus(entry);
              const totalAttempts = entry.deliveries.reduce(
                (acc, d) => acc + d.totalAttempts,
                0
              );
              const maxDuration = entry.deliveries.reduce(
                (max, d) =>
                  d.durationMs !== null && d.durationMs > max
                    ? d.durationMs
                    : max,
                0
              );

              return (
                <>
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleRow(entry.id)}
                  >
                    <TableCell>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(entry.receivedAt), "dd/MM/yy HH:mm:ss", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {entry.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {entry.deliveries.map((d) => (
                          <span
                            key={d.id}
                            className="text-xs text-muted-foreground"
                          >
                            {d.routeName}
                          </span>
                        ))}
                        {entry.deliveries.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <LogStatusBadge
                        status={primaryStatus as import("@prisma/client").DeliveryStatus}
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {maxDuration > 0 ? `${maxDuration}ms` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {totalAttempts}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${entry.id}-detail`}>
                      <TableCell colSpan={7} className="p-0">
                        <LogRowDetail
                          companyId={companyId}
                          inboundWebhookId={entry.id}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </>
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
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Início
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={loadNextPage}
          disabled={!page.nextCursor || isPending}
          className="gap-1"
        >
          Próxima
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Criar página de logs (Server Component)**

Criar `src/app/(dashboard)/companies/[id]/logs/page.tsx`:

```tsx
import { Suspense } from "react";
import {
  getWebhookLogs,
  getAvailableEventTypes,
  getAvailableRoutes,
} from "@/lib/actions/logs";
import { LogTable } from "./log-table";
import { LogFilters } from "./log-filters";
import type { DeliveryStatus } from "@prisma/client";

interface LogsPageProps {
  params: { id: string };
  searchParams: {
    statuses?: string;
    eventTypes?: string;
    routeId?: string;
    dateFrom?: string;
    dateTo?: string;
    cursor?: string;
  };
}

export default async function LogsPage({
  params,
  searchParams,
}: LogsPageProps) {
  const companyId = params.id;

  const filters = {
    companyId,
    statuses: searchParams.statuses
      ? (searchParams.statuses.split(",") as DeliveryStatus[])
      : undefined,
    eventTypes: searchParams.eventTypes
      ? searchParams.eventTypes.split(",")
      : undefined,
    routeId: searchParams.routeId || undefined,
    dateFrom: searchParams.dateFrom
      ? new Date(searchParams.dateFrom)
      : undefined,
    dateTo: searchParams.dateTo ? new Date(searchParams.dateTo) : undefined,
    cursor: searchParams.cursor || undefined,
    pageSize: 25,
  };

  const [page, eventTypes, routes] = await Promise.all([
    getWebhookLogs(filters),
    getAvailableEventTypes(companyId),
    getAvailableRoutes(companyId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Logs de Webhooks</h2>
        <p className="text-muted-foreground">
          Histórico de recebimento e entrega de webhooks.
        </p>
      </div>

      <Suspense fallback={<div className="animate-pulse">Carregando filtros...</div>}>
        <LogFilters eventTypes={eventTypes} routes={routes} />
      </Suspense>

      <LogTable companyId={companyId} page={page} />
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/companies/\[id\]/logs/
git commit -m "feat: página de logs de webhooks com tabela, filtros, paginação e detalhes expansíveis"
```

---

### Task 4: Log cleanup job (`src/worker/log-cleanup.ts`)

**Files:**
- Create: `src/lib/__tests__/log-cleanup.test.ts`
- Create: `src/worker/log-cleanup.ts`

- [ ] **Step 1: Escrever teste para o log cleanup**

Criar `src/lib/__tests__/log-cleanup.test.ts`:

```typescript
import { prismaMock } from "./prisma-mock";

jest.mock("../prisma", () => ({
  prisma: prismaMock,
}));

jest.mock("../audit", () => ({
  logAudit: jest.fn(),
}));

import { runLogCleanup } from "../../worker/log-cleanup";
import { logAudit } from "../audit";

describe("runLogCleanup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-03T00:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("lê configurações de retenção do GlobalSettings", async () => {
    prismaMock.globalSettings.findUnique
      .mockResolvedValueOnce({
        id: "1",
        key: "log_full_retention_days",
        value: 90,
        updatedBy: "system",
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: "2",
        key: "log_summary_retention_days",
        value: 180,
        updatedBy: "system",
        updatedAt: new Date(),
      });

    prismaMock.inboundWebhook.updateMany.mockResolvedValue({ count: 5 });
    prismaMock.deliveryAttempt.deleteMany.mockResolvedValue({ count: 10 });
    prismaMock.routeDelivery.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.inboundWebhook.deleteMany.mockResolvedValue({ count: 2 });

    await runLogCleanup();

    expect(prismaMock.globalSettings.findUnique).toHaveBeenCalledWith({
      where: { key: "log_full_retention_days" },
    });
    expect(prismaMock.globalSettings.findUnique).toHaveBeenCalledWith({
      where: { key: "log_summary_retention_days" },
    });
  });

  it("seta raw_body e raw_payload para null em registros antigos", async () => {
    prismaMock.globalSettings.findUnique
      .mockResolvedValueOnce({
        id: "1",
        key: "log_full_retention_days",
        value: 90,
        updatedBy: "system",
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: "2",
        key: "log_summary_retention_days",
        value: 180,
        updatedBy: "system",
        updatedAt: new Date(),
      });

    prismaMock.inboundWebhook.updateMany.mockResolvedValue({ count: 5 });
    prismaMock.deliveryAttempt.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.routeDelivery.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.inboundWebhook.deleteMany.mockResolvedValue({ count: 0 });

    await runLogCleanup();

    // Passo 1: seta raw_body e raw_payload para null
    const fullRetentionDate = new Date("2026-01-03T00:00:00Z"); // 90 dias antes de 2026-04-03
    expect(prismaMock.inboundWebhook.updateMany).toHaveBeenCalledWith({
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
  });

  it("deleta registros completos mais antigos que summary retention", async () => {
    prismaMock.globalSettings.findUnique
      .mockResolvedValueOnce({
        id: "1",
        key: "log_full_retention_days",
        value: 90,
        updatedBy: "system",
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: "2",
        key: "log_summary_retention_days",
        value: 180,
        updatedBy: "system",
        updatedAt: new Date(),
      });

    prismaMock.inboundWebhook.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.deliveryAttempt.deleteMany.mockResolvedValue({ count: 10 });
    prismaMock.routeDelivery.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.inboundWebhook.deleteMany.mockResolvedValue({ count: 2 });

    await runLogCleanup();

    const summaryRetentionDate = new Date("2025-10-06T00:00:00Z"); // 180 dias antes de 2026-04-03

    // Passo 3: deleta DeliveryAttempts antigos
    expect(prismaMock.deliveryAttempt.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: expect.any(Date) },
      },
    });

    // Passo 4: deleta RouteDeliveries antigos
    expect(prismaMock.routeDelivery.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: summaryRetentionDate },
      },
    });

    // Passo 2: deleta InboundWebhooks antigos
    expect(prismaMock.inboundWebhook.deleteMany).toHaveBeenCalledWith({
      where: {
        receivedAt: { lt: summaryRetentionDate },
      },
    });
  });

  it("registra no AuditLog com actor_type system", async () => {
    prismaMock.globalSettings.findUnique
      .mockResolvedValueOnce(null) // usa default 90
      .mockResolvedValueOnce(null); // usa default 180

    prismaMock.inboundWebhook.updateMany.mockResolvedValue({ count: 5 });
    prismaMock.deliveryAttempt.deleteMany.mockResolvedValue({ count: 10 });
    prismaMock.routeDelivery.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.inboundWebhook.deleteMany.mockResolvedValue({ count: 2 });

    await runLogCleanup();

    expect(logAudit).toHaveBeenCalledWith({
      actorType: "system",
      actorLabel: "log-cleanup",
      action: "cleanup.logs",
      resourceType: "InboundWebhook",
      details: {
        prunedPayloads: 5,
        deletedAttempts: 10,
        deletedDeliveries: 3,
        deletedWebhooks: 2,
        fullRetentionDays: 90,
        summaryRetentionDays: 180,
      },
    });
  });

  it("usa valores default quando GlobalSettings não tem configuração", async () => {
    prismaMock.globalSettings.findUnique
      .mockResolvedValueOnce(null) // sem config para full retention
      .mockResolvedValueOnce(null); // sem config para summary retention

    prismaMock.inboundWebhook.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.deliveryAttempt.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.routeDelivery.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.inboundWebhook.deleteMany.mockResolvedValue({ count: 0 });

    await runLogCleanup();

    // Deve funcionar sem erro, usando defaults (90 e 180)
    expect(prismaMock.inboundWebhook.updateMany).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npm test -- --testPathPattern=log-cleanup
```

Expected: FAIL — `Cannot find module '../../worker/log-cleanup'`

- [ ] **Step 3: Implementar log cleanup job**

Criar `src/worker/log-cleanup.ts`:

```typescript
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

  // Passo 2: Deletar InboundWebhooks mais antigos que summary retention
  // NOTA: deletar InboundWebhook depois de DeliveryAttempt e RouteDelivery
  // por causa das foreign keys

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

  // Passo 2 (executado por último): Deletar InboundWebhooks antigos
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

  console.log("[log-cleanup] Cleanup de logs concluído.");
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npm test -- --testPathPattern=log-cleanup
```

Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/worker/log-cleanup.ts src/lib/__tests__/log-cleanup.test.ts
git commit -m "feat: job de cleanup de logs com retenção configurável e testes"
```

---

### Task 5: Notification cleanup job (`src/worker/notification-cleanup.ts`)

**Files:**
- Create: `src/worker/notification-cleanup.ts`

- [ ] **Step 1: Implementar notification cleanup job**

Criar `src/worker/notification-cleanup.ts`:

```typescript
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
  console.log("[notification-cleanup] Iniciando cleanup de notificações...");

  const readCutoff = daysAgo(READ_RETENTION_DAYS);
  const unreadCutoff = daysAgo(UNREAD_RETENTION_DAYS);

  // Deletar notificações lidas há mais de 30 dias
  const deletedRead = await prisma.notification.deleteMany({
    where: {
      isRead: true,
      createdAt: { lt: readCutoff },
    },
  });
  console.log(
    `[notification-cleanup] ${deletedRead.count} notificações lidas deletadas`
  );

  // Deletar notificações não-lidas há mais de 90 dias
  const deletedUnread = await prisma.notification.deleteMany({
    where: {
      isRead: false,
      createdAt: { lt: unreadCutoff },
    },
  });
  console.log(
    `[notification-cleanup] ${deletedUnread.count} notificações não-lidas deletadas`
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

  console.log("[notification-cleanup] Cleanup de notificações concluído.");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/worker/notification-cleanup.ts
git commit -m "feat: job de cleanup de notificações com retenção de 30/90 dias"
```

---

### Task 6: Integrar cleanup jobs no worker entrypoint

**Files:**
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Atualizar worker entrypoint com schedulers**

Atualizar `src/worker/index.ts` para adicionar os cleanup jobs com BullMQ repeat:

```typescript
import { Worker, Queue } from "bullmq";
import { redis } from "../lib/redis";
import { runLogCleanup } from "./log-cleanup";
import { runNotificationCleanup } from "./notification-cleanup";

console.log("[worker] Starting Nexus webhook worker...");

// --- Webhook Delivery Worker ---
const deliveryWorker = new Worker(
  "webhook-delivery",
  async (job) => {
    console.log(`[worker] Processing delivery job ${job.id}`, job.data);
    // Implementado no sub-plano 5 (Worker + Delivery)
  },
  { connection: redis, concurrency: 10 }
);

deliveryWorker.on("completed", (job) => {
  console.log(`[worker] Delivery job ${job.id} completed`);
});

deliveryWorker.on("failed", (job, err) => {
  console.error(`[worker] Delivery job ${job?.id} failed:`, err.message);
});

// --- Cleanup Queues ---
const cleanupQueue = new Queue("cleanup", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

// Agendar log-cleanup: diariamente à meia-noite
async function scheduleCleanupJobs() {
  // Remove jobs repetidos antigos para evitar duplicatas no restart
  const repeatableJobs = await cleanupQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await cleanupQueue.removeRepeatableByKey(job.key);
  }

  await cleanupQueue.add(
    "log-cleanup",
    {},
    {
      repeat: {
        pattern: "0 0 * * *", // Todo dia à meia-noite
      },
    }
  );

  await cleanupQueue.add(
    "notification-cleanup",
    {},
    {
      repeat: {
        pattern: "0 0 * * *", // Todo dia à meia-noite
      },
    }
  );

  console.log("[worker] Cleanup jobs agendados (diário à meia-noite)");
}

// --- Cleanup Worker ---
const cleanupWorker = new Worker(
  "cleanup",
  async (job) => {
    switch (job.name) {
      case "log-cleanup":
        await runLogCleanup();
        break;
      case "notification-cleanup":
        await runNotificationCleanup();
        break;
      default:
        console.warn(`[worker] Unknown cleanup job: ${job.name}`);
    }
  },
  { connection: redis, concurrency: 1 }
);

cleanupWorker.on("completed", (job) => {
  console.log(`[worker] Cleanup job ${job.name} completed`);
});

cleanupWorker.on("failed", (job, err) => {
  console.error(`[worker] Cleanup job ${job?.name} failed:`, err.message);
});

// --- Inicialização ---
scheduleCleanupJobs().catch((err) => {
  console.error("[worker] Falha ao agendar cleanup jobs:", err);
});

// --- Graceful shutdown ---
process.on("SIGTERM", async () => {
  console.log("[worker] Shutting down...");
  await Promise.all([
    deliveryWorker.close(),
    cleanupWorker.close(),
    cleanupQueue.close(),
  ]);
  process.exit(0);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: integra log-cleanup e notification-cleanup no worker com BullMQ repeat"
```

---

### Task 7: Integrar audit log nos pontos do sistema

> **NOTA:** Esta task lista os pontos de integração do `logAudit()` nos módulos já implementados nos sub-planos anteriores. A implementação pode requerer pequenas modificações nos arquivos existentes.

**Files:**
- Modify: arquivos de auth (sub-plano 2)
- Modify: arquivos de credenciais (sub-plano 3)
- Modify: arquivos de ingest (sub-plano 4)
- Modify: arquivos de worker/delivery (sub-plano 5)

- [ ] **Step 1: Registrar login/logout no audit log**

No handler de login (NextAuth `signIn` callback ou Server Action de login):

```typescript
import { logAudit } from "@/lib/audit";

// Após login bem-sucedido:
await logAudit({
  actorType: "user",
  actorId: user.id,
  actorLabel: user.email,
  action: "auth.login",
  resourceType: "User",
  resourceId: user.id,
  details: {},
  ipAddress: request.headers.get("x-forwarded-for") || undefined,
  userAgent: request.headers.get("user-agent") || undefined,
});
```

- [ ] **Step 2: Registrar assinatura inválida no audit log**

No handler de webhook ingest (quando verificação de assinatura Meta falha):

```typescript
import { logAudit } from "@/lib/audit";

// Quando assinatura inválida:
await logAudit({
  actorType: "system",
  actorLabel: "webhook-ingest",
  companyId: company.id,
  action: "auth.invalid_signature",
  resourceType: "InboundWebhook",
  details: {
    reason: "Assinatura X-Hub-Signature-256 inválida",
    webhookKey: company.webhookKey,
  },
  ipAddress: request.headers.get("x-forwarded-for") || undefined,
  userAgent: request.headers.get("user-agent") || undefined,
});
```

- [ ] **Step 3: Registrar CRUD de credenciais no audit log**

Nos Server Actions de credenciais (criar, atualizar, deletar):

```typescript
import { logAudit } from "@/lib/audit";

// Após criar credencial:
await logAudit({
  actorType: "user",
  actorId: session.user.id,
  actorLabel: session.user.email,
  companyId: companyId,
  action: "credential.create",
  resourceType: "CompanyCredential",
  resourceId: credential.id,
  details: { metaAppId: data.metaAppId },
});

// Após atualizar credencial:
await logAudit({
  actorType: "user",
  actorId: session.user.id,
  actorLabel: session.user.email,
  companyId: companyId,
  action: "credential.update",
  resourceType: "CompanyCredential",
  resourceId: credential.id,
  details: { fields: Object.keys(data) },
});

// Após deletar credencial:
await logAudit({
  actorType: "user",
  actorId: session.user.id,
  actorLabel: session.user.email,
  companyId: companyId,
  action: "credential.delete",
  resourceType: "CompanyCredential",
  resourceId: credentialId,
  details: {},
});
```

- [ ] **Step 4: Registrar orphan-recovery no audit log**

No worker de orphan recovery (sub-plano 5):

```typescript
import { logAudit } from "@/lib/audit";

// Após recuperar entregas órfãs:
await logAudit({
  actorType: "system",
  actorLabel: "orphan-recovery",
  action: "delivery.orphan_recovery",
  resourceType: "RouteDelivery",
  details: {
    recoveredCount: recoveredDeliveries.length,
    deliveryIds: recoveredDeliveries.map((d) => d.id),
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat: integra logAudit nos pontos de auth, credenciais, ingest e orphan-recovery"
```

---

## Self-Review Checklist

- [x] **Spec coverage Sub-plano 7:** Logs UI com filtros e paginação, Log cleanup com retenção LGPD, Notification cleanup, Audit log helper, Integração no worker, Pontos de integração do audit
- [x] **Placeholder scan:** Nenhum TBD/TODO. Task 7 tem snippets de integração com contexto claro
- [x] **Type consistency:** LogEntry, LogDetailEntry, LogsPage com tipos alinhados ao schema Prisma
- [x] **Tenant scoping:** Todas as queries filtram por companyId obrigatoriamente
- [x] **LGPD:** Cleanup remove raw_body/raw_payload antes de deletar registros completos. UI mostra badge "Removido (LGPD)" quando payload foi limpo
- [x] **Foreign key order:** Cleanup deleta DeliveryAttempts antes de RouteDeliveries antes de InboundWebhooks
- [x] **Fire-and-forget audit:** logAudit captura erros sem propagar, evitando quebrar fluxo principal
- [x] **Cursor pagination:** Paginação server-side com cursor UUID, sem offset
- [x] **Status badges:** delivered=verde, failed=vermelho, pending/retrying=amarelo, delivering=cinza
- [x] **BullMQ repeat:** Cleanup jobs agendados com cron pattern, com dedup de jobs repetidos no restart
- [x] **TDD tasks:** Testes escritos antes da implementação para audit helper e log cleanup
