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
