import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicRoute =
        nextUrl.pathname === '/login' ||
        nextUrl.pathname === '/forgot-password' ||
        nextUrl.pathname === '/reset-password' ||
        nextUrl.pathname === '/verify-email' ||
        nextUrl.pathname.startsWith('/api/webhook/') ||
        nextUrl.pathname.startsWith('/api/auth/');

      if (isPublicRoute) return true;
      if (isLoggedIn) return true;
      return false; // Redirect para /login
    },
    async jwt({ token, user }) {
      // Login inicial: setar todos os campos do token
      if (user) {
        token.id = user.id!;
        token.isSuperAdmin = (user as any).isSuperAdmin;
        token.avatarUrl = (user as any).avatarUrl;
        token.theme = (user as any).theme;
        token.name = user.name;
      }

      // Em TODA requisição autenticada, atualizar dados críticos do DB
      // Garante que mudanças de role/status tomam efeito imediato (não após 7 dias)
      if (token.id) {
        try {
          const { prisma } = await import("@/lib/prisma");
          const freshUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              isSuperAdmin: true,
              isActive: true,
              name: true,
              avatarUrl: true,
              theme: true,
            },
          });
          if (freshUser) {
            token.isSuperAdmin = freshUser.isSuperAdmin;
            token.name = freshUser.name;
            token.avatarUrl = freshUser.avatarUrl;
            token.theme = freshUser.theme;

            // Se o usuário foi desativado, invalidar a sessão
            if (!freshUser.isActive) {
              return null as any;
            }
          }
        } catch {
          // Se a query falhar, manter token existente (não quebrar auth)
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).isSuperAdmin = token.isSuperAdmin as boolean;
        (session.user as any).avatarUrl = token.avatarUrl as string | null;
        (session.user as any).theme = token.theme as string;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 dias
  },
  providers: [], // Adicionados no auth.ts (não edge-compatible)
} satisfies NextAuthConfig;
