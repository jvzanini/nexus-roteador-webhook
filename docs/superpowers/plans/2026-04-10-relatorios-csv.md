# Relatórios CSV — Plano de Implementação (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar `/relatorios` com exportação CSV de logs, empresas, rotas e usuários, com permissões em 3 camadas, rate limit Redis, streaming HTTP, proteção anti-formula-injection, todos os filtros do spec e UI DRY.

**Architecture:** Server component lista blocos por tipo; cada tipo tem um gerador `async iterable` streamado via `ReadableStream` em `/api/reports/[type]`. Geradores reusam `tenant.ts`. Rate limit via `ioredis`. Client usa hook compartilhado `useReportEstimate` + componente base `ReportBlock` para DRY. Server actions existentes (`getAvailableEventTypes`, `getAvailableRoutes`) alimentam selects dinâmicos.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma v7 (`@/generated/prisma/client`), Jest, ioredis, zod, shadcn/ui (`CustomSelect`, `Button`, `Card`, `Input`), Tailwind, Framer Motion.

**Spec:** `docs/superpowers/specs/2026-04-10-relatorios-csv-design.md`

**Fatos verificados no código existente:**
- `Company.logoUrl` sempre URL (`zod.url()`) — exportação segura
- `middleware.ts` cobre `/api/reports` — auth aplicada em todos os requests
- `getAvailableEventTypes(companyId)` e `getAvailableRoutes(companyId)` já existem e são chamáveis de client components
- `CustomSelect` usa `onChange`, não `onValueChange`
- `SelectOption` = `{ value: string; label: string; description?: string; icon?: ReactNode }`
- Testes usam Jest + `describe/it/expect`

---

## Estrutura de arquivos

```
src/app/(protected)/relatorios/
  page.tsx                       # server: auth + role + lista empresas
  reports-content.tsx            # client: monta os blocos

src/app/api/reports/
  [type]/route.ts                # GET streaming CSV
  [type]/count/route.ts          # GET estimativa

src/lib/reports/
  csv.ts                         # escape + formula guard + BOM
  types.ts                       # tipos compartilhados
  filters.ts                     # schemas zod
  rate-limit.ts                  # Redis SET NX EX
  authorize.ts                   # role × type permissions
  estimate.ts                    # count + bytes
  generators/
    companies.ts
    routes.ts
    users.ts
    logs.ts

src/lib/reports/__tests__/
  csv.test.ts
  filters.test.ts
  authorize.test.ts

src/components/reports/
  use-report-estimate.ts         # hook compartilhado
  report-block.tsx               # componente base (DRY)
```

---

### Task 1: CSV helper + testes unitários

**Files:**
- Create: `src/lib/reports/csv.ts`
- Create: `src/lib/reports/__tests__/csv.test.ts`

- [ ] **Step 1: Escrever os testes primeiro**

```typescript
// src/lib/reports/__tests__/csv.test.ts
import { escapeCsvCell, buildCsvRow, CSV_BOM } from "../csv";

describe("escapeCsvCell", () => {
  it("retorna string vazia para null/undefined", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("retorna valor simples sem aspas", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
  });

  it("envolve em aspas e duplica aspas internas (RFC 4180)", () => {
    expect(escapeCsvCell('contém "aspas"')).toBe('"contém ""aspas"""');
  });

  it("envolve em aspas quando tem vírgula", () => {
    expect(escapeCsvCell("a, b, c")).toBe('"a, b, c"');
  });

  it("envolve em aspas quando tem quebra de linha", () => {
    expect(escapeCsvCell("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });

  it("previne CSV formula injection prefixando com aspa simples", () => {
    expect(escapeCsvCell("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(escapeCsvCell("+cmd|calc")).toBe("'+cmd|calc");
    expect(escapeCsvCell("-1+1")).toBe("'-1+1");
    expect(escapeCsvCell("@import")).toBe("'@import");
    expect(escapeCsvCell("\tfoo")).toBe("'\tfoo");
    expect(escapeCsvCell("\rfoo")).toBe("'\rfoo");
  });

  it("aplica formula guard antes do escape de aspas", () => {
    expect(escapeCsvCell('=HYPERLINK("x","y")')).toBe(
      `"'=HYPERLINK(""x"",""y"")"`
    );
  });

  it("serializa números", () => {
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(3.14)).toBe("3.14");
  });

  it("serializa booleans", () => {
    expect(escapeCsvCell(true)).toBe("true");
    expect(escapeCsvCell(false)).toBe("false");
  });
});

describe("buildCsvRow", () => {
  it("junta células com vírgula e termina em CRLF", () => {
    expect(buildCsvRow(["a", "b", "c"])).toBe("a,b,c\r\n");
  });

  it("aplica escape em cada célula", () => {
    expect(buildCsvRow(["a", "b, c", '"d"'])).toBe('a,"b, c","""d"""\r\n');
  });

  it("aceita valores mistos (texto, número, null, undefined, bool)", () => {
    expect(buildCsvRow(["texto", 42, null, undefined, true])).toBe(
      "texto,42,,,true\r\n"
    );
  });
});

describe("CSV_BOM", () => {
  it("é o BOM UTF-8", () => {
    expect(CSV_BOM).toBe("\uFEFF");
  });
});
```

- [ ] **Step 2: Rodar testes para ver falhando**

Run: `npm test -- csv.test.ts`
Expected: FAIL — `Cannot find module '../csv'`

- [ ] **Step 3: Implementar o helper**

```typescript
// src/lib/reports/csv.ts
/**
 * Helpers de serialização CSV com:
 * - Escape RFC 4180 (aspas, vírgulas, quebras de linha)
 * - Proteção contra CSV Formula Injection (CWE-1236)
 * - BOM UTF-8 para compatibilidade com Excel BR
 */

export const CSV_BOM = "\uFEFF";

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let str = typeof value === "string" ? value : String(value);

  if (str.length > 0 && FORMULA_TRIGGERS.has(str[0])) {
    str = "'" + str;
  }

  const needsQuoting =
    str.includes(",") || str.includes('"') || str.includes("\n");

  if (needsQuoting) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function buildCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(",") + "\r\n";
}
```

- [ ] **Step 4: Rodar testes e verificar que passam**

Run: `npm test -- csv.test.ts`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/csv.ts src/lib/reports/__tests__/csv.test.ts
git commit -m "feat(reports): helper CSV com escape RFC 4180 e guard anti-formula-injection"
```

---

### Task 2: Tipos compartilhados

**Files:**
- Create: `src/lib/reports/types.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/reports/types.ts
import type { DeliveryStatus } from "@/generated/prisma/client";

export type ReportType = "logs" | "companies" | "routes" | "users";

export const REPORT_TYPES: ReportType[] = [
  "logs",
  "companies",
  "routes",
  "users",
];

export type AccessScope = string[] | undefined;

export interface LogsFilters {
  dateFrom: Date;
  dateTo: Date;
  companyId?: string;
  routeId?: string;
  statuses?: DeliveryStatus[];
  eventTypes?: string[];
}

export interface CompaniesFilters {
  // sem filtros no v1
}

export interface RoutesFilters {
  companyId?: string;
}

export interface UsersFilters {
  platformRole?: "super_admin" | "admin" | "manager" | "viewer";
}

export interface EstimateResult {
  count: number;
  estimatedBytes: number;
}

export const AVG_BYTES_PER_ROW: Record<ReportType, number> = {
  logs: 250,
  companies: 200,
  routes: 180,
  users: 220,
};

export const MAX_ROWS_PER_EXPORT = 50_000;
export const MAX_DAYS_LOGS = 90;
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/types.ts
git commit -m "feat(reports): tipos compartilhados"
```

---

### Task 3: Schemas zod de filtros + testes

**Files:**
- Create: `src/lib/reports/filters.ts`
- Create: `src/lib/reports/__tests__/filters.test.ts`

- [ ] **Step 1: Escrever os testes primeiro**

```typescript
// src/lib/reports/__tests__/filters.test.ts
import {
  LogsFiltersSchema,
  CompaniesFiltersSchema,
  RoutesFiltersSchema,
  UsersFiltersSchema,
  parseFiltersFromSearchParams,
} from "../filters";

describe("LogsFiltersSchema", () => {
  const base = {
    dateFrom: "2026-01-01T00:00:00Z",
    dateTo: "2026-01-31T23:59:59Z",
  };

  it("aceita range válido dentro de 90 dias", () => {
    expect(() => LogsFiltersSchema.parse(base)).not.toThrow();
  });

  it("rejeita dateFrom > dateTo", () => {
    expect(() =>
      LogsFiltersSchema.parse({
        dateFrom: "2026-02-01",
        dateTo: "2026-01-01",
      })
    ).toThrow();
  });

  it("rejeita range maior que 90 dias", () => {
    expect(() =>
      LogsFiltersSchema.parse({
        dateFrom: "2026-01-01",
        dateTo: "2026-05-01", // ~120 dias
      })
    ).toThrow(/90 dias/);
  });

  it("aceita companyId UUID opcional", () => {
    expect(() =>
      LogsFiltersSchema.parse({
        ...base,
        companyId: "550e8400-e29b-41d4-a716-446655440000",
      })
    ).not.toThrow();
  });

  it("rejeita companyId não-UUID", () => {
    expect(() =>
      LogsFiltersSchema.parse({ ...base, companyId: "xyz" })
    ).toThrow();
  });

  it("aceita array de statuses válidos", () => {
    expect(() =>
      LogsFiltersSchema.parse({
        ...base,
        statuses: ["delivered", "failed"],
      })
    ).not.toThrow();
  });

  it("rejeita status inválido", () => {
    expect(() =>
      LogsFiltersSchema.parse({ ...base, statuses: ["foo"] as any })
    ).toThrow();
  });
});

describe("CompaniesFiltersSchema", () => {
  it("aceita objeto vazio", () => {
    expect(() => CompaniesFiltersSchema.parse({})).not.toThrow();
  });
});

describe("RoutesFiltersSchema", () => {
  it("aceita sem filtros", () => {
    expect(() => RoutesFiltersSchema.parse({})).not.toThrow();
  });

  it("aceita companyId UUID", () => {
    expect(() =>
      RoutesFiltersSchema.parse({
        companyId: "550e8400-e29b-41d4-a716-446655440000",
      })
    ).not.toThrow();
  });
});

describe("UsersFiltersSchema", () => {
  it("aceita sem filtros", () => {
    expect(() => UsersFiltersSchema.parse({})).not.toThrow();
  });

  it("aceita platformRole válido", () => {
    expect(() =>
      UsersFiltersSchema.parse({ platformRole: "admin" })
    ).not.toThrow();
  });

  it("rejeita platformRole inválido", () => {
    expect(() =>
      UsersFiltersSchema.parse({ platformRole: "root" } as any)
    ).toThrow();
  });
});

describe("parseFiltersFromSearchParams", () => {
  it("parseia logs com todos os filtros", () => {
    const params = new URLSearchParams(
      "dateFrom=2026-01-01&dateTo=2026-01-31&companyId=550e8400-e29b-41d4-a716-446655440000&statuses=delivered,failed&eventTypes=messages,statuses"
    );
    const result = parseFiltersFromSearchParams("logs", params) as any;
    expect(result.dateFrom).toBe("2026-01-01");
    expect(result.dateTo).toBe("2026-01-31");
    expect(result.statuses).toEqual(["delivered", "failed"]);
    expect(result.eventTypes).toEqual(["messages", "statuses"]);
  });

  it("parseia companies como objeto vazio", () => {
    expect(parseFiltersFromSearchParams("companies", new URLSearchParams())).toEqual({});
  });

  it("retorna null para tipo inválido", () => {
    expect(parseFiltersFromSearchParams("foo", new URLSearchParams())).toBeNull();
  });
});
```

- [ ] **Step 2: Criar o filters.ts**

```typescript
// src/lib/reports/filters.ts
import { z } from "zod";
import { MAX_DAYS_LOGS } from "./types";

const DeliveryStatusEnum = z.enum([
  "pending",
  "delivering",
  "delivered",
  "retrying",
  "failed",
]);

const PlatformRoleEnum = z.enum([
  "super_admin",
  "admin",
  "manager",
  "viewer",
]);

export const LogsFiltersSchema = z
  .object({
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
    companyId: z.string().uuid().optional(),
    routeId: z.string().uuid().optional(),
    statuses: z.array(DeliveryStatusEnum).optional(),
    eventTypes: z.array(z.string()).optional(),
  })
  .refine((d) => d.dateFrom <= d.dateTo, {
    message: "dateFrom deve ser anterior ou igual a dateTo",
  })
  .refine(
    (d) => {
      const diffMs = d.dateTo.getTime() - d.dateFrom.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays <= MAX_DAYS_LOGS;
    },
    { message: `Intervalo máximo de ${MAX_DAYS_LOGS} dias por export` }
  );

export const CompaniesFiltersSchema = z.object({});

export const RoutesFiltersSchema = z.object({
  companyId: z.string().uuid().optional(),
});

export const UsersFiltersSchema = z.object({
  platformRole: PlatformRoleEnum.optional(),
});

export function parseFiltersFromSearchParams(
  type: string,
  params: URLSearchParams
): unknown {
  const getArray = (key: string): string[] | undefined => {
    const v = params.get(key);
    return v ? v.split(",").filter(Boolean) : undefined;
  };

  switch (type) {
    case "logs":
      return {
        dateFrom: params.get("dateFrom"),
        dateTo: params.get("dateTo"),
        companyId: params.get("companyId") || undefined,
        routeId: params.get("routeId") || undefined,
        statuses: getArray("statuses"),
        eventTypes: getArray("eventTypes"),
      };
    case "companies":
      return {};
    case "routes":
      return { companyId: params.get("companyId") || undefined };
    case "users":
      return { platformRole: params.get("platformRole") || undefined };
    default:
      return null;
  }
}
```

- [ ] **Step 3: Rodar testes**

Run: `npm test -- filters.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/reports/filters.ts src/lib/reports/__tests__/filters.test.ts
git commit -m "feat(reports): schemas zod de filtros + testes (90d limit, validação)"
```

---

### Task 4: Rate limit via Redis

**Files:**
- Create: `src/lib/reports/rate-limit.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/reports/rate-limit.ts
import { redis } from "@/lib/redis";

const EXPORT_LOCK_TTL_SECONDS = 300;

function keyFor(userId: string): string {
  return `report:export:${userId}`;
}

export async function acquireExportLock(userId: string): Promise<boolean> {
  const result = await redis.set(
    keyFor(userId),
    "1",
    "EX",
    EXPORT_LOCK_TTL_SECONDS,
    "NX"
  );
  return result === "OK";
}

export async function releaseExportLock(userId: string): Promise<void> {
  await redis.del(keyFor(userId));
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/rate-limit.ts
git commit -m "feat(reports): rate limit de export via Redis SET NX EX"
```

---

### Task 5: Autorização por role × tipo + testes

**Files:**
- Create: `src/lib/reports/authorize.ts`
- Create: `src/lib/reports/__tests__/authorize.test.ts`

- [ ] **Step 1: Escrever os testes primeiro**

```typescript
// src/lib/reports/__tests__/authorize.test.ts
import {
  canAccessReportType,
  listAccessibleReportTypes,
  canAccessReportsPage,
} from "../authorize";

describe("canAccessReportsPage", () => {
  it.each([
    ["super_admin", true],
    ["admin", true],
    ["manager", true],
    ["viewer", false],
    ["unknown", false],
  ])("%s → %s", (role, expected) => {
    expect(canAccessReportsPage(role)).toBe(expected);
  });
});

describe("canAccessReportType", () => {
  it("super_admin acessa todos os tipos", () => {
    for (const type of ["logs", "companies", "routes", "users"] as const) {
      expect(canAccessReportType("super_admin", type)).toBe(true);
    }
  });

  it("admin acessa todos os tipos", () => {
    for (const type of ["logs", "companies", "routes", "users"] as const) {
      expect(canAccessReportType("admin", type)).toBe(true);
    }
  });

  it("manager acessa logs, companies, routes mas NÃO users", () => {
    expect(canAccessReportType("manager", "logs")).toBe(true);
    expect(canAccessReportType("manager", "companies")).toBe(true);
    expect(canAccessReportType("manager", "routes")).toBe(true);
    expect(canAccessReportType("manager", "users")).toBe(false);
  });

  it("viewer não acessa nada", () => {
    for (const type of ["logs", "companies", "routes", "users"] as const) {
      expect(canAccessReportType("viewer", type)).toBe(false);
    }
  });
});

describe("listAccessibleReportTypes", () => {
  it("super_admin vê 4 tipos", () => {
    expect(listAccessibleReportTypes("super_admin")).toHaveLength(4);
  });

  it("admin vê 4 tipos", () => {
    expect(listAccessibleReportTypes("admin")).toHaveLength(4);
  });

  it("manager vê 3 tipos (sem users)", () => {
    const types = listAccessibleReportTypes("manager");
    expect(types).toHaveLength(3);
    expect(types).not.toContain("users");
  });

  it("viewer vê 0 tipos", () => {
    expect(listAccessibleReportTypes("viewer")).toEqual([]);
  });
});
```

- [ ] **Step 2: Criar o authorize.ts**

```typescript
// src/lib/reports/authorize.ts
import type { ReportType } from "./types";

export function canAccessReportType(
  platformRole: string,
  type: ReportType
): boolean {
  if (platformRole === "super_admin" || platformRole === "admin") {
    return true;
  }
  if (platformRole === "manager") {
    return type !== "users";
  }
  return false;
}

export function listAccessibleReportTypes(
  platformRole: string
): ReportType[] {
  const all: ReportType[] = ["logs", "companies", "routes", "users"];
  return all.filter((t) => canAccessReportType(platformRole, t));
}

export function canAccessReportsPage(platformRole: string): boolean {
  return (
    platformRole === "super_admin" ||
    platformRole === "admin" ||
    platformRole === "manager"
  );
}
```

- [ ] **Step 3: Rodar testes**

Run: `npm test -- authorize.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/reports/authorize.ts src/lib/reports/__tests__/authorize.test.ts
git commit -m "feat(reports): matriz de autorização role × tipo + testes"
```

---

### Task 6: Gerador de Empresas

**Files:**
- Create: `src/lib/reports/generators/companies.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/reports/generators/companies.ts
import { prisma } from "@/lib/prisma";
import { MAX_ROWS_PER_EXPORT } from "../types";
import type { AccessScope, CompaniesFilters } from "../types";

function toIso(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "");
}

export const COMPANIES_HEADERS = [
  "Nome",
  "Slug",
  "Webhook key",
  "Status",
  "Logo URL",
  "Data de criação",
  "Total de rotas",
  "Total de membros",
];

export async function* generateCompanies(
  _filters: CompaniesFilters,
  scope: AccessScope
): AsyncIterable<unknown[]> {
  yield COMPANIES_HEADERS;

  const where = scope === undefined ? {} : { id: { in: scope } };

  const companies = await prisma.company.findMany({
    where,
    take: MAX_ROWS_PER_EXPORT,
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      slug: true,
      webhookKey: true,
      isActive: true,
      logoUrl: true,
      createdAt: true,
      _count: {
        select: { routes: true, memberships: true },
      },
    },
  });

  for (const c of companies) {
    yield [
      c.name,
      c.slug,
      c.webhookKey,
      c.isActive ? "ativa" : "inativa",
      c.logoUrl ?? "",
      toIso(c.createdAt),
      c._count.routes,
      c._count.memberships,
    ];
  }
}

export async function countCompanies(
  _filters: CompaniesFilters,
  scope: AccessScope
): Promise<number> {
  const where = scope === undefined ? {} : { id: { in: scope } };
  return prisma.company.count({ where });
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/generators/companies.ts
git commit -m "feat(reports): gerador de empresas"
```

---

### Task 7: Gerador de Rotas

**Files:**
- Create: `src/lib/reports/generators/routes.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/reports/generators/routes.ts
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
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/generators/routes.ts
git commit -m "feat(reports): gerador de rotas"
```

---

### Task 8: Gerador de Usuários

**Files:**
- Create: `src/lib/reports/generators/users.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/reports/generators/users.ts
import { prisma } from "@/lib/prisma";
import { MAX_ROWS_PER_EXPORT } from "../types";
import type { AccessScope, UsersFilters } from "../types";

function toIso(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "");
}

export const USERS_HEADERS = [
  "Nome",
  "E-mail",
  "Platform role",
  "Super admin",
  "Status",
  "Empresas vinculadas",
  "Data de criação",
];

function formatMemberships(
  memberships: { role: string; company: { id: string; name: string } }[],
  scope: AccessScope
): string {
  const visible =
    scope === undefined
      ? memberships
      : memberships.filter((m) => scope.includes(m.company.id));
  return visible.map((m) => `${m.company.name} (${m.role})`).join("; ");
}

function buildWhere(
  filters: UsersFilters,
  scope: AccessScope
): Record<string, any> {
  const where: Record<string, any> = {};
  if (filters.platformRole) {
    where.platformRole = filters.platformRole;
  }
  if (scope !== undefined) {
    where.memberships = {
      some: { companyId: { in: scope }, isActive: true },
    };
  }
  return where;
}

export async function* generateUsers(
  filters: UsersFilters,
  scope: AccessScope
): AsyncIterable<unknown[]> {
  yield USERS_HEADERS;

  const users = await prisma.user.findMany({
    where: buildWhere(filters, scope),
    take: MAX_ROWS_PER_EXPORT,
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      email: true,
      platformRole: true,
      isSuperAdmin: true,
      isActive: true,
      createdAt: true,
      memberships: {
        where: { isActive: true },
        select: {
          role: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  });

  for (const u of users) {
    yield [
      u.name,
      u.email,
      u.platformRole,
      u.isSuperAdmin ? "sim" : "não",
      u.isActive ? "ativo" : "inativo",
      formatMemberships(u.memberships, scope),
      toIso(u.createdAt),
    ];
  }
}

export async function countUsers(
  filters: UsersFilters,
  scope: AccessScope
): Promise<number> {
  return prisma.user.count({ where: buildWhere(filters, scope) });
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/generators/users.ts
git commit -m "feat(reports): gerador de usuários com filtragem de memberships por scope"
```

---

### Task 9: Gerador de Logs

Gerador complexo. Ordenação por `id desc` (estável) em vez de `createdAt desc` — evita leaks de paginação em casos de timestamps duplicados.

**Files:**
- Create: `src/lib/reports/generators/logs.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/reports/generators/logs.ts
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
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/generators/logs.ts
git commit -m "feat(reports): gerador de logs (batches 500, cursor estável por id)"
```

---

### Task 10: Helper de estimativa

**Files:**
- Create: `src/lib/reports/estimate.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/reports/estimate.ts
import { AVG_BYTES_PER_ROW } from "./types";
import type { AccessScope, EstimateResult, ReportType } from "./types";
import { countCompanies } from "./generators/companies";
import { countRoutes } from "./generators/routes";
import { countUsers } from "./generators/users";
import { countLogs } from "./generators/logs";

export async function estimateReport(
  type: ReportType,
  filters: unknown,
  scope: AccessScope
): Promise<EstimateResult> {
  let count = 0;

  switch (type) {
    case "companies":
      count = await countCompanies(filters as any, scope);
      break;
    case "routes":
      count = await countRoutes(filters as any, scope);
      break;
    case "users":
      count = await countUsers(filters as any, scope);
      break;
    case "logs":
      count = await countLogs(filters as any, scope);
      break;
  }

  return {
    count,
    estimatedBytes: count * AVG_BYTES_PER_ROW[type],
  };
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/estimate.ts
git commit -m "feat(reports): helper de estimativa unificado"
```

---

### Task 11: API route — count endpoint

**Files:**
- Create: `src/app/api/reports/[type]/count/route.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/app/api/reports/[type]/count/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getAccessibleCompanyIds } from "@/lib/tenant";
import {
  LogsFiltersSchema,
  CompaniesFiltersSchema,
  RoutesFiltersSchema,
  UsersFiltersSchema,
  parseFiltersFromSearchParams,
} from "@/lib/reports/filters";
import { estimateReport } from "@/lib/reports/estimate";
import {
  canAccessReportType,
  canAccessReportsPage,
} from "@/lib/reports/authorize";
import { REPORT_TYPES, type ReportType } from "@/lib/reports/types";

const SCHEMAS = {
  logs: LogsFiltersSchema,
  companies: CompaniesFiltersSchema,
  routes: RoutesFiltersSchema,
  users: UsersFiltersSchema,
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  if (!REPORT_TYPES.includes(type as ReportType)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const user = session.user as any;
  const platformRole = user.platformRole ?? "viewer";

  if (!canAccessReportsPage(platformRole)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  if (!canAccessReportType(platformRole, type as ReportType)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const schema = SCHEMAS[type as ReportType];
  const rawFilters = parseFiltersFromSearchParams(
    type,
    request.nextUrl.searchParams
  );

  let filters: unknown;
  try {
    filters = schema.parse(rawFilters);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Filtros inválidos", details: err.issues },
        { status: 400 }
      );
    }
    throw err;
  }

  const scope = await getAccessibleCompanyIds({
    id: user.id,
    isSuperAdmin: user.isSuperAdmin ?? false,
  });

  try {
    const estimate = await estimateReport(type as ReportType, filters, scope);
    return NextResponse.json(estimate);
  } catch (err) {
    console.error(`[reports:${type}] count error:`, err);
    return NextResponse.json(
      { error: "Erro ao calcular estimativa" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/reports/[type]/count/route.ts"
git commit -m "feat(reports): endpoint GET /api/reports/[type]/count"
```

---

### Task 12: API route — streaming download

**Files:**
- Create: `src/app/api/reports/[type]/route.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/app/api/reports/[type]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getAccessibleCompanyIds } from "@/lib/tenant";
import {
  LogsFiltersSchema,
  CompaniesFiltersSchema,
  RoutesFiltersSchema,
  UsersFiltersSchema,
  parseFiltersFromSearchParams,
} from "@/lib/reports/filters";
import { CSV_BOM, buildCsvRow } from "@/lib/reports/csv";
import {
  canAccessReportType,
  canAccessReportsPage,
} from "@/lib/reports/authorize";
import {
  acquireExportLock,
  releaseExportLock,
} from "@/lib/reports/rate-limit";
import {
  REPORT_TYPES,
  type ReportType,
  type AccessScope,
} from "@/lib/reports/types";
import { generateCompanies } from "@/lib/reports/generators/companies";
import { generateRoutes } from "@/lib/reports/generators/routes";
import { generateUsers } from "@/lib/reports/generators/users";
import { generateLogs } from "@/lib/reports/generators/logs";

const SCHEMAS = {
  logs: LogsFiltersSchema,
  companies: CompaniesFiltersSchema,
  routes: RoutesFiltersSchema,
  users: UsersFiltersSchema,
} as const;

function dispatch(
  type: ReportType,
  filters: any,
  scope: AccessScope
): AsyncIterable<unknown[]> {
  switch (type) {
    case "companies":
      return generateCompanies(filters, scope);
    case "routes":
      return generateRoutes(filters, scope);
    case "users":
      return generateUsers(filters, scope);
    case "logs":
      return generateLogs(filters, scope);
  }
}

function buildFilename(type: ReportType, filters: any): string {
  const today = new Date().toISOString().slice(0, 10);
  if (type === "logs" && filters?.dateFrom && filters?.dateTo) {
    const from = new Date(filters.dateFrom).toISOString().slice(0, 10);
    const to = new Date(filters.dateTo).toISOString().slice(0, 10);
    return `nexus-logs-${from}_${to}.csv`;
  }
  return `nexus-${type}-${today}.csv`;
}

async function handle(
  request: NextRequest,
  type: string,
  method: "HEAD" | "GET"
) {
  if (!REPORT_TYPES.includes(type as ReportType)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const user = session.user as any;
  const platformRole = user.platformRole ?? "viewer";

  if (!canAccessReportsPage(platformRole)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  if (!canAccessReportType(platformRole, type as ReportType)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const schema = SCHEMAS[type as ReportType];
  const rawFilters = parseFiltersFromSearchParams(
    type,
    request.nextUrl.searchParams
  );

  let filters: any;
  try {
    filters = schema.parse(rawFilters);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Filtros inválidos", details: err.issues },
        { status: 400 }
      );
    }
    throw err;
  }

  // HEAD = validação prévia usada pelo client antes de disparar download
  if (method === "HEAD") {
    return new Response(null, { status: 200 });
  }

  // Rate limit (somente no GET — HEAD não consome lock)
  const lockAcquired = await acquireExportLock(user.id);
  if (!lockAcquired) {
    return NextResponse.json(
      { error: "Export em curso — aguarde o anterior terminar" },
      { status: 429 }
    );
  }

  const scope = await getAccessibleCompanyIds({
    id: user.id,
    isSuperAdmin: user.isSuperAdmin ?? false,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(CSV_BOM));
        const iter = dispatch(type as ReportType, filters, scope);
        for await (const row of iter) {
          controller.enqueue(encoder.encode(buildCsvRow(row)));
        }
        controller.close();
      } catch (err) {
        console.error(`[reports:${type}] stream error:`, err);
        controller.error(err);
      } finally {
        await releaseExportLock(user.id);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${buildFilename(type as ReportType, filters)}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  return handle(request, type, "GET");
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  return handle(request, type, "HEAD");
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/reports/[type]/route.ts"
git commit -m "feat(reports): endpoint GET (streaming) + HEAD (validação prévia) /api/reports/[type]"
```

---

### Task 13: Hook `useReportEstimate` + componente base `ReportBlock`

Abstração compartilhada. Elimina duplicação entre os 4 blocos de UI.

**Files:**
- Create: `src/components/reports/use-report-estimate.ts`
- Create: `src/components/reports/report-block.tsx`

- [ ] **Step 1: Criar o hook**

```typescript
// src/components/reports/use-report-estimate.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { EstimateResult, ReportType } from "@/lib/reports/types";

interface UseReportEstimateReturn {
  estimate: EstimateResult | null;
  loading: boolean;
  error: string | null;
}

export function useReportEstimate(
  type: ReportType,
  searchParams: URLSearchParams,
  enabled: boolean = true
): UseReportEstimateReturn {
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = searchParams.toString();

  const fetchEstimate = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = `/api/reports/${type}/count${key ? "?" + key : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Falha ao estimar");
      }
      const data = (await res.json()) as EstimateResult;
      setEstimate(data);
    } catch (err) {
      setEstimate(null);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [type, key, enabled]);

  useEffect(() => {
    const t = setTimeout(fetchEstimate, 300);
    return () => clearTimeout(t);
  }, [fetchEstimate]);

  return { estimate, loading, error };
}
```

- [ ] **Step 2: Criar o componente base**

```tsx
// src/components/reports/report-block.tsx
"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useReportEstimate } from "./use-report-estimate";
import { MAX_ROWS_PER_EXPORT, type ReportType } from "@/lib/reports/types";

interface ReportBlockProps {
  type: ReportType;
  title: string;
  description: string;
  icon: ReactNode;
  searchParams: URLSearchParams;
  filters?: ReactNode;
  estimateEnabled?: boolean;
  disabledReason?: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ReportBlock({
  type,
  title,
  description,
  icon,
  searchParams,
  filters,
  estimateEnabled = true,
  disabledReason,
}: ReportBlockProps) {
  const { estimate, loading, error } = useReportEstimate(
    type,
    searchParams,
    estimateEnabled
  );
  const [downloading, setDownloading] = useState(false);

  const tooLarge = !!estimate && estimate.count > MAX_ROWS_PER_EXPORT;
  const empty = !!estimate && estimate.count === 0;
  const disabled =
    loading || downloading || tooLarge || empty || !!disabledReason;

  async function handleDownload() {
    setDownloading(true);
    try {
      const key = searchParams.toString();
      const url = `/api/reports/${type}${key ? "?" + key : ""}`;

      // Validação prévia via HEAD — garante que não vamos navegar
      // para uma página de erro do browser (429 / 400 / 403).
      const head = await fetch(url, { method: "HEAD" });
      if (!head.ok) {
        if (head.status === 429) {
          toast.error("Já existe um export em andamento. Aguarde.");
        } else if (head.status === 403) {
          toast.error("Sem permissão para este relatório.");
        } else if (head.status === 400) {
          toast.error("Filtros inválidos.");
        } else {
          toast.error(`Erro ${head.status} ao iniciar download.`);
        }
        return;
      }

      // HEAD ok → dispara o download real via navegação
      window.location.href = url;
      toast.success("Download iniciado");
    } catch {
      toast.error("Erro de rede ao iniciar download");
    } finally {
      setTimeout(() => setDownloading(false), 2000);
    }
  }

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-foreground text-base">
          {icon}
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {filters}
        <div className="flex items-center justify-between gap-4 pt-2">
          <div className="text-sm text-muted-foreground">
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Calculando...
              </span>
            ) : error ? (
              <span className="text-destructive">{error}</span>
            ) : estimate ? (
              <span>
                ~{estimate.count.toLocaleString("pt-BR")} registros ·{" "}
                {formatBytes(estimate.estimatedBytes)}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {tooLarge && (
              <p className="text-xs text-amber-500 mt-1">
                Refine os filtros — limite de{" "}
                {MAX_ROWS_PER_EXPORT.toLocaleString("pt-BR")} registros
              </p>
            )}
            {empty && (
              <p className="text-xs text-muted-foreground mt-1">
                Nenhum registro para exportar
              </p>
            )}
            {disabledReason && (
              <p className="text-xs text-muted-foreground mt-1">
                {disabledReason}
              </p>
            )}
          </div>
          <Button
            onClick={handleDownload}
            disabled={disabled}
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer"
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Baixar CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/use-report-estimate.ts src/components/reports/report-block.tsx
git commit -m "feat(reports): hook useReportEstimate + componente base ReportBlock (DRY)"
```

---

### Task 14: Página `/relatorios` (server component)

**Files:**
- Create: `src/app/(protected)/relatorios/page.tsx`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/app/(protected)/relatorios/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleCompanyIds } from "@/lib/tenant";
import {
  canAccessReportsPage,
  listAccessibleReportTypes,
} from "@/lib/reports/authorize";
import { ReportsContent } from "./reports-content";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!canAccessReportsPage(user.platformRole)) {
    redirect("/dashboard");
  }

  const scope = await getAccessibleCompanyIds({
    id: user.id,
    isSuperAdmin: user.isSuperAdmin,
  });

  const where = scope === undefined ? {} : { id: { in: scope } };
  const companies = await prisma.company.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const availableReports = listAccessibleReportTypes(user.platformRole);

  return (
    <ReportsContent
      companies={companies}
      availableReports={availableReports}
    />
  );
}
```

- [ ] **Step 2: Verificar tsc (erro esperado em ReportsContent)**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "relatorios"`
Expected: erro de import de `./reports-content` (resolvido na próxima task)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(protected)/relatorios/page.tsx"
git commit -m "feat(reports): página server component /relatorios"
```

---

### Task 15: Client component `ReportsContent` com os 4 blocos

Arquivo grande porque contém a UI completa dos 4 tipos. Código completo, sem placeholders.

**Files:**
- Create: `src/app/(protected)/relatorios/reports-content.tsx`

- [ ] **Step 1: Criar o arquivo**

```tsx
// src/app/(protected)/relatorios/reports-content.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  FileBarChart2,
  FileText,
  Route,
  Users,
} from "lucide-react";
import { CustomSelect, type SelectOption } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { ReportBlock } from "@/components/reports/report-block";
import {
  getAvailableEventTypes,
  getAvailableRoutes,
} from "@/lib/actions/logs";
import type { ReportType } from "@/lib/reports/types";

interface Company {
  id: string;
  name: string;
}

interface Props {
  companies: Company[];
  availableReports: ReportType[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

const DELIVERY_STATUSES = [
  { value: "delivered", label: "Entregue" },
  { value: "failed", label: "Falhou" },
  { value: "pending", label: "Pendente" },
  { value: "delivering", label: "Entregando" },
  { value: "retrying", label: "Retry" },
] as const;

function buildCompanyOptions(companies: Company[], includeAll = true): SelectOption[] {
  const opts: SelectOption[] = includeAll
    ? [{ value: "", label: "Todas as empresas" }]
    : [];
  for (const c of companies) {
    opts.push({ value: c.id, label: c.name });
  }
  return opts;
}

export function ReportsContent({ companies, availableReports }: Props) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <FileBarChart2 className="h-6 w-6 text-violet-500" />
          Relatórios
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Exporte dados do sistema em CSV para análise externa.
        </p>
      </motion.div>

      {availableReports.includes("logs") && (
        <motion.div variants={itemVariants}>
          <LogsBlock companies={companies} />
        </motion.div>
      )}

      {availableReports.includes("companies") && (
        <motion.div variants={itemVariants}>
          <CompaniesBlock />
        </motion.div>
      )}

      {availableReports.includes("routes") && (
        <motion.div variants={itemVariants}>
          <RoutesBlock companies={companies} />
        </motion.div>
      )}

      {availableReports.includes("users") && (
        <motion.div variants={itemVariants}>
          <UsersBlock />
        </motion.div>
      )}
    </motion.div>
  );
}

/* -------- Bloco: Empresas -------- */

function CompaniesBlock() {
  const searchParams = useMemo(() => new URLSearchParams(), []);
  return (
    <ReportBlock
      type="companies"
      title="Empresas"
      description="Lista completa de empresas cadastradas com totais de rotas e membros."
      icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
      searchParams={searchParams}
    />
  );
}

/* -------- Bloco: Rotas -------- */

function RoutesBlock({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState("");

  const searchParams = useMemo(() => {
    const p = new URLSearchParams();
    if (companyId) p.set("companyId", companyId);
    return p;
  }, [companyId]);

  return (
    <ReportBlock
      type="routes"
      title="Rotas de Webhook"
      description="Lista de rotas cadastradas com URL destino, eventos inscritos e status."
      icon={<Route className="h-4 w-4 text-muted-foreground" />}
      searchParams={searchParams}
      filters={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Empresa
            </label>
            <CustomSelect
              value={companyId}
              onChange={setCompanyId}
              options={buildCompanyOptions(companies)}
              placeholder="Todas as empresas"
            />
          </div>
        </div>
      }
    />
  );
}

/* -------- Bloco: Usuários -------- */

function UsersBlock() {
  const [platformRole, setPlatformRole] = useState("");

  const searchParams = useMemo(() => {
    const p = new URLSearchParams();
    if (platformRole) p.set("platformRole", platformRole);
    return p;
  }, [platformRole]);

  const roleOptions: SelectOption[] = [
    { value: "", label: "Todos os papéis" },
    { value: "super_admin", label: "Super Admin" },
    { value: "admin", label: "Admin" },
    { value: "manager", label: "Gerente" },
    { value: "viewer", label: "Visualizador" },
  ];

  return (
    <ReportBlock
      type="users"
      title="Usuários"
      description="Lista de usuários do sistema com platform role, status e empresas vinculadas."
      icon={<Users className="h-4 w-4 text-muted-foreground" />}
      searchParams={searchParams}
      filters={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Platform role
            </label>
            <CustomSelect
              value={platformRole}
              onChange={setPlatformRole}
              options={roleOptions}
              placeholder="Todos os papéis"
            />
          </div>
        </div>
      }
    />
  );
}

/* -------- Bloco: Logs -------- */

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function LogsBlock({ companies }: { companies: Company[] }) {
  const today = useMemo(() => new Date(), []);
  const thirtyDaysAgo = useMemo(
    () => new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
    [today]
  );

  const [dateFrom, setDateFrom] = useState(toDateInput(thirtyDaysAgo));
  const [dateTo, setDateTo] = useState(toDateInput(today));
  const [companyId, setCompanyId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);

  // Dados dinâmicos populados quando empresa é selecionada
  const [availableRoutes, setAvailableRoutes] = useState<
    { id: string; name: string }[]
  >([]);
  const [availableEventTypes, setAvailableEventTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!companyId) {
      setAvailableRoutes([]);
      setAvailableEventTypes([]);
      setRouteId("");
      setEventTypes([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      getAvailableRoutes(companyId).catch(() => []),
      getAvailableEventTypes(companyId).catch(() => []),
    ]).then(([routes, events]) => {
      if (cancelled) return;
      setAvailableRoutes(routes);
      setAvailableEventTypes(events);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const searchParams = useMemo(() => {
    const p = new URLSearchParams();
    // Inclui horário final do dia para dateTo
    p.set("dateFrom", new Date(dateFrom + "T00:00:00Z").toISOString());
    p.set("dateTo", new Date(dateTo + "T23:59:59Z").toISOString());
    if (companyId) p.set("companyId", companyId);
    if (routeId) p.set("routeId", routeId);
    if (statuses.length > 0) p.set("statuses", statuses.join(","));
    if (eventTypes.length > 0) p.set("eventTypes", eventTypes.join(","));
    return p;
  }, [dateFrom, dateTo, companyId, routeId, statuses, eventTypes]);

  function toggleStatus(value: string) {
    setStatuses((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function toggleEventType(value: string) {
    setEventTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  return (
    <ReportBlock
      type="logs"
      title="Logs de Webhook"
      description="Entregas de webhook recebidos da Meta com status, duração e erro."
      icon={<FileText className="h-4 w-4 text-muted-foreground" />}
      searchParams={searchParams}
      filters={
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                De
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-muted/50 border-border text-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Até
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-muted/50 border-border text-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Empresa
              </label>
              <CustomSelect
                value={companyId}
                onChange={(v) => {
                  setCompanyId(v);
                  setRouteId("");
                  setEventTypes([]);
                }}
                options={buildCompanyOptions(companies)}
                placeholder="Todas as empresas"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Rota
              </label>
              <CustomSelect
                value={routeId}
                onChange={setRouteId}
                options={[
                  { value: "", label: "Todas as rotas" },
                  ...availableRoutes.map((r) => ({
                    value: r.id,
                    label: r.name,
                  })),
                ]}
                placeholder="Todas as rotas"
                disabled={!companyId || availableRoutes.length === 0}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {DELIVERY_STATUSES.map((s) => {
                const active = statuses.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStatus(s.value)}
                    className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? "bg-violet-500/20 border-violet-500/50 text-violet-400"
                        : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {companyId && availableEventTypes.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Tipo de evento
              </label>
              <div className="flex flex-wrap gap-2">
                {availableEventTypes.map((e) => {
                  const active = eventTypes.includes(e);
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => toggleEventType(e)}
                      className={`px-3 py-1 rounded-full border text-xs font-mono transition-colors cursor-pointer ${
                        active
                          ? "bg-violet-500/20 border-violet-500/50 text-violet-400"
                          : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {e}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 3: Build local**

Run: `npm run build:clean`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/relatorios/reports-content.tsx"
git commit -m "feat(reports): client component com os 4 blocos (DRY via ReportBlock)"
```

---

### Task 16: Item de navegação na sidebar

Vem depois da page existir para evitar janela de 404.

**Files:**
- Modify: `src/lib/constants/navigation.ts`

- [ ] **Step 1: Editar o arquivo**

Substituir o import de ícones:

```typescript
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  FileBarChart2,
  type LucideIcon,
} from "lucide-react";
```

Substituir `RESTRICTED_NAV_ITEMS`:

```typescript
export const RESTRICTED_NAV_ITEMS: NavItem[] = [
  { label: "Usuários", href: "/users", icon: Users, allowedRoles: ["super_admin", "admin"] },
  { label: "Relatórios", href: "/relatorios", icon: FileBarChart2, allowedRoles: ["super_admin", "admin", "manager"] },
  { label: "Configurações", href: "/settings", icon: Settings, allowedRoles: ["super_admin"] },
];
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "test\.ts" | grep "error" | head`
Expected: vazio

- [ ] **Step 3: Commit**

```bash
git add src/lib/constants/navigation.ts
git commit -m "feat(reports): item Relatórios na sidebar (admin+, manager)"
```

---

### Task 17: Deploy e QA manual em produção

- [ ] **Step 1: Push e monitorar CI**

```bash
git push origin main
gh run watch --exit-status
```

Expected: build + deploy success

- [ ] **Step 2: QA em https://roteadorwebhook.nexusai360.com/relatorios**

Checklist (marcar cada item):

- [ ] Item "Relatórios" aparece na sidebar como super_admin
- [ ] Entrar em `/relatorios` como super_admin: vê 4 blocos
- [ ] **Empresas**: estimativa carrega, download baixa CSV, arquivo abre no Excel com acentos corretos
- [ ] **Rotas**: estimativa muda ao selecionar empresa, download funciona
- [ ] **Usuários**: filtro por platform role muda estimativa, download funciona, coluna "Empresas vinculadas" aparece preenchida
- [ ] **Logs**: filtros de período, empresa, rota, status, tipo de evento todos funcionam; estimativa recalcula on-change; download funciona
- [ ] **Logs range > 90 dias**: tentar exportar → mensagem de erro "90 dias"
- [ ] **Rate limit**: dois clicks rápidos no Baixar do mesmo tipo → segundo click mostra toast "já existe um export em andamento"
- [ ] **Admin não-super**: login como admin com acesso limitado — só vê empresas visíveis no filtro e no CSV
- [ ] **Manager**: login como manager — vê 3 blocos (sem Usuários)
- [ ] **Viewer**: login como viewer — `/relatorios` redireciona para `/dashboard`; item sumido da sidebar
- [ ] **Formula injection**: criar empresa com nome `=HYPERLINK("http://x","y")`, exportar empresas, abrir no Excel → valor aparece como texto literal, NÃO como hiperlink ativo
- [ ] **Theme**: página renderiza corretamente em dark e light mode (inputs, botões, cards)

- [ ] **Step 3: Atualizar CLAUDE.md**

Adicionar em "Status":

```
- **Relatórios CSV:** CONCLUÍDO — página /relatorios, 4 tipos (logs, empresas, rotas, usuários), streaming com BOM UTF-8, rate limit Redis, proteção formula-injection (CWE-1236), permissões em três camadas (plataforma + tipo + empresa), managers incluídos sem acesso a Usuários
```

Remover "Exportação CSV" dos pendentes.

```bash
git add CLAUDE.md
git commit -m "docs: marca relatórios CSV como concluído"
git push origin main
gh run watch --exit-status
```

---

## Self-review do engenheiro implementando

Após todas as tasks:

- [ ] `npm test` passa (csv, filters, authorize)
- [ ] `npx tsc --noEmit` sem erros
- [ ] `npm run build:clean` passa
- [ ] Cada requisito da seção 3 do spec tem task correspondente
- [ ] Nenhum `console.log` deixado (apenas `console.error` com prefixo `[reports:...]`)
- [ ] Sem placeholders ou "TODO" no código
- [ ] Blocos UI compartilham o `ReportBlock` — sem duplicação de layout/estado/fetch

---

## Notas de execução

- **Commits frequentes**: cada task = 1 commit; facilita rollback
- **TDD aplicado** em Task 1 (csv), Task 3 (filters) e Task 5 (authorize) — áreas de segurança/integridade
- **Sem worktree**: projeto faz deploy direto de `main`
- **Se algo travar por 3+ tentativas**: parar e reavaliar arquitetura, não tentar fix #4
- **Middleware já cobre `/api/reports`** — não precisa mexer em `middleware.ts`
- **Server actions existentes** (`getAvailableEventTypes`, `getAvailableRoutes`) são chamáveis direto do client (já fazem auth/scope check internamente)
