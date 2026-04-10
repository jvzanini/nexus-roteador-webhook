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
