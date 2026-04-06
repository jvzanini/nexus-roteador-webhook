import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkLoginRateLimit } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

interface Credentials {
  email: string;
  password: string;
}

interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  platformRole: string;
  avatarUrl: string | null;
  theme: string;
}

export async function authorizeCredentials(
  credentials: Credentials,
  ipAddress: string
): Promise<AuthUser | null> {
  const { email, password } = credentials;

  if (!email || !password) {
    return null;
  }

  // Verificar rate limit antes de qualquer operação
  const rateLimit = await checkLoginRateLimit(email, ipAddress);
  if (!rateLimit.allowed) {
    throw new Error('Muitas tentativas de login. Tente novamente em 15 minutos.');
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
      isSuperAdmin: true,
      platformRole: true,
      isActive: true,
      avatarUrl: true,
      theme: true,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return null;
  }

  // Registrar login no audit log (fire-and-forget)
  logAudit({
    actorType: "user",
    actorId: user.id,
    actorLabel: user.email,
    action: "auth.login",
    resourceType: "User",
    resourceId: user.id,
    details: {},
    ipAddress: ipAddress,
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    platformRole: user.platformRole,
    avatarUrl: user.avatarUrl,
    theme: user.theme,
  };
}

const PUBLIC_ROUTES = ['/login', '/forgot-password'];
const PUBLIC_PREFIXES = ['/api/webhook/', '/api/auth/', '/api/health'];

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
