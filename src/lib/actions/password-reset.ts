"use server";

import { nanoid } from "nanoid";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";

type ActionResult = {
  success: boolean;
  error?: string;
};

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hora
const RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutos entre pedidos

/**
 * Solicita redefinição de senha. Envia email com link de reset.
 * Sempre retorna sucesso para não vazar se o email existe.
 */
export async function requestPasswordReset(email: string): Promise<ActionResult> {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return { success: false, error: "E-mail inválido" };
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true, isActive: true },
    });

    // Não revelar se o email existe
    if (!user || !user.isActive) {
      return { success: true };
    }

    // Rate limit: impedir spam de tokens
    const recentToken = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - RATE_LIMIT_MS) },
      },
    });

    if (recentToken) {
      return { success: true }; // Não revelar o rate limit
    }

    // Gerar token seguro
    const token = nanoid(48);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Montar URL e enviar email
    const baseUrl = process.env.NEXTAUTH_URL || "https://roteadorwebhook.nexusai360.com";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    await sendPasswordResetEmail(user.email, user.name, resetUrl);

    return { success: true };
  } catch (error) {
    console.error("[requestPasswordReset]", error);
    return { success: false, error: "Erro ao processar solicitação" };
  }
}

/**
 * Redefine a senha usando um token válido.
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    if (!token || !newPassword) {
      return { success: false, error: "Dados inválidos" };
    }

    if (newPassword.length < 6) {
      return { success: false, error: "A senha deve ter no mínimo 6 caracteres" };
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, isActive: true } } },
    });

    if (!resetToken) {
      return { success: false, error: "Link inválido ou expirado" };
    }

    if (resetToken.usedAt) {
      return { success: false, error: "Este link já foi utilizado" };
    }

    if (resetToken.expiresAt < new Date()) {
      return { success: false, error: "Link expirado. Solicite um novo" };
    }

    if (!resetToken.user.isActive) {
      return { success: false, error: "Conta desativada" };
    }

    // Atualizar senha e marcar token como usado
    const hashedPassword = await hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { success: true };
  } catch (error) {
    console.error("[resetPassword]", error);
    return { success: false, error: "Erro ao redefinir senha" };
  }
}
