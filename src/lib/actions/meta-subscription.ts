"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import * as graphApi from "@/lib/meta/graph-api";
import { logAudit } from "@/lib/audit";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

const companyIdSchema = z.object({ companyId: z.string().uuid() });

interface AuthOk {
  ok: true;
  user: { id: string; email: string; isSuperAdmin: boolean };
}
interface AuthFail {
  ok: false;
  error: string;
}

async function authorize(companyId: string): Promise<AuthOk | AuthFail> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (!user.isSuperAdmin) {
    const m = await prisma.userCompanyMembership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId } },
    });
    if (!m || !m.isActive || m.role !== "company_admin") {
      return { ok: false, error: "Acesso negado" };
    }
  }
  return { ok: true, user };
}

export async function testMetaConnection(companyId: string): Promise<ActionResult> {
  const parsed = companyIdSchema.safeParse({ companyId });
  if (!parsed.success) return { success: false, error: "Input inválido" };

  const auth = await authorize(companyId);
  if (!auth.ok) return { success: false, error: auth.error };

  const cred = await prisma.companyCredential.findUnique({ where: { companyId } });
  if (!cred) return { success: false, error: "Credenciais não cadastradas" };
  const missing: string[] = [];
  if (!cred.accessToken) missing.push("accessToken");
  if (!cred.phoneNumberId) missing.push("phoneNumberId");
  if (missing.length) return { success: false, error: `Campos faltando: ${missing.join(", ")}` };

  const started = Date.now();
  try {
    const info = await graphApi.getPhoneNumber(cred.phoneNumberId!, decrypt(cred.accessToken));
    void logAudit({
      actorType: "user",
      actorId: auth.user.id,
      actorLabel: auth.user.email ?? auth.user.id,
      companyId,
      action: "meta_webhook.test",
      resourceType: "CompanyCredential",
      resourceId: cred.id,
      details: { success: true, durationMs: Date.now() - started },
    });
    return { success: true, data: info };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    void logAudit({
      actorType: "user",
      actorId: auth.user.id,
      actorLabel: auth.user.email ?? auth.user.id,
      companyId,
      action: "meta_webhook.test",
      resourceType: "CompanyCredential",
      resourceId: cred.id,
      details: { success: false, error: message, durationMs: Date.now() - started },
    });
    return { success: false, error: message };
  }
}
