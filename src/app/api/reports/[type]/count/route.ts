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
