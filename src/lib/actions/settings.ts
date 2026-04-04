"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

// Defaults (mesmos de global-settings.ts)
const DEFAULTS: Record<string, unknown> = {
  retry_max_retries: 3,
  retry_intervals_seconds: [10, 30, 90],
  retry_strategy: "exponential",
  retry_jitter_enabled: true,
  log_full_retention_days: 90,
  log_summary_retention_days: 180,
  notify_platform_enabled: true,
  notify_email_enabled: true,
  notify_whatsapp_enabled: true,
  notify_failure_threshold: 5,
  notify_recipients: "admins",
};

export interface SettingsData {
  retry_max_retries: number;
  retry_intervals_seconds: number[];
  retry_strategy: "exponential" | "fixed";
  retry_jitter_enabled: boolean;
  log_full_retention_days: number;
  log_summary_retention_days: number;
  notify_platform_enabled: boolean;
  notify_email_enabled: boolean;
  notify_whatsapp_enabled: boolean;
  notify_failure_threshold: number;
  notify_recipients: string;
}

const UpdateSettingsSchema = z.object({
  retry_max_retries: z.number().int().min(0).max(10).optional(),
  retry_intervals_seconds: z
    .array(z.number().int().min(1).max(3600))
    .max(10)
    .optional(),
  retry_strategy: z.enum(["exponential", "fixed"]).optional(),
  retry_jitter_enabled: z.boolean().optional(),
  log_full_retention_days: z.number().int().min(1).max(365).optional(),
  log_summary_retention_days: z.number().int().min(1).max(730).optional(),
  notify_platform_enabled: z.boolean().optional(),
  notify_email_enabled: z.boolean().optional(),
  notify_whatsapp_enabled: z.boolean().optional(),
  notify_failure_threshold: z.number().int().min(1).max(100).optional(),
  notify_recipients: z.string().min(1).optional(),
});

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export async function getAllSettings(): Promise<ActionResult<SettingsData>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };
    if (!user.isSuperAdmin) return { success: false, error: "Acesso negado" };

    const rows = await prisma.globalSettings.findMany();
    const dbValues: Record<string, unknown> = {};
    for (const row of rows) {
      dbValues[row.key] = row.value;
    }

    // Merge: DB values override defaults
    const merged = { ...DEFAULTS, ...dbValues } as unknown as SettingsData;
    return { success: true, data: merged };
  } catch (error) {
    console.error("[settings] Erro ao buscar:", error);
    return { success: false, error: "Erro ao carregar configuracoes" };
  }
}

export async function updateSettings(
  data: Partial<SettingsData>
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };
    if (!user.isSuperAdmin) return { success: false, error: "Acesso negado" };

    const parsed = UpdateSettingsSchema.parse(data);

    const entries = Object.entries(parsed).filter(
      ([, v]) => v !== undefined
    );

    if (entries.length === 0) {
      return { success: false, error: "Nenhuma configuracao para atualizar" };
    }

    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.globalSettings.upsert({
          where: { key },
          update: { value: value as object, updatedBy: user.id },
          create: { key, value: value as object, updatedBy: user.id },
        })
      )
    );

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: "Dados invalidos" };
    }
    console.error("[settings] Erro ao atualizar:", error);
    return { success: false, error: "Erro ao salvar configuracoes" };
  }
}
