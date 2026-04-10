# Relatórios CSV — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o módulo `/relatorios` com exportação CSV de logs, empresas, rotas e usuários, respeitando permissões de duas camadas, rate limit Redis, streaming HTTP e proteção contra CSV formula injection.

**Architecture:** Página server component lista blocos client-side por tipo de relatório. Cada tipo tem um gerador `async iterable` que streama linhas via `ReadableStream` em uma route handler `/api/reports/[type]`. Geradores reusam `tenant.ts` para tenant scoping. Rate limit por usuário via `ioredis`. CSV helper escapa RFC 4180 e mitiga formula injection.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma v7 (`@/generated/prisma/client`), Jest, ioredis, zod, shadcn/ui, Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-10-relatorios-csv-design.md`

---

## Estrutura de arquivos

```
src/app/(protected)/relatorios/
  page.tsx                    # server: auth + role + lista empresas
  reports-content.tsx         # client: blocos + filtros + baixar

src/app/api/reports/
  [type]/route.ts             # GET: stream CSV
  [type]/count/route.ts       # GET: { count, estimatedBytes }

src/lib/reports/
  csv.ts                      # escape + formula guard + BOM
  filters.ts                  # schemas zod por tipo
  estimate.ts                 # contagem + bytes
  rate-limit.ts               # Redis SET NX EX
  types.ts                    # tipos compartilhados
  generators/
    companies.ts
    routes.ts
    users.ts
    logs.ts

src/lib/reports/__tests__/
  csv.test.ts
```

---

### Task 1: CSV helper + testes unitários

Cria o helper de serialização CSV com escape RFC 4180, proteção contra formula injection (CWE-1236) e BOM UTF-8. Tudo testado antes de ser usado.

**Files:**
- Create: `src/lib/reports/csv.ts`
- Create: `src/lib/reports/__tests__/csv.test.ts`

- [ ] **Step 1: Escrever os testes primeiro (falhando)**

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
});

describe("buildCsvRow", () => {
  it("junta células com vírgula e termina em CRLF", () => {
    expect(buildCsvRow(["a", "b", "c"])).toBe("a,b,c\r\n");
  });

  it("aplica escape em cada célula", () => {
    expect(buildCsvRow(["a", "b, c", '"d"'])).toBe('a,"b, c","""d"""\r\n');
  });

  it("aceita valores mistos", () => {
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

/**
 * Escapa uma célula CSV:
 * 1. null/undefined → string vazia
 * 2. Se começar com =, +, -, @, \t ou \r → prefixa com ' para neutralizar fórmula
 * 3. Se contém ,, " ou \n → envolve em aspas e duplica aspas internas
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let str = typeof value === "string" ? value : String(value);

  // Formula injection guard: aplicado ANTES do escape de aspas
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

/**
 * Monta uma linha CSV a partir de um array de células.
 * Termina em CRLF conforme RFC 4180.
 */
export function buildCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(",") + "\r\n";
}
```

- [ ] **Step 4: Rodar testes para verificar que passam**

Run: `npm test -- csv.test.ts`
Expected: PASS (todos os testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/csv.ts src/lib/reports/__tests__/csv.test.ts
git commit -m "feat(reports): helper CSV com escape RFC 4180 e guard anti-formula-injection"
```

---

### Task 2: Tipos compartilhados

Define os tipos de filtros, escopo de acesso e tipo de relatório que serão usados por geradores, API e UI.

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

/**
 * Escopo de empresas visíveis ao usuário atual.
 * undefined = super_admin (sem restrição).
 * array = lista de IDs acessíveis via CompanyMembership.
 */
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
  // Sem filtros no v1
}

export interface RoutesFilters {
  companyId?: string;
}

export interface UsersFilters {
  platformRole?: "super_admin" | "admin" | "manager" | "viewer";
}

export type ReportFilters =
  | { type: "logs"; filters: LogsFilters }
  | { type: "companies"; filters: CompaniesFilters }
  | { type: "routes"; filters: RoutesFilters }
  | { type: "users"; filters: UsersFilters };

export interface EstimateResult {
  count: number;
  estimatedBytes: number;
}

// Bytes médios por linha (empírico, para estimativa de tamanho)
export const AVG_BYTES_PER_ROW: Record<ReportType, number> = {
  logs: 250,
  companies: 200,
  routes: 180,
  users: 220,
};

export const MAX_ROWS_PER_EXPORT = 50_000;
export const MAX_DAYS_LOGS = 90;
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros no arquivo novo

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/types.ts
git commit -m "feat(reports): tipos compartilhados de relatórios"
```

---

### Task 3: Schemas zod de filtros

Schemas de validação para cada tipo de relatório, usados pela API para parsear query params.

**Files:**
- Create: `src/lib/reports/filters.ts`

- [ ] **Step 1: Criar o arquivo**

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

/**
 * Parseia query params da URL para os filtros do tipo de relatório.
 * statuses e eventTypes aceitam formato CSV (?statuses=delivered,failed).
 */
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

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/filters.ts
git commit -m "feat(reports): schemas zod de filtros por tipo"
```

---

### Task 4: Rate limit via Redis

Helper de rate limit "1 export simultâneo por usuário" usando Redis `SET NX EX`. Funciona em multi-réplica.

**Files:**
- Create: `src/lib/reports/rate-limit.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/reports/rate-limit.ts
import { redis } from "@/lib/redis";

const EXPORT_LOCK_TTL_SECONDS = 300; // 5 min — cobre o pior caso de export lento

function keyFor(userId: string): string {
  return `report:export:${userId}`;
}

/**
 * Tenta adquirir o lock de export para um usuário.
 * Retorna true se adquiriu, false se já tem um export em curso.
 * Usa SET NX EX para ser seguro em multi-réplica.
 */
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

/**
 * Libera o lock de export.
 * Idempotente — seguro chamar mesmo se o lock já expirou.
 */
export async function releaseExportLock(userId: string): Promise<void> {
  await redis.del(keyFor(userId));
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/rate-limit.ts
git commit -m "feat(reports): rate limit de export via Redis SET NX EX"
```

---

### Task 5: Gerador de Empresas

Primeiro gerador — o mais simples. Valida a arquitetura de async iterable + access scope antes dos outros.

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

/**
 * Yielda arrays de células (strings). Primeira iteração = header.
 */
export async function* generateCompanies(
  _filters: CompaniesFilters,
  scope: AccessScope
): AsyncIterable<unknown[]> {
  yield COMPANIES_HEADERS;

  const where =
    scope === undefined ? {} : { id: { in: scope } };

  const companies = await prisma.company.findMany({
    where,
    take: MAX_ROWS_PER_EXPORT,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
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

/**
 * Conta quantas empresas seriam exportadas.
 */
export async function countCompanies(
  _filters: CompaniesFilters,
  scope: AccessScope
): Promise<number> {
  const where = scope === undefined ? {} : { id: { in: scope } };
  return prisma.company.count({ where });
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/generators/companies.ts
git commit -m "feat(reports): gerador de relatório de empresas"
```

---

### Task 6: Helper de estimativa

Centraliza a lógica de contagem + cálculo de bytes estimados. Usado pelo endpoint `/count`.

**Files:**
- Create: `src/lib/reports/estimate.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/reports/estimate.ts
import { AVG_BYTES_PER_ROW } from "./types";
import type {
  AccessScope,
  EstimateResult,
  ReportType,
} from "./types";
import { countCompanies } from "./generators/companies";
// Imports dos outros geradores são adicionados nas tasks futuras

/**
 * Calcula estimativa de contagem + bytes para um tipo de relatório.
 */
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
    case "users":
    case "logs":
      // Implementado nas tasks 10, 11, 12
      throw new Error(`Tipo ${type} ainda não implementado`);
    default:
      throw new Error(`Tipo desconhecido: ${type}`);
  }

  return {
    count,
    estimatedBytes: count * AVG_BYTES_PER_ROW[type],
  };
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/estimate.ts
git commit -m "feat(reports): helper de estimativa (contagem + bytes)"
```

---

### Task 7: Helper de autorização de relatórios

Centraliza a lógica "pode acessar este tipo de relatório?". Usado pela API (bloqueio 403) e pela UI (esconder bloco).

**Files:**
- Create: `src/lib/reports/authorize.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/reports/authorize.ts
import type { ReportType } from "./types";

/**
 * Determina se um platformRole pode acessar um tipo de relatório.
 * Regras:
 * - super_admin + admin: todos os tipos
 * - manager: logs, companies, routes (SEM users)
 * - viewer: nenhum (não chega aqui pois a page redireciona)
 */
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

/**
 * Lista os tipos de relatório visíveis para o role.
 */
export function listAccessibleReportTypes(
  platformRole: string
): ReportType[] {
  const all: ReportType[] = ["logs", "companies", "routes", "users"];
  return all.filter((t) => canAccessReportType(platformRole, t));
}

/**
 * Papéis que podem acessar a página /relatorios.
 */
export function canAccessReportsPage(platformRole: string): boolean {
  return (
    platformRole === "super_admin" ||
    platformRole === "admin" ||
    platformRole === "manager"
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/lib/reports/authorize.ts
git commit -m "feat(reports): helper de autorização por tipo e role"
```

---

### Task 8: API route — count endpoint

Endpoint `GET /api/reports/[type]/count` que retorna `{ count, estimatedBytes }`. Aplica auth, role check e access scope.

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
import { canAccessReportType, canAccessReportsPage } from "@/lib/reports/authorize";
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

  // Parse + validação
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

  // Access scope
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

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reports/[type]/count/route.ts
git commit -m "feat(reports): endpoint GET /api/reports/[type]/count"
```

---

### Task 9: API route — streaming download

Endpoint `GET /api/reports/[type]` que streama CSV via `ReadableStream`. Integra rate limit Redis, CSV helper, gerador.

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
import { acquireExportLock, releaseExportLock } from "@/lib/reports/rate-limit";
import {
  REPORT_TYPES,
  MAX_ROWS_PER_EXPORT,
  type ReportType,
  type AccessScope,
} from "@/lib/reports/types";
import { generateCompanies } from "@/lib/reports/generators/companies";
// generators/{routes,users,logs} importados nas tasks futuras

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
    case "users":
    case "logs":
      throw new Error(`Tipo ${type} ainda não implementado`);
  }
}

function buildFilename(type: ReportType, filters: any): string {
  const today = new Date().toISOString().slice(0, 10);
  if (type === "logs" && filters?.dateFrom && filters?.dateTo) {
    const from = filters.dateFrom.toISOString().slice(0, 10);
    const to = filters.dateTo.toISOString().slice(0, 10);
    return `nexus-logs-${from}_${to}.csv`;
  }
  return `nexus-${type}-${today}.csv`;
}

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

  // Parse + validação
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

  // Rate limit
  const lockAcquired = await acquireExportLock(user.id);
  if (!lockAcquired) {
    return NextResponse.json(
      { error: "Export em curso — aguarde o anterior terminar" },
      { status: 429 }
    );
  }

  // Access scope
  const scope = await getAccessibleCompanyIds({
    id: user.id,
    isSuperAdmin: user.isSuperAdmin ?? false,
  });

  const encoder = new TextEncoder();
  let rowCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(CSV_BOM));

        const iter = dispatch(type as ReportType, filters, scope);
        for await (const row of iter) {
          controller.enqueue(encoder.encode(buildCsvRow(row)));
          rowCount++;
          if (rowCount > MAX_ROWS_PER_EXPORT + 1) {
            // +1 porque primeira iteração é o header
            controller.enqueue(
              encoder.encode(
                buildCsvRow([
                  "_aviso",
                  "Limite de 50.000 registros atingido — refine os filtros",
                ])
              )
            );
            break;
          }
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
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reports/[type]/route.ts
git commit -m "feat(reports): endpoint GET /api/reports/[type] com streaming CSV"
```

---

### Task 10: Item de navegação na sidebar

Adiciona "Relatórios" em `RESTRICTED_NAV_ITEMS` para super_admin, admin e manager.

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

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/lib/constants/navigation.ts
git commit -m "feat(reports): item Relatórios na sidebar (admin+, manager)"
```

---

### Task 11: Página `/relatorios` — server component

Server component que faz auth check, busca empresas visíveis e renderiza o client component com dados iniciais.

**Files:**
- Create: `src/app/(protected)/relatorios/page.tsx`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/app/(protected)/relatorios/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleCompanyIds } from "@/lib/tenant";
import { canAccessReportsPage } from "@/lib/reports/authorize";
import { listAccessibleReportTypes } from "@/lib/reports/authorize";
import { ReportsContent } from "./reports-content";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const platformRole = user.platformRole;
  if (!canAccessReportsPage(platformRole)) {
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

  const availableReports = listAccessibleReportTypes(platformRole);

  return (
    <ReportsContent
      companies={companies}
      availableReports={availableReports}
    />
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: erro esperado sobre `ReportsContent` não existir — próxima task resolve

- [ ] **Step 3: Commit**

```bash
git add "src/app/(protected)/relatorios/page.tsx"
git commit -m "feat(reports): server component da página /relatorios"
```

---

### Task 12: Client component `ReportsContent` (inicialmente só Empresas)

Renderiza a lista de blocos. Primeira versão: só o bloco "Empresas" funcional. Os outros blocos serão adicionados conforme geradores forem entregues.

**Files:**
- Create: `src/app/(protected)/relatorios/reports-content.tsx`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/app/(protected)/relatorios/reports-content.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Building2, FileBarChart2, Loader2, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ReportType } from "@/lib/reports/types";

interface Company {
  id: string;
  name: string;
}

interface Props {
  companies: Company[];
  availableReports: ReportType[];
}

interface Estimate {
  count: number;
  estimatedBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

      {availableReports.includes("companies") && (
        <motion.div variants={itemVariants}>
          <CompaniesReportBlock />
        </motion.div>
      )}

      {/* Blocos de routes, users, logs adicionados em tasks futuras */}
    </motion.div>
  );
}

function CompaniesReportBlock() {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const fetchEstimate = useCallback(async () => {
    setLoadingEstimate(true);
    try {
      const res = await fetch("/api/reports/companies/count");
      if (!res.ok) throw new Error("Falha ao estimar");
      setEstimate(await res.json());
    } catch {
      setEstimate(null);
    } finally {
      setLoadingEstimate(false);
    }
  }, []);

  useEffect(() => {
    fetchEstimate();
  }, [fetchEstimate]);

  async function handleDownload() {
    setDownloading(true);
    try {
      window.location.href = "/api/reports/companies";
      toast.success("Download iniciado");
    } finally {
      setTimeout(() => setDownloading(false), 2000);
    }
  }

  const tooLarge = estimate && estimate.count > 50_000;
  const empty = estimate && estimate.count === 0;
  const disabled = loadingEstimate || downloading || tooLarge || empty;

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-foreground text-base">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Empresas
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Lista completa de empresas cadastradas com totais de rotas e membros.
        </p>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {loadingEstimate ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Calculando...
            </span>
          ) : estimate ? (
            <span>
              ~{estimate.count.toLocaleString("pt-BR")} registros ·{" "}
              {formatBytes(estimate.estimatedBytes)}
            </span>
          ) : (
            <span className="text-destructive">Erro ao estimar</span>
          )}
          {tooLarge && (
            <p className="text-xs text-amber-500 mt-1">
              Refine os filtros — limite de 50.000 registros por export
            </p>
          )}
          {empty && (
            <p className="text-xs text-muted-foreground mt-1">
              Nenhum registro para exportar
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
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 3: Teste manual local**

```bash
npm run build:clean
```

Expected: build passa sem erros

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/relatorios/reports-content.tsx"
git commit -m "feat(reports): client component com bloco de Empresas"
```

---

### Task 13: Gerador de Rotas

Segundo gerador. Segue o mesmo padrão do de Empresas.

**Files:**
- Create: `src/lib/reports/generators/routes.ts`
- Modify: `src/lib/reports/estimate.ts`
- Modify: `src/app/api/reports/[type]/route.ts`

- [ ] **Step 1: Criar o gerador**

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

export async function* generateRoutes(
  filters: RoutesFilters,
  scope: AccessScope
): AsyncIterable<unknown[]> {
  yield ROUTES_HEADERS;

  const where: Record<string, any> = {};
  if (scope !== undefined) {
    where.companyId = { in: scope };
  }
  if (filters.companyId) {
    where.companyId = filters.companyId;
    // Respeita scope mesmo que usuário passe companyId manualmente
    if (scope !== undefined && !scope.includes(filters.companyId)) {
      return; // nenhum resultado
    }
  }

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
  const where: Record<string, any> = {};
  if (scope !== undefined) {
    where.companyId = { in: scope };
  }
  if (filters.companyId) {
    where.companyId = filters.companyId;
    if (scope !== undefined && !scope.includes(filters.companyId)) {
      return 0;
    }
  }
  return prisma.webhookRoute.count({ where });
}
```

- [ ] **Step 2: Adicionar ao estimate.ts**

Substituir a função `estimateReport`:

```typescript
// src/lib/reports/estimate.ts
import { AVG_BYTES_PER_ROW } from "./types";
import type {
  AccessScope,
  EstimateResult,
  ReportType,
} from "./types";
import { countCompanies } from "./generators/companies";
import { countRoutes } from "./generators/routes";

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
    case "logs":
      throw new Error(`Tipo ${type} ainda não implementado`);
    default:
      throw new Error(`Tipo desconhecido: ${type}`);
  }

  return {
    count,
    estimatedBytes: count * AVG_BYTES_PER_ROW[type],
  };
}
```

- [ ] **Step 3: Adicionar ao dispatch do route.ts**

Em `src/app/api/reports/[type]/route.ts`, adicionar import:

```typescript
import { generateRoutes } from "@/lib/reports/generators/routes";
```

E atualizar a função `dispatch`:

```typescript
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
    case "logs":
      throw new Error(`Tipo ${type} ainda não implementado`);
  }
}
```

- [ ] **Step 4: Adicionar bloco de Rotas no client**

Em `src/app/(protected)/relatorios/reports-content.tsx`, importar `Route` do lucide e adicionar um novo componente `RoutesReportBlock` seguindo o padrão do `CompaniesReportBlock`, com um filtro `CustomSelect` de empresa:

```typescript
// Adicionar import
import { Route } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";

// Dentro do ReportsContent, após o bloco de Empresas:
{availableReports.includes("routes") && (
  <motion.div variants={itemVariants}>
    <RoutesReportBlock companies={companies} />
  </motion.div>
)}

// Novo componente no fim do arquivo:
function RoutesReportBlock({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState<string>("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const fetchEstimate = useCallback(async () => {
    setLoadingEstimate(true);
    try {
      const url = new URL("/api/reports/routes/count", window.location.origin);
      if (companyId) url.searchParams.set("companyId", companyId);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error();
      setEstimate(await res.json());
    } catch {
      setEstimate(null);
    } finally {
      setLoadingEstimate(false);
    }
  }, [companyId]);

  useEffect(() => {
    const t = setTimeout(fetchEstimate, 300);
    return () => clearTimeout(t);
  }, [fetchEstimate]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const url = new URL("/api/reports/routes", window.location.origin);
      if (companyId) url.searchParams.set("companyId", companyId);
      window.location.href = url.toString();
      toast.success("Download iniciado");
    } finally {
      setTimeout(() => setDownloading(false), 2000);
    }
  }

  const tooLarge = estimate && estimate.count > 50_000;
  const empty = estimate && estimate.count === 0;
  const disabled = loadingEstimate || downloading || tooLarge || empty;

  const companyOptions = [
    { value: "", label: "Todas as empresas", description: "Exportar todas" },
    ...companies.map((c) => ({
      value: c.id,
      label: c.name,
      description: "",
    })),
  ];

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-foreground text-base">
          <Route className="h-4 w-4 text-muted-foreground" />
          Rotas de Webhook
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Lista de rotas cadastradas com URL destino, eventos inscritos e status.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Empresa
            </label>
            <CustomSelect
              value={companyId}
              onValueChange={setCompanyId}
              options={companyOptions}
              placeholder="Todas as empresas"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 pt-2">
          <div className="text-sm text-muted-foreground">
            {loadingEstimate ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Calculando...
              </span>
            ) : estimate ? (
              <span>
                ~{estimate.count.toLocaleString("pt-BR")} registros ·{" "}
                {formatBytes(estimate.estimatedBytes)}
              </span>
            ) : (
              <span className="text-destructive">Erro ao estimar</span>
            )}
            {tooLarge && (
              <p className="text-xs text-amber-500 mt-1">
                Refine os filtros — limite de 50.000 registros por export
              </p>
            )}
            {empty && (
              <p className="text-xs text-muted-foreground mt-1">
                Nenhum registro para exportar
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

- [ ] **Step 5: Verificar build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/generators/routes.ts src/lib/reports/estimate.ts "src/app/api/reports/[type]/route.ts" "src/app/(protected)/relatorios/reports-content.tsx"
git commit -m "feat(reports): gerador e bloco UI de Rotas"
```

---

### Task 14: Gerador de Usuários

Terceiro gerador. Tem lógica extra: filtrar lista de "empresas vinculadas" pelo scope do exportador.

**Files:**
- Create: `src/lib/reports/generators/users.ts`
- Modify: `src/lib/reports/estimate.ts`
- Modify: `src/app/api/reports/[type]/route.ts`
- Modify: `src/app/(protected)/relatorios/reports-content.tsx`

- [ ] **Step 1: Criar o gerador**

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

/**
 * Monta a lista de empresas vinculadas filtrada pelo scope do exportador.
 * scope=undefined (super_admin): mostra todas as memberships.
 * scope=array: mostra só as memberships em empresas do array.
 */
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

export async function* generateUsers(
  filters: UsersFilters,
  scope: AccessScope
): AsyncIterable<unknown[]> {
  yield USERS_HEADERS;

  // Admin (não super) só vê usuários com membership em alguma empresa do scope
  const where: Record<string, any> = {};
  if (filters.platformRole) {
    where.platformRole = filters.platformRole;
  }
  if (scope !== undefined) {
    where.memberships = {
      some: { companyId: { in: scope }, isActive: true },
    };
  }

  const users = await prisma.user.findMany({
    where,
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
  const where: Record<string, any> = {};
  if (filters.platformRole) {
    where.platformRole = filters.platformRole;
  }
  if (scope !== undefined) {
    where.memberships = {
      some: { companyId: { in: scope }, isActive: true },
    };
  }
  return prisma.user.count({ where });
}
```

- [ ] **Step 2: Adicionar ao `estimate.ts`**

Adicionar import + case:

```typescript
import { countUsers } from "./generators/users";

// ... dentro do switch:
    case "users":
      count = await countUsers(filters as any, scope);
      break;
```

- [ ] **Step 3: Adicionar ao dispatch do `route.ts`**

```typescript
import { generateUsers } from "@/lib/reports/generators/users";

// ... dentro do switch:
    case "users":
      return generateUsers(filters, scope);
```

- [ ] **Step 4: Adicionar bloco de Usuários no client**

Em `reports-content.tsx`, adicionar import do ícone `Users` (já usado em outros lugares, importar de `lucide-react`) e criar componente `UsersReportBlock` análogo ao `RoutesReportBlock`, mas com filtro de `platformRole` (select com 4 opções) em vez de empresa.

Opções de role:

```typescript
const roleOptions = [
  { value: "", label: "Todos os papéis", description: "Exportar todos" },
  { value: "super_admin", label: "Super Admin", description: "" },
  { value: "admin", label: "Admin", description: "" },
  { value: "manager", label: "Gerente", description: "" },
  { value: "viewer", label: "Visualizador", description: "" },
];
```

A URL do fetch/download inclui `?platformRole=...` quando não vazio. Estrutura idêntica ao bloco de Rotas, mudando apenas:
- Título: "Usuários"
- Ícone: `Users`
- Descrição: "Lista de usuários do sistema com platform role, status e empresas vinculadas."
- Endpoint: `/api/reports/users` e `/api/reports/users/count`
- Filtro: `platformRole` em vez de `companyId`

Renderizar condicionalmente:

```typescript
{availableReports.includes("users") && (
  <motion.div variants={itemVariants}>
    <UsersReportBlock />
  </motion.div>
)}
```

- [ ] **Step 5: Verificar build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/generators/users.ts src/lib/reports/estimate.ts "src/app/api/reports/[type]/route.ts" "src/app/(protected)/relatorios/reports-content.tsx"
git commit -m "feat(reports): gerador e bloco UI de Usuários (filtra memberships pelo scope)"
```

---

### Task 15: Gerador de Logs

Gerador mais complexo. Usa batches de 500 via `RouteDelivery` + join com inbound + route + último attempt.

**Files:**
- Create: `src/lib/reports/generators/logs.ts`
- Modify: `src/lib/reports/estimate.ts`
- Modify: `src/app/api/reports/[type]/route.ts`
- Modify: `src/app/(protected)/relatorios/reports-content.tsx`

- [ ] **Step 1: Criar o gerador**

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

function buildWhere(filters: LogsFilters, scope: AccessScope): Record<string, any> {
  const where: Record<string, any> = {
    inboundWebhook: {
      receivedAt: {
        gte: filters.dateFrom,
        lte: filters.dateTo,
      },
    },
  };

  if (scope !== undefined) {
    where.companyId = { in: scope };
  }
  if (filters.companyId) {
    if (scope !== undefined && !scope.includes(filters.companyId)) {
      where.companyId = { in: [] }; // força zero resultados
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
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    where.inboundWebhook.eventType = { in: filters.eventTypes };
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
      orderBy: { createdAt: "desc" },
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
  const where = buildWhere(filters, scope);
  return prisma.routeDelivery.count({ where });
}
```

- [ ] **Step 2: Adicionar ao `estimate.ts`**

```typescript
import { countLogs } from "./generators/logs";

// ... dentro do switch:
    case "logs":
      count = await countLogs(filters as any, scope);
      break;
```

- [ ] **Step 3: Adicionar ao dispatch do `route.ts`**

```typescript
import { generateLogs } from "@/lib/reports/generators/logs";

// ... dentro do switch:
    case "logs":
      return generateLogs(filters, scope);
```

- [ ] **Step 4: Adicionar bloco de Logs no client**

Em `reports-content.tsx`, importar `FileText` do lucide. Criar `LogsReportBlock` com filtros mais ricos:

- `dateFrom` e `dateTo` via `<Input type="date">` — default últimos 30 dias
- `companyId` via `CustomSelect` (opcional)
- `routeId` via `CustomSelect` (aparece apenas se companyId selecionado — popular via fetch para `/api/companies/[id]/routes` — se esse endpoint não existir, adicionar task extra; alternativamente usar `getAvailableRoutes` server-side via prop)
- `statuses` via multi-select (ou checkboxes)
- `eventTypes` via multi-select (popular via `getAvailableEventTypes(companyId)` — endpoint pode ser criado como `/api/companies/[id]/event-types` se não existir)

**Simplificação para v1:** começar com apenas `dateFrom`, `dateTo` e `companyId`. Adicionar filtros restantes em iteração futura se necessário.

Default do período:

```typescript
const today = new Date();
const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
const [dateFrom, setDateFrom] = useState(thirtyDaysAgo.toISOString().slice(0, 10));
const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10));
```

URL com filtros:

```typescript
const url = new URL("/api/reports/logs/count", window.location.origin);
url.searchParams.set("dateFrom", dateFrom);
url.searchParams.set("dateTo", new Date(dateTo + "T23:59:59").toISOString());
if (companyId) url.searchParams.set("companyId", companyId);
```

Renderizar condicionalmente:

```typescript
{availableReports.includes("logs") && (
  <motion.div variants={itemVariants}>
    <LogsReportBlock companies={companies} />
  </motion.div>
)}
```

- [ ] **Step 5: Verificar build local**

Run: `npm run build:clean`
Expected: build passa

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/generators/logs.ts src/lib/reports/estimate.ts "src/app/api/reports/[type]/route.ts" "src/app/(protected)/relatorios/reports-content.tsx"
git commit -m "feat(reports): gerador e bloco UI de Logs (streaming em batches de 500)"
```

---

### Task 16: Deploy e QA manual em produção

Última etapa — verificar em produção se tudo funciona.

- [ ] **Step 1: Push e monitorar CI**

```bash
git push origin main
gh run watch --exit-status
```

Expected: build + deploy success

- [ ] **Step 2: QA manual em https://roteadorwebhook.nexusai360.com/relatorios**

Checklist:

- [ ] Item "Relatórios" aparece na sidebar para super_admin
- [ ] Acessar `/relatorios` como super_admin: vê 4 blocos
- [ ] Empresas: estimativa carrega, download funciona, arquivo CSV abre no Excel com acentos corretos
- [ ] Rotas: filtro por empresa muda estimativa, download funciona
- [ ] Usuários: filtro por role muda estimativa, download funciona; lista de empresas vinculadas aparece
- [ ] Logs: filtro de período ajusta estimativa, download funciona, arquivo tem header correto
- [ ] Logs: tentar range > 90 dias → erro 400
- [ ] Dois clicks rápidos em "Baixar CSV" do mesmo tipo → segundo dá 429
- [ ] Login como admin não-super com acesso limitado: vê só empresas permitidas no filtro e no CSV
- [ ] Login como manager: vê 3 blocos (sem Usuários)
- [ ] Login como viewer: `/relatorios` redireciona para `/dashboard`
- [ ] Criar empresa com nome `=HYPERLINK("http://x","y")`, exportar e abrir no Excel: valor aparece como texto `=HYPERLINK(...)`, NÃO como hyperlink ativo

- [ ] **Step 3: Se algo falhar**

Fix + commit + push + watch CI novamente. Repetir até checklist passar.

- [ ] **Step 4: Atualizar CLAUDE.md**

Adicionar em "Status" do CLAUDE.md:

```
- **Relatórios CSV:** CONCLUÍDO — página /relatorios, 4 tipos (logs, empresas, rotas, usuários), streaming CSV com BOM UTF-8, rate limit Redis, proteção formula-injection, permissões em três camadas
```

Remover o item "Exportação CSV" dos pendentes.

```bash
git add CLAUDE.md
git commit -m "docs: marca relatórios CSV como concluído"
git push origin main
```

---

## Self-review checklist (para o engenheiro implementando)

Após terminar todas as tasks, revisar:

- [ ] `npm test` passa
- [ ] `npx tsc --noEmit` sem erros
- [ ] `npm run build` passa
- [ ] Spec (`docs/superpowers/specs/2026-04-10-relatorios-csv-design.md`) — cada requisito tem task correspondente
- [ ] Nenhum `console.log` deixado (apenas `console.error` com prefixo `[reports:...]`)
- [ ] Sem `any` desnecessário (use tipos reais onde possível)
- [ ] Sem código duplicado entre blocos UI — se os 4 blocos ficarem muito repetitivos, considerar extrair um componente `ReportBlock` genérico

---

## Notas de execução

- **Frequent commits:** cada task é um commit isolado — facilita rollback
- **Testes primeiro** apenas no CSV helper (Task 1). Outras tasks são validadas por tsc + QA manual
- **Sem worktree:** o projeto faz deploy direto de `main`, então as tasks são commitadas em `main` normalmente
- **Se alguma task ficar travada:** parar e discutir, não tentar "um fix a mais" — investigar raiz do problema
