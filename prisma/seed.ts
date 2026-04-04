import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("[seed] ADMIN_EMAIL e ADMIN_PASSWORD não definidos. Pulando seed.");
    return;
  }

  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD deve ter no mínimo 12 caracteres");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] Super admin ${email} já existe. Pulando.`);
    return;
  }

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
}

main()
  .catch((e) => {
    console.error("[seed] Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
