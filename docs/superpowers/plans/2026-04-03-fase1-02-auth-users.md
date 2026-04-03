# Fase 1 — Sub-plano 2: Auth + Users

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar autenticação completa com NextAuth.js v5 (credentials provider, JWT criptografado stateless), tela de login moderna, middleware de proteção de rotas, tenant scoping por membership e rate limiting no login.

**Architecture:** NextAuth.js v5 com JWT stateless (JWE). Sessão expira após 30min de inatividade. Rate limiting via Redis (5 tentativas/min por email+IP, bloqueio 15min). Tenant scoping via middleware que filtra queries por UserCompanyMembership (super_admin bypassa).

**Tech Stack:** NextAuth.js v5 (Auth.js), bcryptjs, Tailwind CSS, shadcn/ui, Framer Motion, Lucide React, Redis (rate limiting), Zod

**Spec:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md`

**Depends on:** Sub-plano 1 (Setup + Infra) — Next.js, Prisma schema, Redis client, Docker

---

## Estrutura de Arquivos

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx                  # Tela de login (split layout)
│   ├── (protected)/
│   │   └── layout.tsx                    # Layout protegido (redirect se não autenticado)
│   └── api/
│       └── auth/
│           └── [...nextauth]/
│               └── route.ts             # NextAuth API route handler
├── auth.ts                               # NextAuth config principal
├── auth.config.ts                        # NextAuth config edge-compatible
├── middleware.ts                         # Middleware de proteção de rotas
├── lib/
│   ├── rate-limit.ts                    # Rate limiting com Redis
│   ├── tenant.ts                        # Tenant scoping helpers
│   └── auth-helpers.ts                  # Helpers de autenticação
├── components/
│   └── login/
│       ├── login-form.tsx               # Formulário de login
│       └── login-branding.tsx           # Painel de branding (lado esquerdo)
└── __tests__/
    ├── auth.test.ts                     # Testes do NextAuth config
    ├── rate-limit.test.ts               # Testes do rate limiting
    ├── tenant.test.ts                   # Testes do tenant scoping
    ├── middleware.test.ts               # Testes do middleware
    └── login-form.test.tsx              # Testes do formulário de login
```

---

### Task 1: Configurar NextAuth.js v5 com Credentials Provider

**Files:**
- Create: `src/auth.config.ts`, `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/__tests__/auth.test.ts`

- [ ] **Step 1: Escrever testes do auth config**

Criar `src/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Mock rate limiter
const mockCheckRateLimit = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  checkLoginRateLimit: mockCheckRateLimit,
}));

// Importamos o authorize depois dos mocks
import { authorizeCredentials } from '@/lib/auth-helpers';

describe('authorizeCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4 });
  });

  it('retorna null para credenciais inválidas (email vazio)', async () => {
    const result = await authorizeCredentials(
      { email: '', password: 'any' },
      '127.0.0.1'
    );
    expect(result).toBeNull();
  });

  it('retorna null para senha vazia', async () => {
    const result = await authorizeCredentials(
      { email: 'test@test.com', password: '' },
      '127.0.0.1'
    );
    expect(result).toBeNull();
  });

  it('retorna null quando usuário não existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await authorizeCredentials(
      { email: 'notfound@test.com', password: 'password123' },
      '127.0.0.1'
    );
    expect(result).toBeNull();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'notfound@test.com' },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        isSuperAdmin: true,
        isActive: true,
        avatarUrl: true,
        theme: true,
      },
    });
  });

  it('retorna null quando usuário está inativo', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'inactive@test.com',
      name: 'Inactive',
      password: await bcrypt.hash('password123', 12),
      isSuperAdmin: false,
      isActive: false,
      avatarUrl: null,
      theme: 'dark',
    });

    const result = await authorizeCredentials(
      { email: 'inactive@test.com', password: 'password123' },
      '127.0.0.1'
    );
    expect(result).toBeNull();
  });

  it('retorna null quando senha está incorreta', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'user@test.com',
      name: 'User',
      password: await bcrypt.hash('correct-password', 12),
      isSuperAdmin: false,
      isActive: true,
      avatarUrl: null,
      theme: 'dark',
    });

    const result = await authorizeCredentials(
      { email: 'user@test.com', password: 'wrong-password' },
      '127.0.0.1'
    );
    expect(result).toBeNull();
  });

  it('retorna user quando credenciais são válidas', async () => {
    const hashedPassword = await bcrypt.hash('correct-password', 12);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'uuid-123',
      email: 'admin@test.com',
      name: 'Admin',
      password: hashedPassword,
      isSuperAdmin: true,
      isActive: true,
      avatarUrl: 'https://example.com/avatar.png',
      theme: 'dark',
    });

    const result = await authorizeCredentials(
      { email: 'admin@test.com', password: 'correct-password' },
      '127.0.0.1'
    );

    expect(result).toEqual({
      id: 'uuid-123',
      email: 'admin@test.com',
      name: 'Admin',
      isSuperAdmin: true,
      avatarUrl: 'https://example.com/avatar.png',
      theme: 'dark',
    });
  });

  it('rejeita quando rate limit é excedido', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });

    await expect(
      authorizeCredentials(
        { email: 'user@test.com', password: 'any' },
        '127.0.0.1'
      )
    ).rejects.toThrow('Muitas tentativas de login');
  });
});
```

Rodar:

```bash
npx vitest run src/__tests__/auth.test.ts
```

Esperado: todos os testes falham (módulos ainda não existem).

- [ ] **Step 2: Criar auth-helpers.ts**

Criar `src/lib/auth-helpers.ts`:

```typescript
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkLoginRateLimit } from '@/lib/rate-limit';

interface Credentials {
  email: string;
  password: string;
}

interface AuthUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
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

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    avatarUrl: user.avatarUrl,
    theme: user.theme,
  };
}
```

- [ ] **Step 3: Criar auth.config.ts (config edge-compatible)**

Criar `src/auth.config.ts`:

```typescript
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
```

- [ ] **Step 4: Criar auth.ts (config completa com credentials provider)**

Criar `src/auth.ts`:

```typescript
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { authConfig } from './auth.config';
import { authorizeCredentials } from '@/lib/auth-helpers';
import { headers } from 'next/headers';

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const headersList = await headers();
        const ip =
          headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          headersList.get('x-real-ip') ||
          '0.0.0.0';

        const user = await authorizeCredentials(parsed.data, ip);
        return user;
      },
    }),
  ],
});
```

- [ ] **Step 5: Criar types do NextAuth**

Criar `src/types/next-auth.d.ts`:

```typescript
import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      isSuperAdmin: boolean;
      avatarUrl: string | null;
      theme: string;
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    isSuperAdmin: boolean;
    avatarUrl: string | null;
    theme: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    isSuperAdmin: boolean;
    avatarUrl: string | null;
    theme: string;
  }
}
```

- [ ] **Step 6: Criar API route handler**

Criar `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
```

- [ ] **Step 7: Rodar testes e fazer commit**

```bash
npx vitest run src/__tests__/auth.test.ts
```

Esperado: todos os 7 testes passam.

```bash
git add src/auth.ts src/auth.config.ts src/lib/auth-helpers.ts src/types/next-auth.d.ts src/app/api/auth/\[...nextauth\]/route.ts src/__tests__/auth.test.ts
git commit -m "feat(auth): configura NextAuth.js v5 com credentials provider e JWT"
```

---

### Task 2: Rate Limiting no Login

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `src/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Escrever testes do rate limiter**

Criar `src/__tests__/rate-limit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis
const mockRedis = {
  multi: vi.fn(),
  get: vi.fn(),
  ttl: vi.fn(),
};

const mockMultiExec = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

mockRedis.multi.mockReturnValue(mockMultiExec);

vi.mock('@/lib/redis', () => ({
  redis: mockRedis,
}));

import { checkLoginRateLimit } from '@/lib/rate-limit';

describe('checkLoginRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.multi.mockReturnValue(mockMultiExec);
  });

  it('permite login quando não há tentativas anteriores', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 1], [null, 'OK']]);

    const result = await checkLoginRateLimit('user@test.com', '127.0.0.1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('permite login quando há menos de 5 tentativas', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 3], [null, 'OK']]);

    const result = await checkLoginRateLimit('user@test.com', '192.168.1.1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('bloqueia quando atinge 5 tentativas', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 5], [null, 'OK']]);

    const result = await checkLoginRateLimit('user@test.com', '127.0.0.1');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('bloqueia quando há bloqueio ativo (lockout key)', async () => {
    mockRedis.get.mockResolvedValue('1');
    mockRedis.ttl.mockResolvedValue(600);

    const result = await checkLoginRateLimit('user@test.com', '127.0.0.1');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBe(600);
  });

  it('usa chave composta email+IP', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 1], [null, 'OK']]);

    await checkLoginRateLimit('user@test.com', '10.0.0.1');

    expect(mockRedis.get).toHaveBeenCalledWith(
      'login:lockout:user@test.com:10.0.0.1'
    );
  });
});
```

Rodar:

```bash
npx vitest run src/__tests__/rate-limit.test.ts
```

Esperado: falha (módulo não existe).

- [ ] **Step 2: Implementar rate-limit.ts**

Criar `src/lib/rate-limit.ts`:

```typescript
import { redis } from '@/lib/redis';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 60; // 1 minuto
const LOCKOUT_SECONDS = 15 * 60; // 15 minutos

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

function buildKeys(email: string, ip: string) {
  const normalized = email.toLowerCase().trim();
  const suffix = `${normalized}:${ip}`;
  return {
    attempts: `login:attempts:${suffix}`,
    lockout: `login:lockout:${suffix}`,
  };
}

export async function checkLoginRateLimit(
  email: string,
  ip: string
): Promise<RateLimitResult> {
  const keys = buildKeys(email, ip);

  // 1. Verificar lockout ativo
  const isLocked = await redis.get(keys.lockout);
  if (isLocked) {
    const ttl = await redis.ttl(keys.lockout);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: ttl > 0 ? ttl : LOCKOUT_SECONDS,
    };
  }

  // 2. Incrementar contador de tentativas (sliding window)
  const multi = redis.multi();
  multi.incr(keys.attempts);
  multi.expire(keys.attempts, WINDOW_SECONDS);
  const results = await multi.exec();

  const attempts = (results as any)?.[0]?.[1] as number ?? 1;
  const remaining = Math.max(0, MAX_ATTEMPTS - attempts);

  // 3. Se atingiu limite, criar lockout
  if (attempts >= MAX_ATTEMPTS) {
    await redis.set(keys.lockout, '1', 'EX', LOCKOUT_SECONDS);
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining };
}

export async function clearLoginRateLimit(
  email: string,
  ip: string
): Promise<void> {
  const keys = buildKeys(email, ip);
  await redis.del(keys.attempts, keys.lockout);
}
```

- [ ] **Step 3: Rodar testes e fazer commit**

```bash
npx vitest run src/__tests__/rate-limit.test.ts
```

Esperado: todos os 5 testes passam.

```bash
git add src/lib/rate-limit.ts src/__tests__/rate-limit.test.ts
git commit -m "feat(auth): implementa rate limiting no login com Redis (5 tentativas/min)"
```

---

### Task 3: Middleware de Proteção de Rotas

**Files:**
- Create: `src/middleware.ts`
- Create: `src/__tests__/middleware.test.ts`

- [ ] **Step 1: Escrever testes do middleware**

Criar `src/__tests__/middleware.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isPublicRoute } from '@/lib/auth-helpers';

describe('isPublicRoute', () => {
  it('marca /login como público', () => {
    expect(isPublicRoute('/login')).toBe(true);
  });

  it('marca /forgot-password como público', () => {
    expect(isPublicRoute('/forgot-password')).toBe(true);
  });

  it('marca /api/webhook/* como público', () => {
    expect(isPublicRoute('/api/webhook/V1StGXR8_Z5jdHi6B-myT')).toBe(true);
  });

  it('marca /api/auth/* como público', () => {
    expect(isPublicRoute('/api/auth/callback/credentials')).toBe(true);
    expect(isPublicRoute('/api/auth/csrf')).toBe(true);
    expect(isPublicRoute('/api/auth/signin')).toBe(true);
  });

  it('marca /api/health como público', () => {
    expect(isPublicRoute('/api/health')).toBe(true);
  });

  it('bloqueia /dashboard como protegido', () => {
    expect(isPublicRoute('/dashboard')).toBe(false);
  });

  it('bloqueia /companies como protegido', () => {
    expect(isPublicRoute('/companies')).toBe(false);
  });

  it('bloqueia /users como protegido', () => {
    expect(isPublicRoute('/users')).toBe(false);
  });

  it('bloqueia /api/companies como protegido', () => {
    expect(isPublicRoute('/api/companies')).toBe(false);
  });

  it('bloqueia / (raiz) como protegido', () => {
    expect(isPublicRoute('/')).toBe(false);
  });
});
```

Rodar:

```bash
npx vitest run src/__tests__/middleware.test.ts
```

Esperado: falha (função não existe).

- [ ] **Step 2: Adicionar isPublicRoute ao auth-helpers.ts**

Adicionar ao final de `src/lib/auth-helpers.ts`:

```typescript
const PUBLIC_ROUTES = ['/login', '/forgot-password'];
const PUBLIC_PREFIXES = ['/api/webhook/', '/api/auth/', '/api/health'];

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
```

- [ ] **Step 3: Criar middleware.ts**

Criar `src/middleware.ts`:

```typescript
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Matcher: protege tudo exceto assets estáticos e _next
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon)
     * - public assets (images, svgs, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

- [ ] **Step 4: Rodar testes e fazer commit**

```bash
npx vitest run src/__tests__/middleware.test.ts
```

Esperado: todos os 10 testes passam.

```bash
git add src/middleware.ts src/lib/auth-helpers.ts src/__tests__/middleware.test.ts
git commit -m "feat(auth): middleware de proteção de rotas com NextAuth"
```

---

### Task 4: Tenant Scoping Middleware

**Files:**
- Create: `src/lib/tenant.ts`
- Create: `src/__tests__/tenant.test.ts`

- [ ] **Step 1: Escrever testes do tenant scoping**

Criar `src/__tests__/tenant.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  userCompanyMembership: {
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

import {
  getAccessibleCompanyIds,
  buildTenantFilter,
  assertCompanyAccess,
} from '@/lib/tenant';

describe('getAccessibleCompanyIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna undefined para super_admin (acesso total)', async () => {
    const result = await getAccessibleCompanyIds({
      id: 'admin-id',
      isSuperAdmin: true,
    });
    expect(result).toBeUndefined();
    expect(mockPrisma.userCompanyMembership.findMany).not.toHaveBeenCalled();
  });

  it('retorna lista de company IDs para usuário normal', async () => {
    mockPrisma.userCompanyMembership.findMany.mockResolvedValue([
      { companyId: 'company-1' },
      { companyId: 'company-2' },
    ]);

    const result = await getAccessibleCompanyIds({
      id: 'user-id',
      isSuperAdmin: false,
    });
    expect(result).toEqual(['company-1', 'company-2']);
    expect(mockPrisma.userCompanyMembership.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', isActive: true },
      select: { companyId: true },
    });
  });

  it('retorna array vazio para usuário sem memberships', async () => {
    mockPrisma.userCompanyMembership.findMany.mockResolvedValue([]);

    const result = await getAccessibleCompanyIds({
      id: 'lonely-user',
      isSuperAdmin: false,
    });
    expect(result).toEqual([]);
  });
});

describe('buildTenantFilter', () => {
  it('retorna filtro vazio para super_admin (undefined companyIds)', () => {
    const filter = buildTenantFilter(undefined);
    expect(filter).toEqual({});
  });

  it('retorna filtro IN para lista de company IDs', () => {
    const filter = buildTenantFilter(['c1', 'c2']);
    expect(filter).toEqual({ companyId: { in: ['c1', 'c2'] } });
  });

  it('retorna filtro impossível para array vazio', () => {
    const filter = buildTenantFilter([]);
    expect(filter).toEqual({ companyId: { in: [] } });
  });
});

describe('assertCompanyAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('permite acesso para super_admin sem consultar banco', async () => {
    await expect(
      assertCompanyAccess(
        { id: 'admin', isSuperAdmin: true },
        'any-company'
      )
    ).resolves.not.toThrow();
  });

  it('permite acesso quando usuário tem membership ativa', async () => {
    mockPrisma.userCompanyMembership.findMany.mockResolvedValue([
      { companyId: 'target-company' },
      { companyId: 'other-company' },
    ]);

    await expect(
      assertCompanyAccess(
        { id: 'user', isSuperAdmin: false },
        'target-company'
      )
    ).resolves.not.toThrow();
  });

  it('lanca erro quando usuário não tem membership', async () => {
    mockPrisma.userCompanyMembership.findMany.mockResolvedValue([
      { companyId: 'other-company' },
    ]);

    await expect(
      assertCompanyAccess(
        { id: 'user', isSuperAdmin: false },
        'forbidden-company'
      )
    ).rejects.toThrow('Acesso negado');
  });
});
```

Rodar:

```bash
npx vitest run src/__tests__/tenant.test.ts
```

Esperado: falha (módulo não existe).

- [ ] **Step 2: Implementar tenant.ts**

Criar `src/lib/tenant.ts`:

```typescript
import { prisma } from '@/lib/prisma';

interface TenantUser {
  id: string;
  isSuperAdmin: boolean;
}

/**
 * Retorna lista de company IDs acessíveis pelo usuário.
 * Retorna undefined se super_admin (acesso total — sem filtro).
 */
export async function getAccessibleCompanyIds(
  user: TenantUser
): Promise<string[] | undefined> {
  if (user.isSuperAdmin) {
    return undefined; // Sem restrição
  }

  const memberships = await prisma.userCompanyMembership.findMany({
    where: { userId: user.id, isActive: true },
    select: { companyId: true },
  });

  return memberships.map((m) => m.companyId);
}

/**
 * Constrói filtro Prisma WHERE para tenant scoping.
 * Se companyIds é undefined (super_admin), retorna {} (sem filtro).
 * Se companyIds é um array, retorna { companyId: { in: [...] } }.
 */
export function buildTenantFilter(
  companyIds: string[] | undefined
): Record<string, any> {
  if (companyIds === undefined) {
    return {};
  }
  return { companyId: { in: companyIds } };
}

/**
 * Verifica se o usuário tem acesso a uma empresa específica.
 * Lança erro se não tem acesso.
 */
export async function assertCompanyAccess(
  user: TenantUser,
  companyId: string
): Promise<void> {
  if (user.isSuperAdmin) return;

  const companyIds = await getAccessibleCompanyIds(user);
  if (!companyIds || !companyIds.includes(companyId)) {
    throw new Error('Acesso negado: você não tem permissão para acessar esta empresa.');
  }
}

/**
 * Retorna o role do usuário em uma empresa específica.
 * Retorna null se não tem membership.
 * Retorna 'super_admin' se é super admin.
 */
export async function getUserCompanyRole(
  user: TenantUser,
  companyId: string
): Promise<string | null> {
  if (user.isSuperAdmin) return 'super_admin';

  const membership = await prisma.userCompanyMembership.findUnique({
    where: {
      userId_companyId: {
        userId: user.id,
        companyId,
      },
    },
    select: { role: true, isActive: true },
  });

  if (!membership || !membership.isActive) return null;
  return membership.role;
}
```

- [ ] **Step 3: Rodar testes e fazer commit**

```bash
npx vitest run src/__tests__/tenant.test.ts
```

Esperado: todos os 7 testes passam.

```bash
git add src/lib/tenant.ts src/__tests__/tenant.test.ts
git commit -m "feat(auth): tenant scoping middleware com filtro por membership"
```

---

### Task 5: Instalar componentes shadcn/ui necessários

**Files:**
- Modify: componentes UI via CLI

- [ ] **Step 1: Instalar componentes necessários**

```bash
npx shadcn@latest add button input label card
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/
git commit -m "feat(ui): adiciona componentes shadcn/ui (Button, Input, Label, Card)"
```

---

### Task 6: Tela de Login — Componente de Branding

**Files:**
- Create: `src/components/login/login-branding.tsx`

- [ ] **Step 1: Criar login-branding.tsx**

Criar `src/components/login/login-branding.tsx`:

```tsx
'use client';

import { motion } from 'framer-motion';
import { Webhook, Zap, Shield } from 'lucide-react';

export function LoginBranding() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-10 lg:flex">
      {/* Background decorativo */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-4 -top-24 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-4 h-[400px] w-[400px] rounded-full bg-violet-500/10 blur-3xl" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Logo e nome */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <Webhook className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Nexus</h1>
            <p className="text-xs text-zinc-400">Roteador Webhook</p>
          </div>
        </div>
      </motion.div>

      {/* Features */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
        className="relative z-10 space-y-6"
      >
        <div className="space-y-4">
          <Feature
            icon={<Zap className="h-5 w-5 text-blue-400" />}
            title="Roteamento Inteligente"
            description="Distribua webhooks da Meta para multiplos destinos com filtro por evento."
          />
          <Feature
            icon={<Shield className="h-5 w-5 text-violet-400" />}
            title="Entrega Garantida"
            description="Retry automatico com backoff exponencial e recuperacao de falhas."
          />
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="relative z-10"
      >
        <p className="text-xs text-zinc-500">
          NexusAI360 &copy; {new Date().getFullYear()}. Todos os direitos reservados.
        </p>
      </motion.div>
    </div>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800/80">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="text-xs text-zinc-400">{description}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/login/login-branding.tsx
git commit -m "feat(ui): componente de branding para tela de login"
```

---

### Task 7: Tela de Login — Formulario e Pagina

**Files:**
- Create: `src/components/login/login-form.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/__tests__/login-form.test.tsx`

- [ ] **Step 1: Escrever testes do formulario de login**

Criar `src/__tests__/login-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock framer-motion para evitar problemas em testes
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock signIn
const mockSignIn = vi.fn();
vi.mock('@/auth', () => ({
  signIn: mockSignIn,
}));

import { LoginForm } from '@/components/login/login-form';

describe('LoginForm', () => {
  it('renderiza campos de email e senha', () => {
    render(<LoginForm />);

    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /entrar/i })
    ).toBeInTheDocument();
  });

  it('renderiza link de esqueci minha senha', () => {
    render(<LoginForm />);

    expect(screen.getByText(/esqueci minha senha/i)).toBeInTheDocument();
  });

  it('toggle de visibilidade da senha funciona', async () => {
    render(<LoginForm />);
    const user = userEvent.setup();

    const passwordInput = screen.getByLabelText(/senha/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByRole('button', {
      name: /mostrar senha/i,
    });
    await user.click(toggleButton);

    expect(passwordInput).toHaveAttribute('type', 'text');
  });

  it('mostra erro quando campos estao vazios', async () => {
    render(<LoginForm />);
    const user = userEvent.setup();

    const submitButton = screen.getByRole('button', { name: /entrar/i });
    await user.click(submitButton);

    // HTML5 validation previne submit com campos required
    expect(screen.getByLabelText(/e-mail/i)).toBeRequired();
    expect(screen.getByLabelText(/senha/i)).toBeRequired();
  });
});
```

Rodar:

```bash
npx vitest run src/__tests__/login-form.test.tsx
```

Esperado: falha (componente não existe).

- [ ] **Step 2: Instalar dependencias de teste**

```bash
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react jsdom
```

Criar/atualizar `vitest.config.ts` (ou `vitest.setup.ts`):

Criar `src/__tests__/setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest';
```

Atualizar `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.{test,spec}.{ts,tsx}'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Criar login-form.tsx**

Criar `src/components/login/login-form.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, LogIn, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { loginAction } from '@/app/(auth)/login/actions';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await loginAction(formData, callbackUrl);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <Card className="border-zinc-800 bg-zinc-950/50 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          {/* Logo mobile (hidden on lg+) */}
          <div className="mb-4 flex items-center justify-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <LogIn className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">Nexus</span>
          </div>
          <CardTitle className="text-2xl font-bold text-white">
            Bem-vindo de volta
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Entre com suas credenciais para acessar o painel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            {/* Erro */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/50 p-3 text-sm text-red-400"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">
                E-mail
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="seu@email.com"
                required
                autoComplete="email"
                autoFocus
                disabled={isPending}
                className="border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-500 focus:border-blue-500 focus:ring-blue-500/20"
              />
            </div>

            {/* Senha */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-zinc-300">
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="********"
                  required
                  autoComplete="current-password"
                  disabled={isPending}
                  className="border-zinc-700 bg-zinc-900 pr-10 text-white placeholder:text-zinc-500 focus:border-blue-500 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Esqueci minha senha */}
            <div className="flex justify-end">
              <a
                href="/forgot-password"
                className="text-sm text-zinc-400 transition-colors hover:text-blue-400"
                tabIndex={isPending ? -1 : 0}
              >
                Esqueci minha senha
              </a>
            </div>

            {/* Botao */}
            <Button
              type="submit"
              disabled={isPending}
              className="w-full bg-blue-600 text-white transition-all hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Entrar
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
```

- [ ] **Step 4: Criar server action de login**

Criar `src/app/(auth)/login/actions.ts`:

```typescript
'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function loginAction(
  formData: FormData,
  callbackUrl: string
): Promise<{ error: string } | undefined> {
  try {
    await signIn('credentials', {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'E-mail ou senha incorretos.' };
        case 'CallbackRouteError':
          // Rate limit error vem como cause
          const message = (error as any)?.cause?.err?.message;
          if (message?.includes('Muitas tentativas')) {
            return { error: message };
          }
          return { error: 'E-mail ou senha incorretos.' };
        default:
          return { error: 'Erro ao fazer login. Tente novamente.' };
      }
    }
    throw error; // NextAuth redirect throws (não é erro real)
  }
}
```

- [ ] **Step 5: Criar pagina de login**

Criar `src/app/(auth)/login/page.tsx`:

```tsx
import { Suspense } from 'react';
import { LoginBranding } from '@/components/login/login-branding';
import { LoginForm } from '@/components/login/login-form';

export const metadata = {
  title: 'Login | Nexus Roteador Webhook',
  description: 'Acesse o painel do Nexus Roteador Webhook',
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-zinc-950">
      {/* Lado esquerdo — Branding (hidden no mobile) */}
      <div className="hidden w-1/2 lg:block">
        <LoginBranding />
      </div>

      {/* Lado direito — Formulario */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Criar layout do grupo (auth)**

Criar `src/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

- [ ] **Step 7: Rodar testes e fazer commit**

```bash
npx vitest run src/__tests__/login-form.test.tsx
```

Esperado: todos os 4 testes passam.

```bash
git add src/components/login/login-form.tsx src/components/login/login-branding.tsx src/app/\(auth\)/login/page.tsx src/app/\(auth\)/login/actions.ts src/app/\(auth\)/layout.tsx src/__tests__/login-form.test.tsx src/__tests__/setup.ts vitest.config.ts
git commit -m "feat(ui): tela de login com split layout, toggle senha e animacoes"
```

---

### Task 8: Layout Protegido e Redirect

**Files:**
- Create: `src/app/(protected)/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Criar layout protegido**

Criar `src/app/(protected)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Atualizar pagina raiz para redirect**

Atualizar `src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect('/dashboard');
  }

  redirect('/login');
}
```

- [ ] **Step 3: Criar placeholder do dashboard**

Criar `src/app/(protected)/dashboard/page.tsx`:

```tsx
import { auth } from '@/auth';

export const metadata = {
  title: 'Dashboard | Nexus Roteador Webhook',
};

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-2 text-zinc-400">
          Bem-vindo, {session?.user?.name || session?.user?.email}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {(session?.user as any)?.isSuperAdmin
            ? 'Super Admin'
            : 'Usuario'}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Criar pagina placeholder de forgot-password**

Criar `src/app/(auth)/forgot-password/page.tsx`:

```tsx
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Esqueci minha senha | Nexus Roteador Webhook',
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-white">
          Esqueci minha senha
        </h1>
        <p className="mt-2 text-zinc-400">
          Esta funcionalidade sera implementada na Fase 3.
        </p>
        <Link href="/login" className="mt-6 inline-block">
          <Button
            variant="ghost"
            className="text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao login
          </Button>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/\(protected\)/layout.tsx src/app/\(protected\)/dashboard/page.tsx src/app/\(auth\)/forgot-password/page.tsx
git commit -m "feat(auth): layout protegido, redirects e placeholder do dashboard"
```

---

### Task 9: Variáveis de Ambiente e Validação

**Files:**
- Create: `src/lib/env.ts`

- [ ] **Step 1: Criar validação de variáveis com Zod**

Criar `src/lib/env.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  REDIS_URL: z.string().min(1, 'REDIS_URL é obrigatória'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET deve ter no mínimo 32 caracteres'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL deve ser uma URL válida'),
  ENCRYPTION_KEY: z.string().min(64, 'ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes)'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      'Variáveis de ambiente inválidas:',
      result.error.flatten().fieldErrors
    );
    throw new Error('Variáveis de ambiente inválidas. Verifique o .env');
  }

  return result.data;
}

export const env = validateEnv();
```

- [ ] **Step 2: Atualizar .env.example com notas de segurança**

Adicionar ao `.env.example` (se não existir, o sub-plano 1 já criou):

```bash
# Gere com: openssl rand -base64 32
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32

# Gere com: openssl rand -hex 32
ENCRYPTION_KEY=generate-with-openssl-rand-hex-32
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts
git commit -m "feat(config): validação de variáveis de ambiente com Zod"
```

---

### Task 10: Teste de Integração End-to-End (Smoke Test)

**Files:**
- Create: `src/__tests__/auth-integration.test.ts`

- [ ] **Step 1: Escrever smoke test de integração**

Criar `src/__tests__/auth-integration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

// Mock completo do fluxo
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
  },
  userCompanyMembership: {
    findMany: vi.fn(),
  },
};

const mockRedis = {
  multi: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  ttl: vi.fn(),
};

const mockMultiExec = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

mockRedis.multi.mockReturnValue(mockMultiExec);

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/redis', () => ({ redis: mockRedis }));

import { authorizeCredentials } from '@/lib/auth-helpers';
import { getAccessibleCompanyIds, buildTenantFilter } from '@/lib/tenant';

describe('Auth + Tenant Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 1], [null, 'OK']]);
  });

  it('fluxo completo: login -> tenant scoping', async () => {
    const hashedPassword = await bcrypt.hash('password123', 12);

    // 1. Login bem-sucedido
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'manager@company.com',
      name: 'Manager',
      password: hashedPassword,
      isSuperAdmin: false,
      isActive: true,
      avatarUrl: null,
      theme: 'dark',
    });

    const user = await authorizeCredentials(
      { email: 'manager@company.com', password: 'password123' },
      '127.0.0.1'
    );

    expect(user).not.toBeNull();
    expect(user!.id).toBe('user-1');
    expect(user!.isSuperAdmin).toBe(false);

    // 2. Obter companies acessíveis
    mockPrisma.userCompanyMembership.findMany.mockResolvedValue([
      { companyId: 'company-a' },
      { companyId: 'company-b' },
    ]);

    const companyIds = await getAccessibleCompanyIds({
      id: user!.id,
      isSuperAdmin: user!.isSuperAdmin,
    });

    expect(companyIds).toEqual(['company-a', 'company-b']);

    // 3. Construir filtro de tenant
    const filter = buildTenantFilter(companyIds);
    expect(filter).toEqual({
      companyId: { in: ['company-a', 'company-b'] },
    });
  });

  it('super admin bypassa tenant scoping', async () => {
    const hashedPassword = await bcrypt.hash('admin-pass', 12);

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@nexusai360.com',
      name: 'Super Admin',
      password: hashedPassword,
      isSuperAdmin: true,
      isActive: true,
      avatarUrl: null,
      theme: 'dark',
    });

    const user = await authorizeCredentials(
      { email: 'admin@nexusai360.com', password: 'admin-pass' },
      '127.0.0.1'
    );

    expect(user!.isSuperAdmin).toBe(true);

    const companyIds = await getAccessibleCompanyIds({
      id: user!.id,
      isSuperAdmin: user!.isSuperAdmin,
    });

    expect(companyIds).toBeUndefined();

    const filter = buildTenantFilter(companyIds);
    expect(filter).toEqual({}); // Sem filtro
  });

  it('rate limit bloqueia apos 5 tentativas', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockMultiExec.exec.mockResolvedValue([[null, 5], [null, 'OK']]);
    mockRedis.set.mockResolvedValue('OK');

    await expect(
      authorizeCredentials(
        { email: 'victim@test.com', password: 'wrong' },
        '192.168.1.1'
      )
    ).rejects.toThrow('Muitas tentativas de login');
  });
});
```

- [ ] **Step 2: Rodar todos os testes**

```bash
npx vitest run
```

Esperado: todos os testes passam (auth, rate-limit, middleware, tenant, login-form, integration).

Output esperado:

```
 ✓ src/__tests__/auth.test.ts (7 tests)
 ✓ src/__tests__/rate-limit.test.ts (5 tests)
 ✓ src/__tests__/middleware.test.ts (10 tests)
 ✓ src/__tests__/tenant.test.ts (7 tests)
 ✓ src/__tests__/login-form.test.tsx (4 tests)
 ✓ src/__tests__/auth-integration.test.ts (3 tests)

 Test Files  6 passed (6)
      Tests  36 passed (36)
```

- [ ] **Step 3: Commit final**

```bash
git add src/__tests__/auth-integration.test.ts
git commit -m "test(auth): smoke test de integração auth + tenant scoping"
```

---

## Resumo de Entregáveis

| Entregável | Status |
|-----------|--------|
| NextAuth.js v5 com credentials provider | Task 1 |
| JWT criptografado (JWE) stateless | Task 1 (auth.config.ts session strategy) |
| Rate limiting no login (5 tentativas/min, bloqueio 15min) | Task 2 |
| Middleware de proteção de rotas | Task 3 |
| Tenant scoping por UserCompanyMembership | Task 4 |
| Componentes shadcn/ui instalados | Task 5 |
| Tela de login (split layout, branding, toggle senha, animações) | Tasks 6-7 |
| Layout protegido e redirects | Task 8 |
| Validação de variáveis de ambiente | Task 9 |
| Testes de integração | Task 10 |
| Sessão expira após 30min de inatividade | Task 1 (maxAge: 30 * 60) |

**Total de testes:** 36
**Total de commits:** 10
**Total de tasks:** 10
