"use server";

import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import {
  createWebhookRouteSchema,
  updateWebhookRouteSchema,
  type CreateWebhookRouteInput,
  type UpdateWebhookRouteInput,
} from "@/lib/schemas/webhook-route";
import { revalidatePath } from "next/cache";

export type ActionResult<T = void> = {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

// --- CREATE ---

export async function createWebhookRoute(
  companyId: string,
  input: CreateWebhookRouteInput
): Promise<ActionResult<{ id: string }>> {
  try {
    // Validar input
    const parsed = createWebhookRouteSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Dados invalidos",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const data = parsed.data;

    // Verificar se empresa existe e esta ativa
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, isActive: true },
    });

    if (!company || !company.isActive) {
      return { success: false, error: "Empresa nao encontrada ou inativa" };
    }

    // Validar duplicidade de nome
    const existingName = await prisma.webhookRoute.findFirst({
      where: { companyId, name: data.name, isActive: true },
    });
    if (existingName) {
      return {
        success: false,
        error: "Ja existe uma rota com este nome",
        fieldErrors: { name: ["Ja existe uma rota com este nome nesta empresa"] },
      };
    }

    // Validar duplicidade de URL
    const existingUrl = await prisma.webhookRoute.findFirst({
      where: { companyId, url: data.url, isActive: true },
    });
    if (existingUrl) {
      return {
        success: false,
        error: "Ja existe uma rota com esta URL",
        fieldErrors: { url: ["Ja existe uma rota com esta URL nesta empresa"] },
      };
    }

    // Criptografar secret_key se fornecida
    const encryptedSecretKey = data.secretKey
      ? encrypt(data.secretKey)
      : null;

    // Criar rota
    const route = await prisma.webhookRoute.create({
      data: {
        companyId,
        name: data.name,
        icon: data.icon,
        url: data.url,
        secretKey: encryptedSecretKey,
        events: data.events,
        headers: data.headers ?? undefined,
        timeoutMs: data.timeoutMs,
      },
    });

    revalidatePath(`/companies/${companyId}`);

    return { success: true, data: { id: route.id } };
  } catch (error) {
    console.error("[createWebhookRoute] Erro:", error);
    return { success: false, error: "Erro interno ao criar rota" };
  }
}

// --- UPDATE ---

export async function updateWebhookRoute(
  routeId: string,
  companyId: string,
  input: UpdateWebhookRouteInput
): Promise<ActionResult> {
  try {
    // Validar input
    const parsed = updateWebhookRouteSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: "Dados invalidos",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const data = parsed.data;

    // Verificar se a rota existe e pertence a empresa
    const existingRoute = await prisma.webhookRoute.findFirst({
      where: { id: routeId, companyId, isActive: true },
    });

    if (!existingRoute) {
      return { success: false, error: "Rota nao encontrada" };
    }

    // Validar duplicidade de nome (excluindo a propria rota)
    if (data.name !== undefined) {
      const existingName = await prisma.webhookRoute.findFirst({
        where: { companyId, name: data.name, isActive: true, id: { not: routeId } },
      });
      if (existingName) {
        return {
          success: false,
          error: "Ja existe uma rota com este nome",
          fieldErrors: { name: ["Ja existe uma rota com este nome nesta empresa"] },
        };
      }
    }

    // Validar duplicidade de URL (excluindo a propria rota)
    if (data.url !== undefined) {
      const existingUrl = await prisma.webhookRoute.findFirst({
        where: { companyId, url: data.url, isActive: true, id: { not: routeId } },
      });
      if (existingUrl) {
        return {
          success: false,
          error: "Ja existe uma rota com esta URL",
          fieldErrors: { url: ["Ja existe uma rota com esta URL nesta empresa"] },
        };
      }
    }

    // Montar dados de atualizacao
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.icon !== undefined) updateData.icon = data.icon;
    if (data.url !== undefined) updateData.url = data.url;
    if (data.events !== undefined) updateData.events = data.events;
    if (data.headers !== undefined) updateData.headers = data.headers;
    if (data.timeoutMs !== undefined) updateData.timeoutMs = data.timeoutMs;

    // Criptografar secret_key se fornecida
    if (data.secretKey !== undefined) {
      updateData.secretKey = data.secretKey ? encrypt(data.secretKey) : null;
    }

    await prisma.webhookRoute.update({
      where: { id: routeId },
      data: updateData,
    });

    revalidatePath(`/companies/${companyId}`);

    return { success: true };
  } catch (error) {
    console.error("[updateWebhookRoute] Erro:", error);
    return { success: false, error: "Erro interno ao atualizar rota" };
  }
}

// --- HARD DELETE ---

export async function hardDeleteWebhookRoute(
  routeId: string,
  companyId: string
): Promise<ActionResult> {
  try {
    // Verificar se a rota existe e pertence a empresa
    const existingRoute = await prisma.webhookRoute.findFirst({
      where: { id: routeId, companyId },
    });

    if (!existingRoute) {
      return { success: false, error: "Rota nao encontrada" };
    }

    // Verificar se tem deliveries vinculadas (FK Restrict impede delete)
    const deliveryCount = await prisma.routeDelivery.count({
      where: { routeId },
    });

    if (deliveryCount > 0) {
      return {
        success: false,
        error: `Nao e possivel excluir: existem ${deliveryCount} entregas vinculadas a esta rota. Desative-a ao inves de excluir.`,
      };
    }

    await prisma.webhookRoute.delete({
      where: { id: routeId },
    });

    revalidatePath(`/companies/${companyId}`);

    return { success: true };
  } catch (error) {
    console.error("[hardDeleteWebhookRoute] Erro:", error);
    return { success: false, error: "Erro interno ao excluir rota" };
  }
}

// --- TOGGLE ACTIVE ---

export async function toggleWebhookRouteActive(
  routeId: string,
  companyId: string
): Promise<ActionResult> {
  try {
    const existingRoute = await prisma.webhookRoute.findFirst({
      where: { id: routeId, companyId },
    });

    if (!existingRoute) {
      return { success: false, error: "Rota nao encontrada" };
    }

    await prisma.webhookRoute.update({
      where: { id: routeId },
      data: { isActive: !existingRoute.isActive },
    });

    revalidatePath(`/companies/${companyId}`);

    return { success: true };
  } catch (error) {
    console.error("[toggleWebhookRouteActive] Erro:", error);
    return { success: false, error: "Erro interno ao alterar status da rota" };
  }
}

// --- LIST ---

export async function listWebhookRoutes(companyId: string) {
  try {
    const routes = await prisma.webhookRoute.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        icon: true,
        url: true,
        events: true,
        isActive: true,
        headers: true,
        timeoutMs: true,
        createdAt: true,
        updatedAt: true,
        // secretKey NAO eh retornada na listagem
      },
    });

    return { success: true, data: routes };
  } catch (error) {
    console.error("[listWebhookRoutes] Erro:", error);
    return { success: false, error: "Erro interno ao listar rotas", data: [] };
  }
}

// --- GET SINGLE (para edicao) ---

export async function getWebhookRoute(routeId: string, companyId: string) {
  try {
    const route = await prisma.webhookRoute.findFirst({
      where: { id: routeId, companyId },
      select: {
        id: true,
        name: true,
        icon: true,
        url: true,
        events: true,
        isActive: true,
        headers: true,
        timeoutMs: true,
        createdAt: true,
        updatedAt: true,
        // secretKey NAO eh retornada — exibir placeholder "****"
      },
    });

    if (!route) {
      return { success: false, error: "Rota nao encontrada", data: null };
    }

    return { success: true, data: route };
  } catch (error) {
    console.error("[getWebhookRoute] Erro:", error);
    return { success: false, error: "Erro interno ao buscar rota", data: null };
  }
}
