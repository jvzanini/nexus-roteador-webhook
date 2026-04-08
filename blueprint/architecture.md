# Arquitetura de Referencia — Blueprint Nexus AI

> Documento extraido da plataforma Nexus Roteador Webhook.
> Define a stack, estrutura de pastas e padroes de codigo que toda plataforma construida a partir deste blueprint deve seguir.

---

## 1. Stack Tecnica

| Camada | Tecnologia | Versao | Proposito |
|---|---|---|---|
| Framework | Next.js (App Router) | 16+ | SSR, Server Components, Server Actions, routing baseado em pastas |
| Linguagem | TypeScript | 5+ | Tipagem estatica em todo o projeto |
| ORM | Prisma | 7+ | Modelagem de dados, migrations, queries tipadas |
| Banco de dados | PostgreSQL | 16+ | Banco relacional principal |
| Cache/Filas | Redis + BullMQ | 7+ / 5+ | Cache, filas de processamento assincrono, workers |
| Autenticacao | NextAuth.js v5 | 5.0-beta | JWT stateless, trustHost, refresh em tempo real |
| Estilizacao | Tailwind CSS | 4+ | Utility-first CSS com CSS variables para temas |
| Componentes | shadcn/ui (base-ui) | 1.3+ | Componentes acessiveis — usar `render` prop, NAO `asChild` |
| Animacoes | Framer Motion | 12+ | Animacoes declarativas com variants tipadas (`as const`) |
| Graficos | Recharts | 3+ | Graficos do dashboard (condicional — apenas se modulo dashboard ativo) |
| Icones | Lucide React | 1.7+ | Biblioteca de icones — NUNCA usar emojis na interface |
| Temas | next-themes | 0.4+ | Dark/Light/System mode via ThemeProvider |
| Email | Resend + React Email | 6+ / 1+ | Envio de emails transacionais (reset senha, verificacao) |
| Validacao | Zod | 4+ | Validacao de schemas em Server Actions e formularios |
| HTTP | Axios | 1+ | Requisicoes HTTP para APIs externas (webhooks, integracoes) |
| Toast | Sonner | 2+ | Notificacoes toast customizadas |

### Notas Importantes

- **Prisma v7:** Imports DEVEM vir de `@/generated/prisma/client`, NAO de `@prisma/client`. O client e gerado localmente via adapter PostgreSQL.
- **shadcn/ui:** Usar a prop `render` para composicao de componentes. A prop `asChild` NAO e suportada no base-ui.
- **Framer Motion:** Variants devem sempre usar `as const` para tipagem correta dos valores de `ease`.
- **Lucide React:** Unica fonte de icones. Emojis sao proibidos em qualquer texto visivel ao usuario.

---

## 2. Estrutura de Pastas

```
src/
├── app/                              # App Router — rotas e layouts
│   ├── (auth)/                       # Grupo de rotas publicas (sem sidebar)
│   │   ├── login/                    # Pagina de login
│   │   ├── forgot-password/          # Solicitar reset de senha
│   │   ├── reset-password/           # Redefinir senha via token
│   │   └── verify-email/             # Verificacao de email
│   ├── (protected)/                  # Grupo de rotas protegidas (com sidebar + auth check)
│   │   ├── layout.tsx                # Layout com Sidebar + ThemeInitializer + redirect se nao autenticado
│   │   ├── dashboard/                # Dashboard principal com metricas
│   │   ├── companies/                # CRUD de empresas (listagem + detalhe)
│   │   │   ├── _components/          # Componentes especificos da listagem
│   │   │   └── [id]/                 # Detalhe da empresa (tabs)
│   │   │       ├── _components/      # Componentes das tabs (overview, logs, etc.)
│   │   │       └── routes/           # Sub-rota de rotas de webhook
│   │   ├── users/                    # Gestao de usuarios (super admin + admin)
│   │   ├── settings/                 # Configuracoes globais (super admin + admin)
│   │   └── profile/                  # Perfil do usuario (avatar, nome, email, senha, tema)
│   └── api/                          # Route Handlers (API)
│       ├── auth/[...nextauth]/       # NextAuth catch-all route
│       ├── webhook/[webhookKey]/     # Endpoint de recepcao de webhooks (publico)
│       ├── events/                   # SSE para real-time (condicional)
│       └── health/                   # Health check
├── components/                       # Componentes React reutilizaveis
│   ├── ui/                           # Componentes base (shadcn/ui, custom-select, sonner, etc.)
│   ├── layout/                       # Sidebar, header e estrutura de layout
│   ├── providers/                    # ThemeProvider, ThemeInitializer, session providers
│   ├── dashboard/                    # Componentes do dashboard (graficos, cards) [condicional]
│   ├── login/                        # Componentes da tela de login
│   ├── routes/                       # Componentes de rotas de webhook [condicional]
│   ├── event-checklist/              # Seletor de eventos WhatsApp [condicional]
│   └── icon-picker/                  # Seletor de icones [condicional]
├── hooks/                            # Custom hooks React
│   └── use-realtime.ts              # Hook SSE para atualizacoes em tempo real [condicional]
├── lib/                              # Logica de negocio e utilitarios
│   ├── actions/                      # Server Actions (pasta unica consolidada)
│   │   ├── company.ts                # CRUD de empresas
│   │   ├── credential.ts             # CRUD de credenciais
│   │   ├── dashboard.ts              # Metricas e dados do dashboard
│   │   ├── logs.ts                   # Consulta de logs (cursor-based pagination)
│   │   ├── notifications.ts          # Feed de notificacoes
│   │   ├── password-reset.ts         # Solicitar e redefinir senha
│   │   ├── profile.ts                # Perfil do usuario
│   │   ├── resend.ts                 # Reenvio de webhooks
│   │   ├── settings.ts               # Configuracoes globais (admin-only)
│   │   ├── users.ts                  # CRUD usuarios + memberships
│   │   ├── webhook-routes.ts         # CRUD de rotas de webhook
│   │   └── __tests__/                # Testes unitarios das actions
│   ├── auth.ts                       # getCurrentUser() — extrai usuario da sessao
│   ├── prisma.ts                     # Singleton do PrismaClient com adapter PG
│   ├── constants/                    # Constantes da aplicacao
│   │   ├── navigation.ts             # Itens de navegacao da sidebar
│   │   ├── roles.ts                  # Labels e hierarquia de roles
│   │   ├── header-whitelist.ts       # Headers permitidos no webhook
│   │   └── whatsapp-events.ts        # Tipos de eventos WhatsApp [condicional]
│   ├── schemas/                      # Schemas Zod para API routes
│   ├── validations/                  # Schemas Zod para Server Actions
│   ├── utils/                        # Funcoes utilitarias (slugify, formatters, etc.)
│   ├── webhook/                      # Logica de processamento de webhooks [condicional]
│   │   └── __tests__/                # Testes do webhook processor
│   └── __tests__/                    # Testes unitarios da lib
│       └── __mocks__/                # Mocks para testes
├── worker/                           # Workers BullMQ (processamento assincrono) [condicional]
│   ├── index.ts                      # Entrada principal dos workers
│   ├── delivery.ts                   # Worker de entrega de webhooks
│   ├── dlq-cleanup.ts               # Limpeza de dead-letter queue
│   ├── log-cleanup.ts               # Limpeza periodica de logs
│   ├── notification-cleanup.ts       # Limpeza de notificacoes antigas
│   └── orphan-recovery.ts           # Recuperacao de deliveries orfas
├── generated/                        # Codigo gerado automaticamente
│   └── prisma/                       # Prisma Client gerado (NAO editar manualmente)
├── types/                            # Tipos TypeScript globais
│   └── next-auth.d.ts               # Extensao de tipos do NextAuth
└── __tests__/                        # Testes de integracao
```

> Diretorios marcados com `[condicional]` sao incluidos apenas quando o modulo correspondente esta ativo na plataforma.

---

## 3. Padrao: Server Actions

Todas as Server Actions ficam em `src/lib/actions/` como uma pasta unica consolidada. Cada action segue o mesmo padrao:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  createCompanySchema,
  updateCompanySchema,
  type CreateCompanyInput,
  type UpdateCompanyInput,
} from "@/lib/validations/company";
import { slugify } from "@/lib/utils/slugify";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};
```

### Estrutura de cada funcao

1. **Diretiva `"use server"`** no topo do arquivo
2. **`getCurrentUser()` como primeira operacao** — retorna erro se nao autenticado
3. **Verificacao de permissao** — checa `isSuperAdmin`, `platformRole` ou membership
4. **Validacao Zod** — `schema.safeParse(input)` com retorno do primeiro erro
5. **Operacao no banco** — via `prisma` singleton
6. **`revalidatePath()`** — invalida cache das rotas afetadas
7. **Retorno `ActionResult<T>`** — sempre `{ success, data?, error? }`
8. **`try/catch` com log** — `console.error("[nomeFuncao]", error)` + mensagem amigavel

### Exemplo completo — Criar empresa

```typescript
export async function createCompany(
  input: CreateCompanyInput
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };

    if (!user.isSuperAdmin) {
      return { success: false, error: "Apenas super admin pode criar empresas" };
    }

    const parsed = createCompanySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Dados invalidos",
      };
    }

    const { name, logoUrl, webhookKey: customWebhookKey } = parsed.data;

    // Gerar slug unico
    let slug = slugify(name);
    const existingSlug = await prisma.company.findUnique({ where: { slug } });
    if (existingSlug) {
      slug = `${slug}-${nanoid(6)}`;
    }

    // Usar webhook_key customizada ou gerar com nanoid(21)
    let webhookKey: string;
    if (customWebhookKey) {
      const existingKey = await prisma.company.findUnique({
        where: { webhookKey: customWebhookKey },
      });
      if (existingKey) {
        return { success: false, error: "Webhook key ja esta em uso por outra empresa" };
      }
      webhookKey = customWebhookKey;
    } else {
      webhookKey = nanoid(21);
    }

    const company = await prisma.company.create({
      data: {
        name,
        slug,
        webhookKey,
        logoUrl: logoUrl || null,
      },
    });

    // Auto-vincular todos os super admins como company_admin
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true },
      select: { id: true },
    });

    if (superAdmins.length > 0) {
      await prisma.userCompanyMembership.createMany({
        data: superAdmins.map((sa) => ({
          userId: sa.id,
          companyId: company.id,
          role: "company_admin" as const,
        })),
        skipDuplicates: true,
      });
    }

    revalidatePath("/companies");

    return { success: true, data: company };
  } catch (error) {
    console.error("[createCompany]", error);
    return { success: false, error: "Erro ao criar empresa" };
  }
}
```

### Exemplo completo — Leitura com tenant scoping

```typescript
export async function getCompanies(options?: {
  includeInactive?: boolean;
}): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };

    const where: Record<string, unknown> = {};

    // Tenant scoping — quando nao for super_admin, filtrar por membership ativa
    if (!user.isSuperAdmin) {
      where.memberships = {
        some: {
          userId: user.id,
          isActive: true,
        },
      };
    }

    const companies = await prisma.company.findMany({
      where,
      include: {
        credential: {
          select: { id: true },
        },
        _count: {
          select: {
            memberships: true,
            routes: { where: { isActive: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: companies };
  } catch (error) {
    console.error("[getCompanies]", error);
    return { success: false, error: "Erro ao buscar empresas" };
  }
}
```

---

## 4. Padrao: Prisma Singleton

Arquivo: `src/lib/prisma.ts`

```typescript
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg(process.env.DATABASE_URL!);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### Pontos-chave

- **Import de `@/generated/prisma/client`** — Prisma v7 gera o client localmente, NAO usa `@prisma/client`.
- **Adapter PostgreSQL** — `PrismaPg` conecta via `DATABASE_URL` do `.env`.
- **Singleton via globalThis** — evita multiplas instancias durante hot-reload em desenvolvimento.
- **Logs condicionais** — queries logadas apenas em dev.

---

## 5. Padrao: getCurrentUser()

Arquivo: `src/lib/auth.ts`

```typescript
import { auth } from "@/auth";

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  platformRole: string;
  avatarUrl: string | null;
  theme: string;
}

/**
 * Retorna o usuario autenticado da sessao atual.
 * Retorna null se nao autenticado.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  const user = session.user as any;

  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    isSuperAdmin: user.isSuperAdmin ?? false,
    platformRole: user.platformRole ?? 'viewer',
    avatarUrl: user.avatarUrl ?? null,
    theme: user.theme ?? "dark",
  };
}
```

### Pontos-chave

- **Funcao server-only** — chamada dentro de Server Actions e Server Components.
- **Retorno tipado** — `CurrentUser | null` com todos os campos necessarios para controle de acesso.
- **Defaults seguros** — `isSuperAdmin: false`, `platformRole: 'viewer'` se campos estiverem ausentes.
- **Dados do JWT** — os campos vem do token JWT, atualizado em cada requisicao pelo callback `jwt()`.

---

## 6. Padrao: Protected Layout

Arquivo: `src/app/(protected)/layout.tsx`

```typescript
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { ThemeInitializer } from '@/components/providers/theme-initializer';
import { PLATFORM_ROLE_LABELS } from '@/lib/constants/roles';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const isSuperAdmin = (session.user as any)?.isSuperAdmin ?? false;
  const platformRole = (session.user as any)?.platformRole ?? 'viewer';
  const avatarUrl = (session.user as any)?.avatarUrl ?? null;

  const roleLabel = PLATFORM_ROLE_LABELS[platformRole] || 'Usuario';

  const user = {
    name: session.user.name || session.user.email || 'Usuario',
    email: session.user.email || '',
    role: roleLabel,
    platformRole,
    isSuperAdmin,
    avatarUrl,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ThemeInitializer theme={(session.user as any)?.theme ?? null} />
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-8 sm:pb-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
```

### Pontos-chave

- **Server Component** — sem `'use client'`, executa no servidor.
- **Auth check com redirect** — `auth()` + `redirect('/login')` se nao autenticado.
- **ThemeInitializer** — aplica o tema do usuario (salvo no DB) antes do primeiro render.
- **Sidebar como Client Component** — recebe dados do usuario serializados como props.
- **Layout responsivo** — `flex h-screen` com sidebar fixa e main scrollavel.
- **Padding mobile-first** — `pt-16 sm:pt-8` acomoda o botao hamburguer no mobile.

---

## 7. Padrao: Client Component

Exemplo extraido de `src/components/layout/sidebar.tsx`:

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { getNavItems } from '@/lib/constants/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { signOut } from 'next-auth/react';

interface SidebarProps {
  user: {
    name: string;
    email: string;
    role: string;
    platformRole: string;
    isSuperAdmin: boolean;
    avatarUrl: string | null;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const allMenuItems = getNavItems(user.platformRole);

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-background border-r border-border overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6">
        <Image src="/logo-nexus-ai.png" alt="Nexus AI" width={40} height={40} className="rounded-[22%] shadow-[0_0_12px_rgba(124,58,237,0.3)]" />
        <div>
          <h1 className="text-base font-bold text-foreground tracking-tight">Nexus AI</h1>
          <p className="text-[11px] text-muted-foreground leading-none">Roteador Webhook</p>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {allMenuItems.map((item, index) => {
          const active = isActive(item.href);
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
            >
              <Link
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`
                  group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium
                  transition-all duration-200 cursor-pointer
                  ${
                    active
                      ? 'bg-muted/50 text-violet-500 border-l-2 border-violet-500 pl-[10px]'
                      : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                  }
                `}
              >
                <item.icon className={`h-[18px] w-[18px] transition-colors duration-200 ${active ? 'text-violet-500' : 'text-muted-foreground group-hover:text-foreground'}`} />
                {item.label}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border px-4 py-4 space-y-3">
        <Link
          href="/profile"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 rounded-lg px-2 py-2.5 -mx-1 transition-all duration-200 hover:bg-accent/50 cursor-pointer group"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground overflow-hidden shrink-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate group-hover:text-foreground transition-colors duration-200">{user.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user.role}</p>
          </div>
        </Link>

        <Button
          variant="ghost"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
          size="sm"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile toggle */}
      <div className="fixed top-4 left-4 z-50 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="h-11 w-11 bg-card border border-border text-foreground hover:text-foreground cursor-pointer"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              exit={{ x: -256 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-60 lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
```

### Pontos-chave do padrao Client Component

- **`'use client'` como primeira linha** — obrigatorio para hooks e interatividade.
- **Interface tipada para props** — `SidebarProps` define o contrato com o Server Component pai.
- **Framer Motion** — `motion.div`, `AnimatePresence`, transitions com `type: 'spring'`.
- **Lucide React** — todos os icones vem desta biblioteca.
- **Responsividade** — sidebar desktop (`hidden lg:block`) + mobile com overlay animado.
- **`signOut` do next-auth/react** — para logout no client-side.

---

## 8. Padrao: JWT Refresh

Arquivo: `src/auth.config.ts`

```typescript
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
        token.platformRole = (user as any).platformRole;
        token.avatarUrl = (user as any).avatarUrl;
        token.theme = (user as any).theme;
        token.name = user.name;
      }

      // Em TODA requisicao autenticada, atualizar dados criticos do DB
      // Garante que mudancas de role/status tomam efeito imediato (nao apos 7 dias)
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
              platformRole: true,
            },
          });
          if (freshUser) {
            token.isSuperAdmin = freshUser.isSuperAdmin;
            token.platformRole = freshUser.platformRole;
            token.name = freshUser.name;
            token.avatarUrl = freshUser.avatarUrl;
            token.theme = freshUser.theme;

            // Se o usuario foi desativado, invalidar a sessao
            if (!freshUser.isActive) {
              return null as any;
            }
          }
        } catch {
          // Se a query falhar, manter token existente (nao quebrar auth)
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).isSuperAdmin = token.isSuperAdmin as boolean;
        (session.user as any).platformRole = token.platformRole as string;
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
  providers: [], // Adicionados no auth.ts (nao edge-compatible)
} satisfies NextAuthConfig;
```

### Pontos-chave

- **JWT stateless** — sem sessoes no banco, token carrega todos os dados.
- **Refresh em toda requisicao** — o callback `jwt()` consulta o DB a cada request para garantir dados atualizados.
- **Invalidacao de sessao** — se `isActive === false`, retorna `null` para forcar logout.
- **Fallback seguro** — se a query falhar, mantem o token existente sem quebrar a autenticacao.
- **`trustHost: true`** — necessario para deploy em ambientes com proxy reverso.
- **`authorized()` como middleware** — define rotas publicas vs protegidas.
- **Import dinamico do Prisma** — `await import("@/lib/prisma")` porque providers nao sao edge-compatible.
- **`satisfies NextAuthConfig`** — tipagem sem perder inferencia.

---

## 9. Convencoes

### Idioma

| Contexto | Idioma | Exemplo |
|---|---|---|
| Commits | Portugues | `feat: adiciona dashboard de metricas` |
| Codigo (variaveis, funcoes, types) | Ingles | `getCurrentUser()`, `ActionResult<T>` |
| Comentarios no codigo | Portugues (quando necessario) | `// Tenant scoping — filtrar por membership` |
| Texto visivel ao usuario | Portugues com acentos | `"Nao autenticado"`, `"Empresa nao encontrada"` |
| Nomes de arquivo | Ingles (kebab-case) | `company.ts`, `webhook-routes.ts` |

### Icones

- **Lucide React** e a unica fonte de icones permitida.
- **Emojis sao proibidos** em qualquer texto visivel ao usuario na interface.
- Importar icones individualmente: `import { LogOut, Menu, X } from 'lucide-react'`.

### Framer Motion

- Variants devem usar `as const` para tipagem correta:

```typescript
const variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { ease: [0.25, 0.1, 0.25, 1] as const } },
} as const;
```

- Usar `AnimatePresence` para animacoes de entrada/saida.
- Transitions do tipo `spring` para movimentos naturais: `{ type: 'spring', damping: 25, stiffness: 200 }`.

### Estilizacao

- **Tailwind CSS 4+** com CSS variables para temas (`bg-background`, `text-foreground`, `border-border`).
- **Cores primarias** via CSS custom properties definidas em `globals.css`.
- **Responsividade mobile-first** — breakpoints: `sm:`, `md:`, `lg:`, `xl:`.
- **shadcn/ui** com prop `render` para composicao (NAO `asChild`).

### Server Actions

- Todas em `src/lib/actions/` — pasta unica, sem subdiretorios por dominio.
- Retorno padrao `ActionResult<T>` com `{ success, data?, error? }`.
- Validacao com Zod antes de qualquer operacao no banco.
- `getCurrentUser()` como primeira linha de toda action protegida.
- `revalidatePath()` apos mutacoes para invalidar cache.

### Commits

Formato: `tipo: descricao em portugues`

Tipos validos:
- `feat:` — nova funcionalidade
- `fix:` — correcao de bug
- `chore:` — manutencao, limpeza, configs
- `docs:` — documentacao
- `refactor:` — refatoracao sem mudanca de comportamento
- `style:` — ajustes visuais/CSS
- `test:` — adicao ou correcao de testes
