import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  type: "company" | "route" | "log" | "user";
  meta?: string;
}

interface SearchResponse {
  companies: SearchItem[];
  routes: SearchItem[];
  logs: SearchItem[];
  users: SearchItem[];
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ error: "Busca requer pelo menos 2 caracteres" }, { status: 400 });
  }

  const user = session.user as any;
  const isSuperAdmin: boolean = user.isSuperAdmin ?? false;
  const platformRole: string = user.platformRole ?? "viewer";
  const userId: string = user.id;

  // Tenant scoping — IDs de empresas acessíveis
  let companyIds: string[] | null = null; // null = sem filtro (super admin)
  if (!isSuperAdmin) {
    const memberships = await prisma.userCompanyMembership.findMany({
      where: { userId, isActive: true },
      select: { companyId: true },
    });
    companyIds = memberships.map((m) => m.companyId);
    if (companyIds.length === 0) {
      return NextResponse.json({ companies: [], routes: [], logs: [], users: [] } satisfies SearchResponse);
    }
  }

  const companyWhere = companyIds ? { id: { in: companyIds } } : {};
  const routeCompanyWhere = companyIds ? { companyId: { in: companyIds } } : {};

  // Queries em paralelo
  const canSearchUsers = platformRole === "super_admin" || platformRole === "admin";

  const [companies, routes, logs, users] = await Promise.all([
    // Empresas
    prisma.company.findMany({
      where: {
        ...companyWhere,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, slug: true },
      take: 5,
      orderBy: { name: "asc" },
    }),

    // Rotas
    prisma.webhookRoute.findMany({
      where: {
        ...routeCompanyWhere,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { url: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        url: true,
        companyId: true,
        company: { select: { name: true } },
      },
      take: 5,
      orderBy: { name: "asc" },
    }),

    // Logs (InboundWebhook)
    prisma.inboundWebhook.findMany({
      where: {
        ...(companyIds ? { companyId: { in: companyIds } } : {}),
        eventType: { startsWith: q, mode: "insensitive" },
      },
      select: {
        id: true,
        eventType: true,
        processingStatus: true,
        receivedAt: true,
        companyId: true,
        company: { select: { name: true } },
      },
      take: 5,
      orderBy: { receivedAt: "desc" },
    }),

    // Usuários (apenas admin+)
    canSearchUsers
      ? prisma.user.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, email: true, platformRole: true },
          take: 5,
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Mapear para SearchItem
  const response: SearchResponse = {
    companies: companies.map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: c.slug,
      href: `/companies/${c.id}`,
      type: "company" as const,
    })),
    routes: routes.map((r) => ({
      id: r.id,
      title: r.name,
      subtitle: r.url.length > 50 ? r.url.slice(0, 50) + "..." : r.url,
      href: `/companies/${r.companyId}?tab=routes`,
      type: "route" as const,
      meta: r.company.name,
    })),
    logs: logs.map((l) => ({
      id: l.id,
      title: l.eventType ?? "Evento",
      subtitle: `${l.company.name} · ${formatDistanceToNow(l.receivedAt, { addSuffix: true, locale: ptBR })}`,
      href: `/companies/${l.companyId}?tab=logs`,
      type: "log" as const,
      meta: l.processingStatus,
    })),
    users: users.map((u) => ({
      id: u.id,
      title: u.name ?? u.email,
      subtitle: u.email,
      href: "/users",
      type: "user" as const,
      meta: PLATFORM_ROLE_LABELS[u.platformRole] ?? u.platformRole,
    })),
  };

  return NextResponse.json(response);
}
