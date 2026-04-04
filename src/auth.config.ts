import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicRoute =
        nextUrl.pathname === '/login' ||
        nextUrl.pathname === '/forgot-password' ||
        nextUrl.pathname.startsWith('/api/webhook/') ||
        nextUrl.pathname.startsWith('/api/auth/');

      if (isPublicRoute) return true;
      if (isLoggedIn) return true;
      return false; // Redirect para /login
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isSuperAdmin = (user as any).isSuperAdmin;
        token.avatarUrl = (user as any).avatarUrl;
        token.theme = (user as any).theme;
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
    maxAge: 30 * 60, // 30 minutos de inatividade
  },
  providers: [], // Adicionados no auth.ts (não edge-compatible)
} satisfies NextAuthConfig;
