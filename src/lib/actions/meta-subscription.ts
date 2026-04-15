"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import * as graphApi from "@/lib/meta/graph-api";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { publishRealtimeEvent } from "@/lib/realtime";
import { acquireMetaLock, releaseMetaLock, enforceMetaRateLimit } from "@/lib/rate-limit/meta";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

const DEFAULT_FIELDS = (
  process.env.META_SUBSCRIPTION_FIELDS ??
  "messages,message_echoes,messaging_postbacks,message_template_status_update"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function validateCallbackBase(): string | null {
  const url = process.env.NEXTAUTH_URL;
  if (!url) return "NEXTAUTH_URL ausente";
  try {
    const parsed = new URL(url);
    if (process.env.NODE_ENV === "production") {
      if (parsed.protocol !== "https:") return "callback_url deve ser HTTPS";
      if (parsed.hostname === "localhost" || parsed.hostname.startsWith("127.")) {
        return "callback_url não pode ser localhost em produção";
      }
    }
    return null;
  } catch {
    return "NEXTAUTH_URL inválida";
  }
}

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

export async function subscribeWebhook(companyId: string): Promise<ActionResult> {
  const parsed = companyIdSchema.safeParse({ companyId });
  if (!parsed.success) return { success: false, error: "Input inválido" };

  const auth = await authorize(companyId);
  if (!auth.ok) return { success: false, error: auth.error };

  const locked = await acquireMetaLock(companyId);
  if (!locked) return { success: false, error: "Outra operação em andamento" };

  try {
    const rl = await enforceMetaRateLimit(companyId);
    if (!rl.allowed) {
      return { success: false, error: "Rate limit excedido. Tente em alguns minutos." };
    }

    const callbackErr = validateCallbackBase();
    if (callbackErr) return { success: false, error: callbackErr };

    const cred = await prisma.companyCredential.findUnique({ where: { companyId } });
    if (!cred) return { success: false, error: "Credenciais não cadastradas" };
    const missing: string[] = [];
    if (!cred.metaAppId) missing.push("metaAppId");
    if (!cred.wabaId) missing.push("wabaId");
    if (!cred.verifyToken) missing.push("verifyToken");
    if (!cred.metaSystemUserToken) missing.push("metaSystemUserToken");
    if (missing.length) {
      return { success: false, error: `Campos faltando: ${missing.join(", ")}` };
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return { success: false, error: "Empresa não encontrada" };

    const callbackUrl = `${process.env.NEXTAUTH_URL}/api/webhook/${company.webhookKey}`;
    const verifyToken = decrypt(cred.verifyToken!);
    const token = decrypt(cred.metaSystemUserToken!);

    await prisma.companyCredential.update({
      where: { companyId },
      data: { metaSubscriptionStatus: "pending", metaSubscriptionError: null },
    });
    void publishRealtimeEvent({ type: "credential:updated", companyId });

    const started = Date.now();
    try {
      await graphApi.subscribeFields(
        cred.metaAppId!,
        {
          object: "whatsapp_business_account",
          callbackUrl,
          verifyToken,
          fields: DEFAULT_FIELDS,
        },
        token
      );
      await graphApi.subscribeApp(cred.wabaId!, token);

      await prisma.companyCredential.update({
        where: { companyId },
        data: {
          metaSubscriptionStatus: "active",
          metaSubscribedAt: new Date(),
          metaSubscribedFields: DEFAULT_FIELDS,
          metaSubscribedCallbackUrl: callbackUrl,
          metaSubscriptionError: null,
        },
      });

      void logAudit({
        actorType: "user",
        actorId: auth.user.id,
        actorLabel: auth.user.email ?? auth.user.id,
        companyId,
        action: "meta_webhook.subscribe",
        resourceType: "CompanyCredential",
        resourceId: cred.id,
        details: { success: true, durationMs: Date.now() - started, fields: DEFAULT_FIELDS },
      });
      void createNotification({
        companyId,
        type: "info",
        title: "Webhook inscrito na Meta",
        message: `Callback ${callbackUrl} registrado.`,
        link: `/companies/${companyId}`,
      });
      void publishRealtimeEvent({ type: "credential:updated", companyId });

      return { success: true };
    } catch (e) {
      const errorStr = graphApi.serializeErrorSafe(e);
      await prisma.companyCredential.update({
        where: { companyId },
        data: { metaSubscriptionStatus: "error", metaSubscriptionError: errorStr },
      });
      void logAudit({
        actorType: "user",
        actorId: auth.user.id,
        actorLabel: auth.user.email ?? auth.user.id,
        companyId,
        action: "meta_webhook.subscribe",
        resourceType: "CompanyCredential",
        resourceId: cred.id,
        details: { success: false, error: errorStr, durationMs: Date.now() - started },
      });
      void createNotification({
        companyId,
        type: "error",
        title: "Falha ao inscrever webhook na Meta",
        message: errorStr.slice(0, 200),
        link: `/companies/${companyId}`,
      });
      void publishRealtimeEvent({ type: "credential:updated", companyId });
      return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
    }
  } finally {
    await releaseMetaLock(companyId);
  }
}

export async function unsubscribeWebhook(companyId: string): Promise<ActionResult> {
  const parsed = companyIdSchema.safeParse({ companyId });
  if (!parsed.success) return { success: false, error: "Input inválido" };
  const auth = await authorize(companyId);
  if (!auth.ok) return { success: false, error: auth.error };

  const locked = await acquireMetaLock(companyId);
  if (!locked) return { success: false, error: "Outra operação em andamento" };

  try {
    const cred = await prisma.companyCredential.findUnique({ where: { companyId } });
    if (!cred) return { success: false, error: "Credenciais não cadastradas" };

    const errors: string[] = [];
    if (cred.metaSystemUserToken && cred.wabaId) {
      const token = decrypt(cred.metaSystemUserToken);
      try {
        await graphApi.unsubscribeApp(cred.wabaId, token);
      } catch (e) {
        errors.push(graphApi.serializeErrorSafe(e));
      }
    }

    await prisma.companyCredential.update({
      where: { companyId },
      data: {
        metaSubscriptionStatus: "not_configured",
        metaSubscribedAt: null,
        metaSubscribedFields: [],
        metaSubscribedCallbackUrl: null,
        metaSubscriptionError: errors.length ? errors.join(" | ").slice(0, 500) : null,
      },
    });

    void logAudit({
      actorType: "user",
      actorId: auth.user.id,
      actorLabel: auth.user.email ?? auth.user.id,
      companyId,
      action: "meta_webhook.unsubscribe",
      resourceType: "CompanyCredential",
      resourceId: cred.id,
      details: { errors },
    });
    void createNotification({
      companyId,
      type: errors.length ? "warning" : "info",
      title: "Webhook desinscrito",
      message: errors.length
        ? "Desinscrito localmente com avisos da Meta."
        : "Desinscrito com sucesso.",
      link: `/companies/${companyId}`,
    });
    void publishRealtimeEvent({ type: "credential:updated", companyId });
    return { success: true };
  } finally {
    await releaseMetaLock(companyId);
  }
}
