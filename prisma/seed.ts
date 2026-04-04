import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ─── Super Admin ────────────────────────────────────────────────
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  let adminId: string | null = null;

  if (!email || !password) {
    console.log("[seed] ADMIN_EMAIL e ADMIN_PASSWORD não definidos. Pulando seed do admin.");
  } else {
    if (password.length < 12) {
      throw new Error("ADMIN_PASSWORD deve ter no mínimo 12 caracteres");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`[seed] Super admin ${email} já existe. Pulando.`);
      adminId = existing.id;
    } else {
      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await prisma.user.create({
        data: {
          name: "Super Admin",
          email,
          password: hashedPassword,
          isSuperAdmin: true,
        },
      });

      console.log(`[seed] Super admin criado: ${user.email} (${user.id})`);
      adminId = user.id;
    }
  }

  // ─── GlobalSettings defaults ────────────────────────────────────

  // Se não temos admin, buscar qualquer super admin existente para o updated_by
  if (!adminId) {
    const anyAdmin = await prisma.user.findFirst({
      where: { isSuperAdmin: true },
      select: { id: true },
    });
    adminId = anyAdmin?.id ?? null;
  }

  if (!adminId) {
    console.log("[seed] Nenhum admin encontrado. Pulando seed de GlobalSettings.");
    return;
  }

  const defaultSettings: Array<{ key: string; value: unknown }> = [
    { key: "retry_max_retries", value: 3 },
    { key: "retry_intervals_seconds", value: [10, 30, 90] },
    { key: "retry_strategy", value: "exponential" },
    { key: "retry_jitter_enabled", value: true },
    { key: "log_full_retention_days", value: 90 },
    { key: "log_summary_retention_days", value: 180 },
    { key: "notify_platform_enabled", value: true },
    { key: "notify_email_enabled", value: true },
    { key: "notify_whatsapp_enabled", value: true },
    { key: "notify_failure_threshold", value: 5 },
    { key: "notify_recipients", value: "admins" },
  ];

  for (const { key, value } of defaultSettings) {
    const existing = await prisma.globalSettings.findUnique({
      where: { key },
    });

    if (existing) {
      console.log(`[seed] GlobalSettings "${key}" já existe (valor: ${JSON.stringify(existing.value)}). Pulando.`);
      continue;
    }

    await prisma.globalSettings.create({
      data: {
        key,
        value: value as any,
        updatedBy: adminId,
      },
    });

    console.log(`[seed] GlobalSettings "${key}" criado com valor: ${JSON.stringify(value)}`);
  }
}

main()
  .catch((e) => {
    console.error("[seed] Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
