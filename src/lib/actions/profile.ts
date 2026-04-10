"use server";

import { nanoid } from "nanoid";
import { compare, hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { sendEmailChangeVerification } from "@/lib/email";

type ActionResult = {
  success: boolean;
  error?: string;
};

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hora
const RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutos

/**
 * Retorna os dados do perfil do usuário atual.
 */
export async function getProfile() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { success: false as const, error: "Não autenticado" };

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      theme: true,
      isSuperAdmin: true,
      createdAt: true,
    },
  });

  if (!user) return { success: false as const, error: "Usuário não encontrado" };

  return { success: true as const, data: user };
}

/**
 * Atualiza nome e avatar do perfil.
 */
export async function updateProfile(
  name: string,
  avatarUrl: string | null
): Promise<ActionResult> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Não autenticado" };

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      return { success: false, error: "Nome deve ter no mínimo 2 caracteres" };
    }

    await prisma.user.update({
      where: { id: currentUser.id },
      data: { name: trimmedName, avatarUrl },
    });

    revalidatePath("/profile");
    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    console.error("[updateProfile]", error);
    return { success: false, error: "Erro ao atualizar perfil" };
  }
}

/**
 * Altera a senha do usuário (exige senha atual).
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Não autenticado" };

    if (newPassword.length < 6) {
      return { success: false, error: "A nova senha deve ter no mínimo 6 caracteres" };
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { password: true },
    });

    if (!user) return { success: false, error: "Usuário não encontrado" };

    const valid = await compare(currentPassword, user.password);
    if (!valid) {
      return { success: false, error: "Senha atual incorreta" };
    }

    const hashedPassword = await hash(newPassword, 12);

    await prisma.user.update({
      where: { id: currentUser.id },
      data: { password: hashedPassword },
    });

    return { success: true };
  } catch (error) {
    console.error("[changePassword]", error);
    return { success: false, error: "Erro ao alterar senha" };
  }
}

/**
 * Atualiza o tema do usuário (aplicação imediata).
 */
export async function updateTheme(
  theme: "dark" | "light" | "system"
): Promise<ActionResult> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Não autenticado" };

    await prisma.user.update({
      where: { id: currentUser.id },
      data: { theme },
    });

    // Não chamar revalidatePath — o next-themes controla a UI via localStorage.
    // Persistência no banco é apenas para sync futuro entre dispositivos.

    return { success: true };
  } catch (error) {
    console.error("[updateTheme]", error);
    return { success: false, error: "Erro ao atualizar tema" };
  }
}

/**
 * Solicita alteração de e-mail. Envia verificação para o novo endereço.
 */
export async function requestEmailChange(
  newEmail: string,
  currentPassword: string
): Promise<ActionResult> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Não autenticado" };

    const normalizedEmail = newEmail.trim().toLowerCase();

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return { success: false, error: "E-mail inválido. Use o formato usuario@dominio.com" };
    }

    if (normalizedEmail === currentUser.email) {
      return { success: false, error: "O novo e-mail é igual ao atual" };
    }

    // Validar senha
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { password: true, name: true },
    });

    if (!user) return { success: false, error: "Usuário não encontrado" };

    const valid = await compare(currentPassword, user.password);
    if (!valid) {
      return { success: false, error: "Senha incorreta" };
    }

    // Verificar se email já está em uso
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      return { success: false, error: "Este e-mail já está em uso" };
    }

    // Rate limit
    const recentToken = await prisma.emailChangeToken.findFirst({
      where: {
        userId: currentUser.id,
        createdAt: { gte: new Date(Date.now() - RATE_LIMIT_MS) },
      },
    });

    if (recentToken) {
      return { success: false, error: "Aguarde 2 minutos antes de solicitar novamente" };
    }

    // Gerar token
    const token = nanoid(48);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    await prisma.emailChangeToken.create({
      data: {
        userId: currentUser.id,
        newEmail: normalizedEmail,
        token,
        expiresAt,
      },
    });

    // Enviar email
    const baseUrl = process.env.NEXTAUTH_URL || "https://roteadorwebhook.nexusai360.com";
    const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

    await sendEmailChangeVerification(normalizedEmail, user.name, verifyUrl);

    return { success: true };
  } catch (error) {
    console.error("[requestEmailChange]", error);
    return { success: false, error: "Erro ao processar solicitação" };
  }
}

/**
 * Confirma a troca de e-mail usando o token.
 */
export async function confirmEmailChange(token: string): Promise<ActionResult> {
  try {
    if (!token) {
      return { success: false, error: "Token inválido" };
    }

    const emailToken = await prisma.emailChangeToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, isActive: true } } },
    });

    if (!emailToken) {
      return { success: false, error: "Link inválido ou expirado" };
    }

    if (emailToken.usedAt) {
      return { success: false, error: "Este link já foi utilizado" };
    }

    if (emailToken.expiresAt < new Date()) {
      return { success: false, error: "Link expirado. Solicite novamente" };
    }

    if (!emailToken.user.isActive) {
      return { success: false, error: "Conta desativada" };
    }

    // Verificar se email ainda está disponível
    const existingUser = await prisma.user.findUnique({
      where: { email: emailToken.newEmail },
      select: { id: true },
    });

    if (existingUser) {
      return { success: false, error: "Este e-mail já está em uso por outra conta" };
    }

    // Atualizar email e marcar token como usado
    await prisma.$transaction([
      prisma.user.update({
        where: { id: emailToken.userId },
        data: { email: emailToken.newEmail },
      }),
      prisma.emailChangeToken.update({
        where: { id: emailToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { success: true };
  } catch (error) {
    console.error("[confirmEmailChange]", error);
    return { success: false, error: "Erro ao confirmar e-mail" };
  }
}
