import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";
import {
  exchangeCode,
  exchangeForLongLivedToken,
  validateBusinessAccess,
} from "@/lib/meta/oauth";
import { serializeErrorSafe } from "@/lib/meta/graph-api";
import {
  acquireMetaLock,
  releaseMetaLock,
  enforceMetaRateLimit,
} from "@/lib/rate-limit/meta";
import {
  subscribeWebhookUnlocked,
  unsubscribeWebhookUnlocked,
} from "@/lib/actions/meta-subscription";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { publishRealtimeEvent } from "@/lib/realtime";
import { redis } from "@/lib/redis";

const bodySchema = z.object({
  companyId: z.string().uuid(),
  code: z.string().min(1),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  state: z.string().min(16),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const origin = req.headers.get("origin");
  if (!origin || origin !== process.env.NEXTAUTH_URL) {
    return NextResponse.json({ error: "Origin inválido" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Input inválido" }, { status: 400 });
  const { companyId, code, wabaId, phoneNumberId, state } = parsed.data;

  if (!user.isSuperAdmin) {
    const m = await prisma.userCompanyMembership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId } },
    });
    if (!m || !m.isActive || m.role !== "company_admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  }

  const stateKey = `meta:oauth:state:${user.id}:${companyId}`;
  const stored = await redis.get(stateKey);
  if (!stored || stored !== state) {
    return NextResponse.json({ error: "State inválido" }, { status: 403 });
  }
  await redis.del(stateKey);

  const rl = await enforceMetaRateLimit(companyId);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const locked = await acquireMetaLock(companyId);
  if (!locked) return NextResponse.json({ error: "Operação em andamento" }, { status: 409 });

  try {
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/meta/oauth/callback`;
    const short = await exchangeCode(code, redirectUri);
    const long = await exchangeForLongLivedToken(short.accessToken);
    await validateBusinessAccess(long.accessToken, wabaId, phoneNumberId);

    const existing = await prisma.companyCredential.findUnique({ where: { companyId } });
    if (existing?.wabaId && existing.wabaId !== wabaId) {
      await unsubscribeWebhookUnlocked(companyId, {
        actor: "user",
        userId: user.id,
        userLabel: user.email ?? user.id,
      });
    }

    const expiresAt = new Date(Date.now() + long.expiresIn * 1000);
    // create: preenche também metaAppId/metaAppSecret/verifyToken iniciais.
    // update: só atualiza o que o ES controla; preserva verifyToken / metaSystemUserToken / metaAppId manuais.
    await prisma.companyCredential.upsert({
      where: { companyId },
      update: {
        accessToken: encrypt(long.accessToken),
        accessTokenExpiresAt: expiresAt,
        wabaId,
        phoneNumberId,
        connectedViaEmbeddedSignup: true,
        connectedAt: new Date(),
      },
      create: {
        companyId,
        metaAppId: process.env.META_APP_ID!,
        metaAppSecret: encrypt(process.env.META_APP_SECRET!),
        verifyToken: encrypt(randomBytes(24).toString("hex")),
        accessToken: encrypt(long.accessToken),
        accessTokenExpiresAt: expiresAt,
        wabaId,
        phoneNumberId,
        connectedViaEmbeddedSignup: true,
        connectedAt: new Date(),
      },
    });

    void subscribeWebhookUnlocked(companyId, {
      actor: "user",
      userId: user.id,
      userLabel: user.email ?? user.id,
    }).catch((e) => console.error("[embedded-signup] subscribe falhou:", e));

    void logAudit({
      actorType: "user",
      actorId: user.id,
      actorLabel: user.email ?? user.id,
      companyId,
      action: "meta_embedded_signup.connected",
      resourceType: "CompanyCredential",
      details: { wabaId, phoneNumberId },
    });
    void createNotification({
      companyId,
      type: "info",
      title: "WhatsApp conectado via Embedded Signup",
      message: `WABA ${wabaId} vinculada.`,
      link: `/companies/${companyId}`,
    });
    void publishRealtimeEvent({ type: "credential:updated", companyId });

    return NextResponse.json({ success: true, data: { wabaId, phoneNumberId } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : serializeErrorSafe(e) },
      { status: 500 }
    );
  } finally {
    await releaseMetaLock(companyId);
  }
}
