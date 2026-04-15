"use server";

import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redis } from "@/lib/redis";

type Result = {
  success: boolean;
  data?: { appId: string; configId: string; redirectUri: string; state: string };
  error?: string;
};

const input = z.object({ companyId: z.string().uuid() });

export async function startEmbeddedSignup(companyId: string): Promise<Result> {
  const parsed = input.safeParse({ companyId });
  if (!parsed.success) return { success: false, error: "Input inválido" };

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Não autenticado" };

  if (!user.isSuperAdmin) {
    const m = await prisma.userCompanyMembership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId } },
    });
    if (!m || !m.isActive || m.role !== "company_admin") {
      return { success: false, error: "Acesso negado" };
    }
  }

  const appId = process.env.META_APP_ID;
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
  if (!appId || !configId) {
    return { success: false, error: "Embedded Signup não configurado" };
  }

  const state = randomBytes(24).toString("hex");
  const key = `meta:oauth:state:${user.id}:${companyId}`;
  await redis.set(key, state, "EX", 600);

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/meta/oauth/callback`;
  return { success: true, data: { appId, configId, redirectUri, state } };
}
