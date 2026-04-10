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
