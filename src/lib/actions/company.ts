"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  createCompanySchema,
  updateCompanySchema,
  type CreateCompanyInput,
  type UpdateCompanyInput,
} from "@/lib/validations/company";
import { slugify } from "@/lib/utils/slugify";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Retorna as empresas acessiveis pelo usuario autenticado.
 * Super admin: todas. Demais: filtradas por UserCompanyMembership ativa.
 */
export async function getCompanies(options?: {
  includeInactive?: boolean;
}): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };

    const where: Record<string, unknown> = {};

    if (!options?.includeInactive) {
      where.isActive = true;
    }

    // Tenant scoping — quando nao for super_admin, filtrar por membership
    if (!user.isSuperAdmin) {
      where.memberships = {
        some: {
          userId: user.id,
          isActive: true,
        },
      };
    }

    const companies = await prisma.company.findMany({
      where,
      include: {
        credential: {
          select: { id: true }, // so verifica se existe, sem expor dados
        },
        _count: {
          select: { memberships: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: companies };
  } catch (error) {
    console.error("[getCompanies]", error);
    return { success: false, error: "Erro ao buscar empresas" };
  }
}

/**
 * Retorna uma empresa pelo ID, com verificacao de acesso.
 */
export async function getCompanyById(
  companyId: string
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        credential: {
          select: { id: true },
        },
        _count: {
          select: {
            memberships: true,
            routes: true,
          },
        },
      },
    });

    if (!company) {
      return { success: false, error: "Empresa nao encontrada" };
    }

    // Verificar acesso — super_admin bypassa, demais precisam de membership
    if (!user.isSuperAdmin) {
      const membership = await prisma.userCompanyMembership.findUnique({
        where: {
          userId_companyId: { userId: user.id, companyId },
        },
      });
      if (!membership || !membership.isActive) {
        return { success: false, error: "Acesso negado" };
      }
    }

    return { success: true, data: company };
  } catch (error) {
    console.error("[getCompanyById]", error);
    return { success: false, error: "Erro ao buscar empresa" };
  }
}

/**
 * Cria uma nova empresa com webhook_key e slug automaticos.
 * Apenas super_admin pode criar.
 */
export async function createCompany(
  input: CreateCompanyInput
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };

    if (!user.isSuperAdmin) {
      return { success: false, error: "Apenas super admin pode criar empresas" };
    }

    const parsed = createCompanySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Dados invalidos",
      };
    }

    const { name, logoUrl, webhookKey: customWebhookKey } = parsed.data;

    // Gerar slug unico
    let slug = slugify(name);
    const existingSlug = await prisma.company.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${nanoid(6)}`;
    }

    // Usar webhook_key customizada ou gerar com nanoid(21)
    let webhookKey: string;
    if (customWebhookKey) {
      const existingKey = await prisma.company.findUnique({
        where: { webhookKey: customWebhookKey },
      });
      if (existingKey) {
        return { success: false, error: "Webhook key ja esta em uso por outra empresa" };
      }
      webhookKey = customWebhookKey;
    } else {
      webhookKey = nanoid(21);
    }

    const company = await prisma.company.create({
      data: {
        name,
        slug,
        webhookKey,
        logoUrl: logoUrl || null,
      },
    });

    revalidatePath("/companies");

    return { success: true, data: company };
  } catch (error) {
    console.error("[createCompany]", error);
    return { success: false, error: "Erro ao criar empresa" };
  }
}

/**
 * Atualiza uma empresa. Soft delete via isActive = false.
 * Apenas super_admin e company_admin da empresa podem editar.
 */
export async function updateCompany(
  companyId: string,
  input: UpdateCompanyInput
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };

    // Verificar permissao
    if (!user.isSuperAdmin) {
      const membership = await prisma.userCompanyMembership.findUnique({
        where: {
          userId_companyId: { userId: user.id, companyId },
        },
      });
      if (!membership || membership.role !== "company_admin") {
        return { success: false, error: "Sem permissao" };
      }
    }

    const parsed = updateCompanySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Dados invalidos",
      };
    }

    const existing = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!existing) {
      return { success: false, error: "Empresa nao encontrada" };
    }

    const data: Record<string, unknown> = {};

    if (parsed.data.name !== undefined) {
      data.name = parsed.data.name;
      // Regerar slug se nome mudar
      let slug = slugify(parsed.data.name);
      const existingSlug = await prisma.company.findFirst({
        where: { slug, id: { not: companyId } },
      });
      if (existingSlug) {
        slug = `${slug}-${nanoid(6)}`;
      }
      data.slug = slug;
    }

    if (parsed.data.logoUrl !== undefined) {
      data.logoUrl = parsed.data.logoUrl || null;
    }

    if (parsed.data.isActive !== undefined) {
      data.isActive = parsed.data.isActive;
    }

    if (parsed.data.webhookKey !== undefined) {
      const existingKey = await prisma.company.findUnique({
        where: { webhookKey: parsed.data.webhookKey },
      });
      if (existingKey && existingKey.id !== companyId) {
        return { success: false, error: "Webhook key ja esta em uso por outra empresa" };
      }
      data.webhookKey = parsed.data.webhookKey;
    }

    const company = await prisma.company.update({
      where: { id: companyId },
      data,
    });

    revalidatePath("/companies");
    revalidatePath(`/companies/${companyId}`);

    return { success: true, data: company };
  } catch (error) {
    console.error("[updateCompany]", error);
    return { success: false, error: "Erro ao atualizar empresa" };
  }
}
