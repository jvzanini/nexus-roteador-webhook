"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { CompanyRole } from "@/generated/prisma/client";

// --- Types ---

export interface UserItem {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  createdAt: Date;
  companiesCount: number;
  highestRole: string; // "Super Admin" | "Admin" | "Gerente" | "Visualizador" | "Sem acesso"
  canEdit: boolean;
  canDelete: boolean;
}

export interface UserDetail {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  avatarUrl: string | null;
  theme: string;
  createdAt: Date;
  invitedBy: { name: string } | null;
  memberships: {
    id: string;
    companyId: string;
    companyName: string;
    role: CompanyRole;
    isActive: boolean;
  }[];
}

export interface MemberItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: CompanyRole;
  isActive: boolean;
  createdAt: Date;
}

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

// --- Helpers ---

const ROLE_HIERARCHY: Record<string, number> = {
  company_admin: 3,
  manager: 2,
  viewer: 1,
};

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  manager: "Gerente",
  viewer: "Visualizador",
};

function getHighestRole(
  isSuperAdmin: boolean,
  memberships: { role: CompanyRole }[]
): string {
  if (isSuperAdmin) return "Super Admin";
  if (memberships.length === 0) return "Sem acesso";

  let highest = 0;
  let highestRole = "viewer";
  for (const m of memberships) {
    const level = ROLE_HIERARCHY[m.role] ?? 0;
    if (level > highest) {
      highest = level;
      highestRole = m.role;
    }
  }
  return ROLE_LABELS[highestRole] ?? "Sem acesso";
}

async function isCompanyAdmin(userId: string): Promise<boolean> {
  const membership = await prisma.userCompanyMembership.findFirst({
    where: { userId, role: "company_admin", isActive: true },
  });
  return !!membership;
}

// --- Validation ---

const CreateUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["super_admin", "company_admin", "manager", "viewer"]),
});

const UpdateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["super_admin", "company_admin", "manager", "viewer"]).optional(),
  isActive: z.boolean().optional(),
});

const AddMemberSchema = z.object({
  userId: z.string().uuid(),
  companyId: z.string().uuid(),
  role: z.enum(["company_admin", "manager", "viewer"]),
});

const UpdateMemberSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(["company_admin", "manager", "viewer"]).optional(),
  isActive: z.boolean().optional(),
});

// --- User CRUD ---

export async function getUsers(): Promise<ActionResult<UserItem[]>> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { success: false, error: "Não autenticado" };

  const isSuperAdmin = currentUser.isSuperAdmin;
  const isAdmin = !isSuperAdmin && (await isCompanyAdmin(currentUser.id));

  if (!isSuperAdmin && !isAdmin) {
    return { success: false, error: "Acesso negado" };
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      isSuperAdmin: true,
      isActive: true,
      createdAt: true,
      _count: { select: { memberships: true } },
      memberships: { select: { role: true } },
    },
  });

  // Filtrar: admin nao ve super admins
  const filtered = isSuperAdmin
    ? users
    : users.filter((u) => !u.isSuperAdmin);

  return {
    success: true,
    data: filtered.map((u) => {
      // Determinar canEdit e canDelete baseado no nivel do usuario logado
      const targetIsSuperAdmin = u.isSuperAdmin;
      const targetIsAdmin =
        !targetIsSuperAdmin &&
        u.memberships.some((m) => m.role === "company_admin");

      let canEdit = false;
      let canDelete = false;

      if (isSuperAdmin) {
        // Super admin edita todos
        canEdit = true;
        // Super admin deleta todos EXCETO super admins
        canDelete = !targetIsSuperAdmin;
      } else if (isAdmin) {
        // Admin edita apenas manager e viewer
        canEdit = !targetIsSuperAdmin && !targetIsAdmin;
        // Admin deleta apenas manager e viewer
        canDelete = !targetIsSuperAdmin && !targetIsAdmin;
      }

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        isSuperAdmin: u.isSuperAdmin,
        isActive: u.isActive,
        createdAt: u.createdAt,
        companiesCount: u._count.memberships,
        highestRole: getHighestRole(u.isSuperAdmin, u.memberships),
        canEdit,
        canDelete,
      };
    }),
  };
}

export async function getUserDetail(
  userId: string
): Promise<ActionResult<UserDetail>> {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) return { success: false, error: "Acesso negado" };

  const found = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isSuperAdmin: true,
      isActive: true,
      avatarUrl: true,
      theme: true,
      createdAt: true,
      invitedBy: { select: { name: true } },
      memberships: {
        select: {
          id: true,
          companyId: true,
          role: true,
          isActive: true,
          company: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!found) return { success: false, error: "Usuário não encontrado" };

  return {
    success: true,
    data: {
      ...found,
      memberships: found.memberships.map((m) => ({
        id: m.id,
        companyId: m.companyId,
        companyName: m.company.name,
        role: m.role,
        isActive: m.isActive,
      })),
    },
  };
}

export async function createUser(
  data: z.infer<typeof CreateUserSchema>
): Promise<ActionResult<{ id: string }>> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { success: false, error: "Não autenticado" };

  const isSuperAdmin = currentUser.isSuperAdmin;
  const isAdmin = !isSuperAdmin && (await isCompanyAdmin(currentUser.id));

  if (!isSuperAdmin && !isAdmin) {
    return { success: false, error: "Acesso negado" };
  }

  try {
    const parsed = CreateUserSchema.parse(data);

    // Admin nao pode criar super admin
    if (parsed.role === "super_admin" && !isSuperAdmin) {
      return { success: false, error: "Sem permissão para criar Super Admin" };
    }

    const existing = await prisma.user.findUnique({
      where: { email: parsed.email },
    });
    if (existing) return { success: false, error: "E-mail já cadastrado" };

    const hashedPassword = await bcrypt.hash(parsed.password, 12);

    const created = await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        password: hashedPassword,
        isSuperAdmin: parsed.role === "super_admin",
        invitedById: currentUser.id,
      },
    });

    return { success: true, data: { id: created.id } };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, error: "Dados inválidos" };
    console.error("[users] Erro ao criar:", error);
    return { success: false, error: "Erro ao criar usuário" };
  }
}

export async function updateUser(
  userId: string,
  data: z.infer<typeof UpdateUserSchema>
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { success: false, error: "Não autenticado" };

  const isSuperAdmin = currentUser.isSuperAdmin;
  const isAdmin = !isSuperAdmin && (await isCompanyAdmin(currentUser.id));

  if (!isSuperAdmin && !isAdmin) {
    return { success: false, error: "Acesso negado" };
  }

  try {
    const parsed = UpdateUserSchema.parse(data);

    // Buscar o usuario alvo para validar hierarquia
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isSuperAdmin: true,
        memberships: { select: { role: true } },
      },
    });

    if (!targetUser) return { success: false, error: "Usuário não encontrado" };

    // Validar hierarquia
    if (!isSuperAdmin) {
      // Admin nao pode editar super admin
      if (targetUser.isSuperAdmin) {
        return { success: false, error: "Sem permissão para editar Super Admin" };
      }
      // Admin nao pode editar outro admin
      if (targetUser.memberships.some((m) => m.role === "company_admin")) {
        return { success: false, error: "Sem permissão para editar outro Admin" };
      }
      // Admin nao pode promover para super admin
      if (parsed.role === "super_admin") {
        return { success: false, error: "Sem permissão para definir Super Admin" };
      }
    }

    const updateData: Record<string, unknown> = {};

    if (parsed.name !== undefined) updateData.name = parsed.name;
    if (parsed.email !== undefined) {
      const existing = await prisma.user.findFirst({
        where: { email: parsed.email, id: { not: userId } },
      });
      if (existing) return { success: false, error: "E-mail já em uso" };
      updateData.email = parsed.email;
    }
    if (parsed.password !== undefined)
      updateData.password = await bcrypt.hash(parsed.password, 12);
    if (parsed.role !== undefined) {
      updateData.isSuperAdmin = parsed.role === "super_admin";
    }
    if (parsed.isActive !== undefined) updateData.isActive = parsed.isActive;

    await prisma.user.update({ where: { id: userId }, data: updateData });
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, error: "Dados inválidos" };
    console.error("[users] Erro ao atualizar:", error);
    return { success: false, error: "Erro ao atualizar usuário" };
  }
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { success: false, error: "Não autenticado" };

  const isSuperAdmin = currentUser.isSuperAdmin;
  const isAdmin = !isSuperAdmin && (await isCompanyAdmin(currentUser.id));

  if (!isSuperAdmin && !isAdmin) {
    return { success: false, error: "Acesso negado" };
  }

  try {
    // Buscar o usuario alvo
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isSuperAdmin: true,
        memberships: { select: { role: true } },
      },
    });

    if (!targetUser) return { success: false, error: "Usuário não encontrado" };

    // Super admin nunca pode ser deletado
    if (targetUser.isSuperAdmin) {
      return { success: false, error: "Super Admin não pode ser excluído" };
    }

    // Admin so pode deletar manager e viewer
    if (!isSuperAdmin) {
      if (targetUser.memberships.some((m) => m.role === "company_admin")) {
        return { success: false, error: "Sem permissão para excluir Admin" };
      }
    }

    // Nao pode deletar a si mesmo
    if (userId === currentUser.id) {
      return { success: false, error: "Você não pode excluir a si mesmo" };
    }

    // Remover memberships primeiro, depois o user
    await prisma.userCompanyMembership.deleteMany({
      where: { userId },
    });
    await prisma.user.delete({ where: { id: userId } });

    return { success: true };
  } catch (error) {
    console.error("[users] Erro ao deletar:", error);
    return { success: false, error: "Erro ao excluir usuário" };
  }
}

// --- Membership management ---

export async function getCompanyMembers(
  companyId: string
): Promise<ActionResult<MemberItem[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Não autenticado" };

  // Super admin ou membro da empresa pode visualizar
  if (!user.isSuperAdmin) {
    const membership = await prisma.userCompanyMembership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId } },
    });
    if (!membership) return { success: false, error: "Acesso negado" };
  }

  const members = await prisma.userCompanyMembership.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      role: true,
      isActive: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  return {
    success: true,
    data: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      userName: m.user.name,
      userEmail: m.user.email,
      role: m.role,
      isActive: m.isActive,
      createdAt: m.createdAt,
    })),
  };
}

export async function addCompanyMember(
  data: z.infer<typeof AddMemberSchema>
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) return { success: false, error: "Acesso negado" };

  try {
    const parsed = AddMemberSchema.parse(data);

    const existing = await prisma.userCompanyMembership.findUnique({
      where: {
        userId_companyId: {
          userId: parsed.userId,
          companyId: parsed.companyId,
        },
      },
    });
    if (existing)
      return { success: false, error: "Usuário já é membro desta empresa" };

    await prisma.userCompanyMembership.create({
      data: {
        userId: parsed.userId,
        companyId: parsed.companyId,
        role: parsed.role as CompanyRole,
      },
    });

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, error: "Dados inválidos" };
    console.error("[users] Erro ao adicionar membro:", error);
    return { success: false, error: "Erro ao adicionar membro" };
  }
}

export async function updateMembership(
  data: z.infer<typeof UpdateMemberSchema>
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) return { success: false, error: "Acesso negado" };

  try {
    const parsed = UpdateMemberSchema.parse(data);
    const updateData: Record<string, unknown> = {};
    if (parsed.role !== undefined) updateData.role = parsed.role;
    if (parsed.isActive !== undefined) updateData.isActive = parsed.isActive;

    await prisma.userCompanyMembership.update({
      where: { id: parsed.membershipId },
      data: updateData,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, error: "Dados inválidos" };
    console.error("[users] Erro ao atualizar membro:", error);
    return { success: false, error: "Erro ao atualizar membro" };
  }
}

export async function removeMembership(
  membershipId: string
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) return { success: false, error: "Acesso negado" };

  await prisma.userCompanyMembership.delete({ where: { id: membershipId } });
  return { success: true };
}
