"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { encrypt, decrypt, mask } from "@/lib/encryption";
import {
  upsertCredentialSchema,
  type UpsertCredentialInput,
} from "@/lib/validations/credential";
import { logAudit } from "@/lib/audit";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/** Campos que sao criptografados no banco */
const ENCRYPTED_FIELDS = [
  "metaAppSecret",
  "verifyToken",
  "accessToken",
  "metaSystemUserToken",
] as const;

type EncryptedField = (typeof ENCRYPTED_FIELDS)[number];

/**
 * Retorna credenciais da empresa com campos sensiveis mascarados.
 * NUNCA retorna valores em texto puro.
 */
export async function getCredential(
  companyId: string
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };

    // Verificar acesso
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

    const credential = await prisma.companyCredential.findUnique({
      where: { companyId },
    });

    if (!credential) {
      return { success: true, data: null };
    }

    // Descriptografar e mascarar campos sensiveis
    const masked = {
      id: credential.id,
      companyId: credential.companyId,
      metaAppId: credential.metaAppId,
      metaAppSecret: mask(decrypt(credential.metaAppSecret)),
      verifyToken: mask(decrypt(credential.verifyToken)),
      accessToken: mask(decrypt(credential.accessToken)),
      phoneNumberId: credential.phoneNumberId,
      wabaId: credential.wabaId,
      connectedViaEmbeddedSignup: credential.connectedViaEmbeddedSignup,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };

    const meta = {
      status: credential.metaSubscriptionStatus,
      subscribedAt: credential.metaSubscribedAt?.toISOString() ?? null,
      error: credential.metaSubscriptionError,
      callbackUrl: credential.metaSubscribedCallbackUrl,
      fields: credential.metaSubscribedFields,
    };

    return { success: true, data: { ...masked, meta } };
  } catch (error) {
    console.error("[getCredential]", error);
    return { success: false, error: "Erro ao buscar credenciais" };
  }
}

/**
 * Retorna o valor descriptografado de um campo sensivel especifico.
 * Usado pelo toggle "mostrar" na UI. Requer permissao company_admin ou super_admin.
 */
export async function revealCredentialField(
  companyId: string,
  field: EncryptedField
): Promise<ActionResult<string>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };

    // Apenas super_admin ou company_admin podem revelar
    if (!user.isSuperAdmin) {
      const membership = await prisma.userCompanyMembership.findUnique({
        where: {
          userId_companyId: { userId: user.id, companyId },
        },
      });
      if (!membership || membership.role !== "company_admin") {
        return { success: false, error: "Sem permissao para revelar credenciais" };
      }
    }

    if (!ENCRYPTED_FIELDS.includes(field)) {
      return { success: false, error: "Campo invalido" };
    }

    const credential = await prisma.companyCredential.findUnique({
      where: { companyId },
    });

    if (!credential) {
      return { success: false, error: "Credenciais nao encontradas" };
    }

    const encryptedValue = credential[field];
    if (!encryptedValue) {
      return { success: false, error: "Campo vazio" };
    }
    const decryptedValue = decrypt(encryptedValue);

    return { success: true, data: decryptedValue };
  } catch (error) {
    console.error("[revealCredentialField]", error);
    return { success: false, error: "Erro ao revelar campo" };
  }
}

/**
 * Cria ou atualiza credenciais Meta da empresa (1:1).
 * Campos sensiveis sao criptografados antes de salvar.
 */
export async function upsertCredential(
  companyId: string,
  input: UpsertCredentialInput
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };

    // Apenas super_admin ou company_admin podem gerenciar credenciais
    if (!user.isSuperAdmin) {
      const membership = await prisma.userCompanyMembership.findUnique({
        where: {
          userId_companyId: { userId: user.id, companyId },
        },
      });
      if (!membership || membership.role !== "company_admin") {
        return { success: false, error: "Sem permissao para gerenciar credenciais" };
      }
    }

    const parsed = upsertCredentialSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Dados invalidos",
      };
    }

    // Verificar se a empresa existe
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      return { success: false, error: "Empresa nao encontrada" };
    }

    const {
      metaAppId,
      metaAppSecret,
      verifyToken,
      accessToken,
      phoneNumberId,
      wabaId,
      metaSystemUserToken,
    } = parsed.data;

    // Valores mascarados no front indicam "nao alterar" — reutiliza o valor atual
    const existingRecord = await prisma.companyCredential.findUnique({
      where: { companyId },
    });
    const isMasked = (v: string | undefined) =>
      typeof v === "string" && v.includes("••");

    const finalSecret =
      isMasked(metaAppSecret) && existingRecord?.metaAppSecret
        ? existingRecord.metaAppSecret
        : encrypt(metaAppSecret);

    const finalVerify =
      isMasked(verifyToken) && existingRecord?.verifyToken
        ? existingRecord.verifyToken
        : encrypt(verifyToken);

    const finalAccess =
      isMasked(accessToken) && existingRecord?.accessToken
        ? existingRecord.accessToken
        : encrypt(accessToken);

    // Criptografar campos sensiveis
    const data: Record<string, unknown> = {
      metaAppId,
      metaAppSecret: finalSecret,
      verifyToken: finalVerify,
      accessToken: finalAccess,
      phoneNumberId: phoneNumberId || null,
      wabaId: wabaId || null,
    };

    // metaSystemUserToken: undefined => preserva; null/"" => limpa; string => encrypt
    if (metaSystemUserToken !== undefined) {
      data.metaSystemUserToken =
        metaSystemUserToken && metaSystemUserToken.length > 0
          ? encrypt(metaSystemUserToken)
          : null;
    }

    // Reutiliza o registro ja buscado acima para determinar action do audit
    const existing = existingRecord;

    const credential = await prisma.companyCredential.upsert({
      where: { companyId },
      create: {
        companyId,
        ...data,
      } as any,
      update: data as any,
    });

    // Audit log (fire-and-forget)
    logAudit({
      actorType: "user",
      actorId: user.id,
      actorLabel: user.email ?? "unknown",
      companyId,
      action: existing ? "credential.update" : "credential.create",
      resourceType: "CompanyCredential",
      resourceId: credential.id,
      details: { metaAppId: parsed.data.metaAppId },
    });

    revalidatePath(`/companies/${companyId}`);

    // Retornar mascarado
    return {
      success: true,
      data: {
        id: credential.id,
        companyId: credential.companyId,
        metaAppId: credential.metaAppId,
        metaAppSecret: mask(metaAppSecret),
        verifyToken: mask(verifyToken),
        accessToken: mask(accessToken),
        metaSystemUserToken:
          metaSystemUserToken && metaSystemUserToken.length > 0
            ? mask(metaSystemUserToken)
            : null,
        phoneNumberId: credential.phoneNumberId,
        wabaId: credential.wabaId,
      },
    };
  } catch (error) {
    console.error("[upsertCredential]", error);
    return { success: false, error: "Erro ao salvar credenciais" };
  }
}
