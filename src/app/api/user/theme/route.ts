import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/user/theme
 * Atualiza o tema do usuário sem disparar re-render do server component.
 * Usado pela sidebar e perfil para persistir preferência sem causar flicker.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const theme = body.theme;

  if (theme !== "dark" && theme !== "light" && theme !== "system") {
    return NextResponse.json({ error: "Tema inválido" }, { status: 400 });
  }

  const userId = (session.user as any).id;

  await prisma.user.update({
    where: { id: userId },
    data: { theme },
  });

  return NextResponse.json({ success: true });
}
