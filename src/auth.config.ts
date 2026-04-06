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
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id!;
        token.isSuperAdmin = (user as any).isSuperAdmin;
        token.avatarUrl = (user as any).avatarUrl;
        token.theme = (user as any).theme;
        token.name = user.name;
      }
      if (trigger === "update" && token.id) {
        const { prisma } = await import("@/lib/prisma");
        const freshUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, avatarUrl: true, theme: true, isSuperAdmin: true },
        });
        if (freshUser) {
          token.name = freshUser.name;
          token.avatarUrl = freshUser.avatarUrl;
          token.theme = freshUser.theme;
          token.isSuperAdmin = freshUser.isSuperAdmin;
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
