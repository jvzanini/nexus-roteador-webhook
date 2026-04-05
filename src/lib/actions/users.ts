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

// --- Validation ---

const CreateUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  isSuperAdmin: z.boolean().default(false),
});

const UpdateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  isSuperAdmin: z.boolean().optional(),
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

// --- User CRUD (super admin only) ---

export async function getUsers(): Promise<ActionResult<UserItem[]>> {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) return { success: false, error: "Acesso negado" };

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
    },
  });

  return {
    success: true,
    data: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      isSuperAdmin: u.isSuperAdmin,
      isActive: u.isActive,
      createdAt: u.createdAt,
      companiesCount: u._count.memberships,
    })),
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

  if (!found) return { success: false, error: "Usuario nao encontrado" };

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
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) return { success: false, error: "Acesso negado" };

  try {
    const parsed = CreateUserSchema.parse(data);

    const existing = await prisma.user.findUnique({
      where: { email: parsed.email },
    });
    if (existing) return { success: false, error: "E-mail ja cadastrado" };

    const hashedPassword = await bcrypt.hash(parsed.password, 12);

    const created = await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        password: hashedPassword,
        isSuperAdmin: parsed.isSuperAdmin,
        invitedById: user.id,
      },
    });

    return { success: true, data: { id: created.id } };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, error: "Dados invalidos" };
    console.error("[users] Erro ao criar:", error);
    return { success: false, error: "Erro ao criar usuario" };
  }
}

export async function updateUser(
  userId: string,
  data: z.infer<typeof UpdateUserSchema>
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) return { success: false, error: "Acesso negado" };

  try {
    const parsed = UpdateUserSchema.parse(data);
    const updateData: Record<string, unknown> = {};

    if (parsed.name !== undefined) updateData.name = parsed.name;
    if (parsed.email !== undefined) {
      const existing = await prisma.user.findFirst({
        where: { email: parsed.email, id: { not: userId } },
      });
      if (existing) return { success: false, error: "E-mail ja em uso" };
      updateData.email = parsed.email;
    }
    if (parsed.password !== undefined)
      updateData.password = await bcrypt.hash(parsed.password, 12);
    if (parsed.isSuperAdmin !== undefined)
      updateData.isSuperAdmin = parsed.isSuperAdmin;
    if (parsed.isActive !== undefined) updateData.isActive = parsed.isActive;

    await prisma.user.update({ where: { id: userId }, data: updateData });
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, error: "Dados invalidos" };
    console.error("[users] Erro ao atualizar:", error);
    return { success: false, error: "Erro ao atualizar usuario" };
  }
}

// --- Membership management ---

export async function getCompanyMembers(
  companyId: string
): Promise<ActionResult<MemberItem[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };

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
      return { success: false, error: "Usuario ja e membro desta empresa" };

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
      return { success: false, error: "Dados invalidos" };
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
      return { success: false, error: "Dados invalidos" };
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
