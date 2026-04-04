import { prisma } from '@/lib/prisma';

interface TenantUser {
  id: string;
  isSuperAdmin: boolean;
}

/**
 * Retorna lista de company IDs acessíveis pelo usuário.
 * Retorna undefined se super_admin (acesso total — sem filtro).
 */
export async function getAccessibleCompanyIds(
  user: TenantUser
): Promise<string[] | undefined> {
  if (user.isSuperAdmin) {
    return undefined; // Sem restrição
  }

  const memberships = await prisma.userCompanyMembership.findMany({
    where: { userId: user.id, isActive: true },
    select: { companyId: true },
  });

  return memberships.map((m) => m.companyId);
}

/**
 * Constrói filtro Prisma WHERE para tenant scoping.
 * Se companyIds é undefined (super_admin), retorna {} (sem filtro).
 * Se companyIds é um array, retorna { companyId: { in: [...] } }.
 */
export function buildTenantFilter(
  companyIds: string[] | undefined
): Record<string, any> {
  if (companyIds === undefined) {
    return {};
  }
  return { companyId: { in: companyIds } };
}

/**
 * Verifica se o usuário tem acesso a uma empresa específica.
 * Lança erro se não tem acesso.
 */
export async function assertCompanyAccess(
  user: TenantUser,
  companyId: string
): Promise<void> {
  if (user.isSuperAdmin) return;

  const companyIds = await getAccessibleCompanyIds(user);
  if (!companyIds || !companyIds.includes(companyId)) {
    throw new Error('Acesso negado: você não tem permissão para acessar esta empresa.');
  }
}

/**
 * Retorna o role do usuário em uma empresa específica.
 * Retorna null se não tem membership.
 * Retorna 'super_admin' se é super admin.
 */
export async function getUserCompanyRole(
  user: TenantUser,
  companyId: string
): Promise<string | null> {
  if (user.isSuperAdmin) return 'super_admin';

  const membership = await prisma.userCompanyMembership.findUnique({
    where: {
      userId_companyId: {
        userId: user.id,
        companyId,
      },
    },
    select: { role: true, isActive: true },
  });

  if (!membership || !membership.isActive) return null;
  return membership.role;
}
