# Fase 3B — Rebranding Roxo, Responsividade Mobile, Light Mode e Ajustes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrandar a plataforma com identidade visual Nexus AI (roxo), implementar light mode funcional, corrigir sincronizacao do sidebar, redesenhar login, padronizar selects, e tornar toda a plataforma responsiva para mobile/tablet.

**Architecture:** Migrar o sistema de cores de azul (#2563eb) para roxo (gradiente #7c3aed a #6d28d9 baseado no logo Nexus AI). Implementar ThemeProvider do next-themes para suportar dark/light/system. Redesenhar login como tela interna centralizada com logo Nexus AI. Corrigir sessao JWT para sincronizar avatar/nome no sidebar. Auditar e corrigir responsividade em todas as paginas.

**Tech Stack:** Next.js 14+ (App Router), next-themes, Tailwind CSS, Framer Motion, shadcn/ui (base-ui), Prisma v7

---

## Mapa de Arquivos

### Arquivos a Criar
- `public/logo-nexus-ai.png` — Logo Nexus AI (icone N com gradiente roxo)
- `public/marca-nexus-ai-dark.png` — Marca completa para dark mode
- `public/marca-nexus-ai-light.png` — Marca completa para light mode
- `src/components/providers/theme-provider.tsx` — ThemeProvider wrapper
- `src/components/ui/custom-select.tsx` — Select padronizado com label+descricao

### Arquivos a Modificar
- `src/app/globals.css` — Paleta de cores roxo + variaveis light mode
- `src/app/layout.tsx` — Integrar ThemeProvider
- `src/auth.config.ts` — Adicionar `name` ao JWT token
- `src/app/(protected)/layout.tsx` — Usar nome real do usuario (nao hardcoded)
- `src/components/layout/sidebar.tsx` — Sincronizar avatar/nome, responsividade, cores roxas
- `src/components/login/login-form.tsx` — Redesign completo com roxo
- `src/components/login/login-branding.tsx` — Substituir por logo Nexus AI centralizada
- `src/app/(auth)/login/page.tsx` — Layout centralizado
- `src/app/(auth)/forgot-password/page.tsx` — Cores roxas
- `src/app/(auth)/reset-password/page.tsx` — Cores roxas
- `src/components/dashboard/dashboard-filters.tsx` — Select padronizado + responsividade
- `src/app/(protected)/companies/[id]/_components/members-tab.tsx` — Select padronizado
- `src/app/(protected)/companies/[id]/_components/logs/log-filters.tsx` — Select padronizado + responsividade
- `src/app/(protected)/settings/settings-content.tsx` — Select padronizado + responsividade
- `src/app/(protected)/profile/profile-content.tsx` — Validacao email + cores + responsividade
- `src/app/(protected)/users/users-content.tsx` — Cores + responsividade tabela
- `src/app/(protected)/companies/_components/company-list.tsx` — Responsividade
- `src/app/(protected)/companies/[id]/_components/logs/log-table.tsx` — Responsividade mobile
- `src/components/dashboard/stats-cards.tsx` — Cores roxas
- `src/components/dashboard/recent-deliveries.tsx` — Responsividade
- `src/components/dashboard/dashboard-content.tsx` — Responsividade
- `src/components/routes/route-card.tsx` — Responsividade
- `src/components/routes/route-form-dialog.tsx` — Responsividade
- `src/app/(protected)/companies/[id]/_components/overview-tab.tsx` — Responsividade
- `src/app/(protected)/companies/[id]/_components/overview/overview-stats.tsx` — Responsividade
- `src/components/ui/sonner.tsx` — Cores roxas no toast

---

## Task 1: Copiar Assets de Logo para o Projeto

**Files:**
- Create: `public/logo-nexus-ai.png`
- Create: `public/marca-nexus-ai-dark.png`
- Create: `public/marca-nexus-ai-light.png`

- [ ] **Step 1: Copiar logo principal (icone N) para public/**

```bash
cp "/Users/joaovitorzanini/Downloads/Logo Nexus AI N.png" "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/public/logo-nexus-ai.png"
```

- [ ] **Step 2: Copiar marca completa para dark e light**

```bash
cp "/Users/joaovitorzanini/Downloads/Branding - Nexus AI/Nexus AI/Fotos de Perfil/Foto Perfil NexusAI 2.png" "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/public/marca-nexus-ai-dark.png"
cp "/Users/joaovitorzanini/Downloads/Branding - Nexus AI/Nexus AI/Fotos de Perfil/Foto Perfil NexusAI 2 (fundo transparente).png" "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/public/marca-nexus-ai-light.png"
```

- [ ] **Step 3: Verificar arquivos copiados**

```bash
ls -la public/logo-nexus-ai.png public/marca-nexus-ai-dark.png public/marca-nexus-ai-light.png
```
Expected: 3 arquivos PNG existem

- [ ] **Step 4: Commit**

```bash
git add public/logo-nexus-ai.png public/marca-nexus-ai-dark.png public/marca-nexus-ai-light.png
git commit -m "feat: adiciona assets de logo Nexus AI ao projeto"
```

---

## Task 2: Sistema de Cores — Migrar de Azul para Roxo + Light Mode

**Files:**
- Modify: `src/app/globals.css:51-118`

O logo Nexus AI usa um gradiente roxo que vai de violeta vibrante (#7c3aed / violet-600) a roxo escuro (#4c1d95 / violet-900). As cores primarias serao extraidas desse gradiente.

- [ ] **Step 1: Definir nova paleta de cores**

Cores extraidas do logo Nexus AI:
- **Primary (dark mode):** `#7c3aed` (violet-600) — botoes, links, estados ativos
- **Primary hover:** `#8b5cf6` (violet-500) — hover states
- **Primary glow:** `rgba(124, 58, 237, 0.3)` — sombras/glow
- **Primary (light mode):** `#6d28d9` (violet-700) — contraste melhor em fundo claro
- **Gradiente primario:** `from-violet-600 to-purple-600` (#7c3aed to #9333ea)
- **Chart colors:** Manter verde, laranja, mas trocar azuis por roxos

- [ ] **Step 2: Substituir globals.css completo**

Substituir o conteudo de `src/app/globals.css` por:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

/* ===== LIGHT MODE (padrao :root) ===== */
:root {
  --background: #fafafa;
  --foreground: #18181b;
  --card: #ffffff;
  --card-foreground: #18181b;
  --popover: #ffffff;
  --popover-foreground: #18181b;
  --primary: #6d28d9;
  --primary-foreground: #ffffff;
  --secondary: #f4f4f5;
  --secondary-foreground: #18181b;
  --muted: #f4f4f5;
  --muted-foreground: #71717a;
  --accent: #f4f4f5;
  --accent-foreground: #18181b;
  --destructive: #ef4444;
  --border: #e4e4e7;
  --input: #e4e4e7;
  --ring: #6d28d9;
  --chart-1: #7c3aed;
  --chart-2: #8b5cf6;
  --chart-3: #22c55e;
  --chart-4: #f97316;
  --chart-5: #a855f7;
  --radius: 0.75rem;
  --sidebar: #ffffff;
  --sidebar-foreground: #18181b;
  --sidebar-primary: #6d28d9;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f4f4f5;
  --sidebar-accent-foreground: #18181b;
  --sidebar-border: #e4e4e7;
  --sidebar-ring: #6d28d9;
}

/* ===== DARK MODE ===== */
.dark {
  --background: #09090b;
  --foreground: #fafafa;
  --card: #18181b;
  --card-foreground: #fafafa;
  --popover: #18181b;
  --popover-foreground: #fafafa;
  --primary: #7c3aed;
  --primary-foreground: #ffffff;
  --secondary: #27272a;
  --secondary-foreground: #fafafa;
  --muted: #27272a;
  --muted-foreground: #a1a1aa;
  --accent: #27272a;
  --accent-foreground: #fafafa;
  --destructive: #ef4444;
  --border: #27272a;
  --input: #27272a;
  --ring: #7c3aed;
  --chart-1: #7c3aed;
  --chart-2: #8b5cf6;
  --chart-3: #22c55e;
  --chart-4: #f97316;
  --chart-5: #a855f7;
  --sidebar: #09090b;
  --sidebar-foreground: #fafafa;
  --sidebar-primary: #7c3aed;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #27272a;
  --sidebar-accent-foreground: #fafafa;
  --sidebar-border: #27272a;
  --sidebar-ring: #7c3aed;
}

/* Toast progress bar */
[data-sonner-toast] [data-progress] {
  height: 2px;
  background: rgba(124, 58, 237, 0.5);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

- [ ] **Step 3: Verificar que o CSS compila sem erros**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta" && npx next build --no-lint 2>&1 | head -20
```
Expected: Sem erros de CSS

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: migra paleta de cores de azul para roxo Nexus AI + adiciona light mode"
```

---

## Task 3: Implementar ThemeProvider (next-themes)

**Files:**
- Create: `src/components/providers/theme-provider.tsx`
- Modify: `src/app/layout.tsx`

Atualmente o tema esta hardcoded como `dark` na tag `<html>`. Precisamos integrar `next-themes` para que a troca de tema funcione de verdade.

- [ ] **Step 1: Criar ThemeProvider wrapper**

Criar `src/components/providers/theme-provider.tsx`:

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 2: Integrar ThemeProvider no layout raiz**

Modificar `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexus | Roteador Webhook",
  description: "Roteador de webhooks da Meta para multiplos destinos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Notas:**
- Remover `dark` hardcoded da classe `<html>` — next-themes vai gerenciar
- Remover `bg-[#09090b] text-zinc-50` do body — agora vem das CSS variables via `bg-background text-foreground`
- Adicionar `suppressHydrationWarning` no html (exigido pelo next-themes)

- [ ] **Step 3: Atualizar profile-content.tsx para usar next-themes**

No `src/app/(protected)/profile/profile-content.tsx`, a secao de Aparencia precisa chamar `setTheme()` do next-themes ALEM de salvar no banco:

Adicionar no topo do componente:
```tsx
import { useTheme } from "next-themes";
```

Dentro do componente `ProfileContent`, adicionar:
```tsx
const { setTheme: setNextTheme } = useTheme();
```

Na funcao que troca o tema, apos `updateTheme(theme)`, adicionar:
```tsx
setNextTheme(theme);
```

- [ ] **Step 4: Carregar tema do usuario ao fazer login**

No `src/app/(protected)/layout.tsx`, adicionar componente client que aplica o tema salvo do usuario:

Criar inline no layout ou separar — a abordagem mais simples e adicionar um `<ThemeInitializer>` client component que le o tema da sessao e chama `setTheme`:

```tsx
// Adicionar ao layout.tsx, importando useTheme no client component
// O tema ja esta no JWT token (auth.config.ts ja tem token.theme)
```

A forma mais simples: no `(protected)/layout.tsx`, passar `theme` como prop e criar um pequeno client component:

```tsx
"use client";
import { useTheme } from "next-themes";
import { useEffect } from "react";

export function ThemeInitializer({ theme }: { theme: string | null }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    if (theme) setTheme(theme);
  }, [theme, setTheme]);
  return null;
}
```

Renderizar `<ThemeInitializer theme={(session.user as any).theme} />` no layout.

- [ ] **Step 5: Verificar que tema funciona**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta" && npx next build --no-lint 2>&1 | tail -5
```
Expected: Build bem-sucedido

- [ ] **Step 6: Commit**

```bash
git add src/components/providers/theme-provider.tsx src/app/layout.tsx src/app/(protected)/layout.tsx src/app/(protected)/profile/profile-content.tsx
git commit -m "feat: implementa ThemeProvider next-themes com suporte dark/light/system"
```

---

## Task 4: Corrigir Sincronizacao do Sidebar (Avatar + Nome)

**Files:**
- Modify: `src/auth.config.ts:23-29`
- Modify: `src/app/(protected)/layout.tsx:16-24`

**Problema:** O JWT token armazena `avatarUrl` e `name` apenas no login. Quando o usuario atualiza o avatar ou nome no perfil, o sidebar continua mostrando dados antigos. Alem disso, o `role` esta hardcoded como "Super Admin" ou "Usuario" sem refletir o papel real.

**Solucao:** Fazer o callback JWT buscar dados frescos do banco a cada request (ou usar `update()` do NextAuth para refrescar o token quando o perfil muda).

- [ ] **Step 1: Atualizar JWT callback para refrescar dados**

Modificar `src/auth.config.ts`, no callback `jwt`:

```tsx
async jwt({ token, user, trigger }) {
  if (user) {
    token.id = user.id!;
    token.isSuperAdmin = (user as any).isSuperAdmin;
    token.avatarUrl = (user as any).avatarUrl;
    token.theme = (user as any).theme;
    token.name = user.name;
  }
  // Refrescar dados quando trigger === "update" (chamado pelo client)
  if (trigger === "update" && token.id) {
    const { prisma } = await import("@/generated/prisma/client");
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
```

**Nota:** O import dinamico do prisma evita problemas de edge runtime.

- [ ] **Step 2: Chamar session.update() apos salvar perfil**

No `src/app/(protected)/profile/profile-content.tsx`, apos cada acao que muda nome ou avatar, chamar:

```tsx
import { useSession } from "next-auth/react";

// Dentro do componente:
const { update: updateSession } = useSession();

// Apos salvar nome/avatar com sucesso:
await updateSession();
```

Isso dispara o trigger `"update"` no JWT callback, que busca dados frescos.

**Importante:** Para que `useSession()` funcione, precisamos envolver o layout com `<SessionProvider>`. Adicionar ao `(protected)/layout.tsx`:

```tsx
// No client wrapper ou diretamente:
import { SessionProvider } from "next-auth/react";

// Envolver children com <SessionProvider>
```

A forma mais limpa: criar um wrapper client component ou adicionar ao ThemeProvider existente.

- [ ] **Step 3: Corrigir role no layout.tsx**

Modificar `src/app/(protected)/layout.tsx` linhas 16-24:

**De:**
```tsx
const user = {
  name: session.user.name || session.user.email || 'Usuario',
  email: session.user.email || '',
  role: isSuperAdmin ? 'Super Admin' : 'Usuario',
  isSuperAdmin,
  avatarUrl,
};
```

**Para:**
```tsx
const user = {
  name: session.user.name || session.user.email || 'Usuario',
  email: session.user.email || '',
  role: isSuperAdmin ? 'Super Admin' : 'Usuario',
  isSuperAdmin,
  avatarUrl,
};
```

Na verdade, o `role` "Super Admin" vs "Usuario" esta correto para o sidebar (nao temos como saber a role por empresa no escopo global). O problema real e que o `name` nao esta sendo atualizado no token. O Step 1 ja resolve isso com o `trigger === "update"`.

- [ ] **Step 4: Remover bg-[#09090b] hardcoded do layout.tsx**

No `src/app/(protected)/layout.tsx`, trocar:
```tsx
<div className="flex h-screen overflow-hidden bg-[#09090b]">
```
Por:
```tsx
<div className="flex h-screen overflow-hidden bg-background">
```

Isso garante que o fundo responde ao tema claro/escuro.

- [ ] **Step 5: Commit**

```bash
git add src/auth.config.ts src/app/(protected)/layout.tsx src/app/(protected)/profile/profile-content.tsx
git commit -m "fix: sincroniza avatar e nome no sidebar via session update"
```

---

## Task 5: Redesenhar Tela de Login

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/components/login/login-branding.tsx` — Redesenhar completamente
- Modify: `src/components/login/login-form.tsx` — Cores roxas

**Requisitos do usuario:**
- Remover cards de features (Roteamento Inteligente, Entrega Garantida, Monitoramento)
- Centralizar login — tela de plataforma interna, nao de venda
- Logo Nexus AI grande e trabalhada com efeito/animacao
- Tom de roxo (nao mais azul)
- Background bonito e profissional

- [ ] **Step 1: Redesenhar login-branding.tsx**

Substituir `src/components/login/login-branding.tsx` completamente:

```tsx
'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

export function LoginBranding() {
  return (
    <div className="relative hidden h-full flex-col items-center justify-center overflow-hidden lg:flex">
      {/* Background gradients roxo */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-[#09090b] to-purple-950" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute -bottom-20 -right-20 h-[500px] w-[500px] rounded-full bg-purple-600/10 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-violet-500/8 blur-[100px]" />
        {/* Dot grid sutil */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Logo centralizada com efeito */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center gap-8"
      >
        {/* Glow ring atras do logo */}
        <motion.div
          animate={{
            boxShadow: [
              '0 0 60px rgba(124, 58, 237, 0.15)',
              '0 0 80px rgba(124, 58, 237, 0.25)',
              '0 0 60px rgba(124, 58, 237, 0.15)',
            ],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="rounded-3xl"
        >
          <Image
            src="/logo-nexus-ai.png"
            alt="Nexus AI"
            width={140}
            height={140}
            className="rounded-3xl"
            priority
          />
        </motion.div>

        {/* Texto da marca */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center"
        >
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Nexus AI
          </h1>
          <p className="text-sm text-zinc-500 mt-2">
            Roteador de Webhooks
          </p>
        </motion.div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1 }}
        className="absolute bottom-8 z-10"
      >
        <p className="text-xs text-zinc-600">
          NexusAI360 &copy; {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Atualizar cores do login-form.tsx**

No `src/components/login/login-form.tsx`, substituir todas as referencias de azul por roxo:

- `bg-blue-600` → `bg-violet-600`
- `shadow-[0_0_24px_rgba(37,99,235,0.4)]` → `shadow-[0_0_24px_rgba(124,58,237,0.4)]`
- `focus:border-blue-500 focus:ring-blue-500/50` → `focus:border-violet-500 focus:ring-violet-500/50`
- `hover:text-blue-400` → `hover:text-violet-400`
- `bg-gradient-to-r from-blue-600 to-blue-500` → `bg-gradient-to-r from-violet-600 to-purple-600`
- `hover:from-blue-500 hover:to-blue-400` → `hover:from-violet-500 hover:to-purple-500`
- `hover:shadow-[0_0_24px_rgba(37,99,235,0.4)]` → `hover:shadow-[0_0_24px_rgba(124,58,237,0.4)]`
- `focus:ring-2 focus:ring-blue-500` → `focus:ring-2 focus:ring-violet-500`

Tambem no logo mobile (linhas 38-48), trocar o icone Webhook por Image do logo:
```tsx
<Image src="/logo-nexus-ai.png" alt="Nexus AI" width={40} height={40} className="rounded-xl" />
<span className="text-lg font-bold text-white tracking-tight">Nexus AI</span>
```

- [ ] **Step 3: Atualizar layout do login page**

O `src/app/(auth)/login/page.tsx` precisa manter o layout split mas com o branding ocupando metade esquerda.

Se o layout atual ja e `hidden lg:flex` para o branding e `flex-1` para o form, manter. Apenas garantir que o fundo do lado do form tambem responde ao tema:

```tsx
<div className="flex min-h-screen bg-background">
  <LoginBranding />
  <div className="flex flex-1 items-center justify-center p-6">
    <LoginForm />
  </div>
</div>
```

Trocar `bg-[#09090b]` por `bg-background`.

- [ ] **Step 4: Atualizar forgot-password e reset-password**

Nos arquivos `src/app/(auth)/forgot-password/page.tsx` e `src/app/(auth)/reset-password/page.tsx`, aplicar as mesmas mudancas de cor:
- Azul → Roxo em todos os focus states, botoes e links
- `bg-[#09090b]` → `bg-background`

- [ ] **Step 5: Verificar build**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta" && npx next build --no-lint 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add src/components/login/ src/app/(auth)/
git commit -m "feat: redesenha tela de login com branding Nexus AI roxo"
```

---

## Task 6: Rebranding Roxo — Sidebar e Componentes Internos

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/dashboard/stats-cards.tsx`
- Modify: `src/components/ui/sonner.tsx`

Trocar todas as referencias de azul (blue-500, blue-600, #2563eb) por roxo (violet-500, violet-600, #7c3aed) nos componentes internos da plataforma.

- [ ] **Step 1: Atualizar sidebar.tsx — cores**

No `src/components/layout/sidebar.tsx`:

- Logo: `bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.3)]` → Trocar icone Webhook por `<Image src="/logo-nexus-ai.png">` com tamanho 36x36, `rounded-lg`
- Nome "Nexus" → "Nexus AI"
- Subtitulo "Roteador Webhook" permanece
- Menu ativo: `text-blue-500 border-blue-500` → `text-violet-500 border-violet-500`
- Icone ativo: `text-blue-500` → `text-violet-500`

- [ ] **Step 2: Atualizar sidebar.tsx — suporte a light mode**

Trocar `bg-[#09090b]` por `bg-background` e `border-zinc-800` por `border-border`. Trocar cores hardcoded:
- `text-white` → `text-foreground`
- `text-zinc-400` → `text-muted-foreground`
- `text-zinc-200` → `text-foreground`
- `hover:bg-zinc-800/30` → `hover:bg-accent`
- `bg-zinc-800/50` → `bg-accent`
- `border-zinc-800` → `border-border`
- `bg-zinc-800 text-zinc-300` (avatar fallback) → `bg-muted text-muted-foreground`

**Nota:** Manter classes que ja usam CSS variables (bg-background, text-foreground, etc). Trocar apenas as hardcoded.

- [ ] **Step 3: Atualizar dashboard stats-cards.tsx**

Trocar referencias de azul por roxo nos cards de estatistica:
- Cores de destaque que eram azuis → roxo
- Gradientes azuis → gradientes roxos

- [ ] **Step 4: Buscar e substituir azul em TODO o codebase**

Fazer um search global por `blue-500`, `blue-600`, `blue-400`, `#2563eb`, `rgba(37,99,235` e substituir por equivalentes roxos:
- `blue-400` → `violet-400`
- `blue-500` → `violet-500`
- `blue-600` → `violet-600`
- `#2563eb` → `#7c3aed`
- `rgba(37,99,235` → `rgba(124,58,237`

**Excecoes:** NAO trocar em `node_modules`, arquivos de docs, ou cores de role badges (Admin usa azul como distincao de papel).

Para os role badges em `users-content.tsx`:
- Admin badge: `bg-blue-500/10 border-blue-500/20 text-blue-400` — manter azul (e uma cor semantica de papel, nao de marca)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: rebranding roxo completo em sidebar e componentes internos"
```

---

## Task 7: Padronizar Todos os Selects

**Files:**
- Create: `src/components/ui/custom-select.tsx`
- Modify: `src/components/dashboard/dashboard-filters.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/members-tab.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/logs/log-filters.tsx`
- Modify: `src/app/(protected)/settings/settings-content.tsx`

**Padrao desejado:** O `RoleSelect` em `users-content.tsx` (linhas 205-253) — dropdown custom com label em negrito + descricao em texto menor, fundo escuro, bordas suaves.

- [ ] **Step 1: Criar componente CustomSelect reutilizavel**

Criar `src/components/ui/custom-select.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Selecionar",
  className,
  triggerClassName,
  icon,
  disabled = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground cursor-pointer transition-all duration-200 hover:border-muted-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed",
          triggerClassName
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {icon}
          {selected?.icon}
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
            open && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-xl shadow-black/20 overflow-hidden"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-3 px-3 py-2.5 text-left cursor-pointer transition-all duration-200 hover:bg-accent",
                  value === option.value && "bg-accent/50"
                )}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </span>
                  )}
                </div>
                {value === option.value && (
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Substituir select do dashboard-filters.tsx**

No `src/components/dashboard/dashboard-filters.tsx`, trocar o `Select` do shadcn pelo `CustomSelect`:

```tsx
import { CustomSelect } from "@/components/ui/custom-select";
import { Building2 } from "lucide-react";

// Dentro do JSX, substituir o bloco Select por:
<CustomSelect
  value={selectedCompanyId ?? "all"}
  onChange={(val) => onCompanyChange(!val || val === "all" ? undefined : val)}
  icon={<Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
  triggerClassName="h-9 min-w-[160px] sm:min-w-[180px]"
  options={[
    { value: "all", label: "Todas as empresas", description: "Exibir dados de todas" },
    ...companies.map((c) => ({
      value: c.id,
      label: c.name,
    })),
  ]}
/>
```

- [ ] **Step 3: Substituir select do members-tab.tsx**

No `src/app/(protected)/companies/[id]/_components/members-tab.tsx`, trocar os Selects de papel e usuario pelo `CustomSelect`.

Para o select de role:
```tsx
<CustomSelect
  value={memberRole}
  onChange={(val) => handleRoleChange(member.id, val)}
  options={roleOptions.map((r) => ({
    value: r.value,
    label: r.label,
    description: r.description,
  }))}
/>
```

- [ ] **Step 4: Substituir select do log-filters.tsx**

No `src/app/(protected)/companies/[id]/_components/logs/log-filters.tsx`, trocar o Select de rota pelo `CustomSelect`.

- [ ] **Step 5: Substituir select do settings-content.tsx**

No `src/app/(protected)/settings/settings-content.tsx`, trocar o Select de estrategia de retry:
```tsx
<CustomSelect
  value={retryStrategy}
  onChange={setRetryStrategy}
  options={[
    { value: "exponential", label: "Exponencial", description: "Backoff exponencial entre tentativas" },
    { value: "fixed", label: "Fixo", description: "Intervalo fixo entre tentativas" },
  ]}
/>
```

- [ ] **Step 6: Atualizar RoleSelect em users-content.tsx**

Substituir o `RoleSelect` inline por uso do `CustomSelect`:

```tsx
<CustomSelect
  value={form.role}
  onChange={(val) => setForm({ ...form, role: val })}
  options={availableRoles.map((r) => ({
    value: r.value,
    label: r.label,
    description: r.description,
  }))}
/>
```

Remover a funcao `RoleSelect` local do arquivo (era inline).

- [ ] **Step 7: Verificar build**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta" && npx next build --no-lint 2>&1 | tail -10
```

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/custom-select.tsx src/components/dashboard/dashboard-filters.tsx src/app/(protected)/companies/ src/app/(protected)/settings/ src/app/(protected)/users/
git commit -m "feat: padroniza todos os selects com CustomSelect (label + descricao)"
```

---

## Task 8: Validacao de Email no Perfil

**Files:**
- Modify: `src/app/(protected)/profile/profile-content.tsx`
- Modify: `src/lib/actions/profile.ts:142-219`

- [ ] **Step 1: Melhorar validacao no client (profile-content.tsx)**

Antes de chamar `requestEmailChange`, validar no client:

```tsx
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Na funcao de submit do email:
if (!EMAIL_REGEX.test(newEmail.trim())) {
  toast.error("Digite um e-mail valido (ex: usuario@dominio.com)");
  return;
}
```

- [ ] **Step 2: Melhorar validacao no server (profile.ts)**

No `src/lib/actions/profile.ts`, substituir a validacao basica:

**De:**
```tsx
if (!normalizedEmail || !normalizedEmail.includes("@")) {
```

**Para:**
```tsx
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/profile/profile-content.tsx src/lib/actions/profile.ts
git commit -m "fix: melhora validacao de email no perfil (client + server)"
```

---

## Task 9: Responsividade Mobile — Sidebar e Layout Base

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/app/(protected)/layout.tsx`

**Problema:** O sidebar mobile funciona em teoria (hamburger + overlay), mas o link para `/profile` nao abre no mobile (relatado pelo usuario). Verificar e corrigir.

- [ ] **Step 1: Diagnosticar por que perfil nao abre no mobile**

O link para profile esta na secao bottom do sidebar (linha 102-118). No mobile, quando o usuario clica no avatar no sidebar overlay, o `onClick={() => setMobileOpen(false)}` deveria fechar o menu e o `Link href="/profile"` deveria navegar. Possivel causa: o botao de toggle do hamburger (fixed, z-50) pode estar sobrepondo a area clicavel do avatar.

Verificar se o hamburger button na posicao `fixed top-4 left-4 z-50` interfere. Quando o sidebar esta aberto, o botao X esta na mesma posicao. O avatar esta no bottom-left do sidebar overlay. Nao deveria haver conflito.

**Outra possibilidade:** O sidebar mobile nao tem scroll — se o conteudo do menu e maior que a tela, o botao de profile no bottom pode ficar fora da viewport.

**Fix:** Garantir que o sidebar mobile tem `overflow-y-auto` no conteudo:

```tsx
// No sidebarContent, a div wrapper:
<div className="flex h-full flex-col bg-background border-r border-border overflow-y-auto">
```

- [ ] **Step 2: Melhorar target de toque no mobile**

No sidebar, a area do avatar e `py-1.5` que resulta em ~36px de altura — abaixo do minimo recomendado de 44px para touch targets. Aumentar:

```tsx
<Link
  href="/profile"
  onClick={() => setMobileOpen(false)}
  className="flex items-center gap-3 rounded-lg px-2 py-2.5 -mx-1 transition-all duration-200 hover:bg-accent cursor-pointer group"
>
```

- [ ] **Step 3: Ajustar padding do layout para mobile**

No `src/app/(protected)/layout.tsx`, o conteudo principal tem `px-4 py-8 sm:px-6 lg:px-8`. No mobile, precisa de espaco para o hamburger button que esta em `top-4 left-4`:

```tsx
<div className="mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-8 lg:px-8">
```

O `pt-16` no mobile da espaco para o hamburger; `sm:pt-8` restaura o padding normal em telas maiores.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx src/app/(protected)/layout.tsx
git commit -m "fix: corrige responsividade do sidebar e navegacao para perfil no mobile"
```

---

## Task 10: Responsividade Mobile — Dashboard

**Files:**
- Modify: `src/components/dashboard/dashboard-filters.tsx`
- Modify: `src/components/dashboard/dashboard-content.tsx`
- Modify: `src/components/dashboard/stats-cards.tsx`
- Modify: `src/components/dashboard/recent-deliveries.tsx`

- [ ] **Step 1: Dashboard filters — empilhar no mobile**

O `dashboard-filters.tsx` ja tem `flex-col sm:flex-row`, mas os filtros internos (select + period + refresh) estao em `flex` sem wrap. Ajustar:

```tsx
<div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto sm:ml-auto">
```

O CustomSelect trigger precisa ser `w-full sm:w-auto sm:min-w-[180px]` no mobile.

- [ ] **Step 2: Stats cards — grid 2 colunas no mobile**

O `stats-cards.tsx` ja tem `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`. Ajustar para `grid-cols-2` mesmo no mobile (cards sao pequenos o suficiente):

```tsx
className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
```

- [ ] **Step 3: Recent deliveries — scroll horizontal no mobile**

A tabela de entregas recentes precisa de `overflow-x-auto` no wrapper e texto truncado nas colunas:

```tsx
<div className="overflow-x-auto -mx-4 sm:mx-0">
  <Table className="min-w-[600px] sm:min-w-0">
```

- [ ] **Step 4: Dashboard content — ajustar grid**

O `dashboard-content.tsx` tem `grid-cols-1 lg:grid-cols-3`. No tablet (md), usar 2 colunas:

```tsx
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
```

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/
git commit -m "fix: responsividade mobile do dashboard (filtros, stats, tabelas)"
```

---

## Task 11: Responsividade Mobile — Pagina de Empresas

**Files:**
- Modify: `src/app/(protected)/companies/_components/company-list.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/overview-tab.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/overview/overview-stats.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/logs/log-table.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/members-tab.tsx`

- [ ] **Step 1: Company list — ajustar cards**

O grid de empresas ja tem `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. Verificar se os cards cabem em 320px de largura. Ajustar padding se necessario.

- [ ] **Step 2: Overview stats — 2 colunas no mobile**

O `overview-stats.tsx` tem `grid-cols-2 lg:grid-cols-4`. Manter (ja e bom para mobile).

- [ ] **Step 3: Log table — responsividade critica**

A tabela de logs tem 9 colunas com larguras fixas. No mobile, e inutilizavel. Solucao:

Adicionar scroll horizontal com indicador visual:
```tsx
<div className="relative overflow-x-auto rounded-lg border border-border">
  <Table className="min-w-[800px]">
```

Opcionalmente, esconder colunas menos importantes no mobile:
```tsx
// Colunas Duration e Attempts:
<TableHead className="hidden md:table-cell">Duracao</TableHead>
<TableHead className="hidden md:table-cell">Tentativas</TableHead>
```

E as celulas correspondentes:
```tsx
<TableCell className="hidden md:table-cell">{log.duration}</TableCell>
<TableCell className="hidden md:table-cell">{log.attempts}</TableCell>
```

- [ ] **Step 4: Members tab — tabela responsiva**

A tabela de membros tambem precisa de scroll horizontal no mobile:
```tsx
<div className="overflow-x-auto">
  <Table className="min-w-[500px]">
```

- [ ] **Step 5: Tabs de empresa — scroll horizontal**

As tabs (Visao Geral, WhatsApp Cloud, Rotas de Webhook, Logs, Membros) precisam de scroll horizontal no mobile. Verificar se ja tem overflow e ajustar:
```tsx
<div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
  <TabsList className="w-max sm:w-auto">
```

- [ ] **Step 6: Commit**

```bash
git add src/app/(protected)/companies/
git commit -m "fix: responsividade mobile em paginas de empresas (tabelas, grids, tabs)"
```

---

## Task 12: Responsividade Mobile — Perfil, Usuarios e Settings

**Files:**
- Modify: `src/app/(protected)/profile/profile-content.tsx`
- Modify: `src/app/(protected)/users/users-content.tsx`
- Modify: `src/app/(protected)/settings/settings-content.tsx`

- [ ] **Step 1: Profile — garantir que abre e funciona no mobile**

O `profile-content.tsx` usa `grid grid-cols-1 sm:grid-cols-2` para campos. Verificar:
- Cards nao devem ter largura fixa
- Avatar upload precisa de target de toque adequado (minimo 44x44)
- Secao de tema (3 cards lado a lado) precisa empilhar: `grid grid-cols-1 sm:grid-cols-3`
- Botoes de acao precisam ser full-width no mobile

```tsx
// Cards de tema:
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
```

- [ ] **Step 2: Users table — scroll horizontal**

```tsx
<div className="overflow-x-auto">
  <Table className="min-w-[600px]">
```

Esconder colunas secundarias:
```tsx
<TableHead className="hidden sm:table-cell">Criado em</TableHead>
```

- [ ] **Step 3: Settings — ajustar grids**

Os settings ja usam `grid-cols-1 md:grid-cols-2`. Verificar que todos os inputs sao full-width no mobile e que os botoes nao ficam cortados.

- [ ] **Step 4: Dialogs/Modals — verificar no mobile**

Os dialogs ja tem `max-w-[calc(100%-2rem)]` e `sm:max-w-md`. Verificar:
- Dialog de criar usuario: campos empilhados no mobile
- Dialog de rota: campos empilhados
- Todos os footers: `flex-col-reverse sm:flex-row`

- [ ] **Step 5: Commit**

```bash
git add src/app/(protected)/profile/ src/app/(protected)/users/ src/app/(protected)/settings/
git commit -m "fix: responsividade mobile em perfil, usuarios e configuracoes"
```

---

## Task 13: Substituir Hardcoded Colors por CSS Variables (Light Mode Support)

**Files:**
- Todos os componentes listados acima que usam cores hardcoded

**Objetivo:** Garantir que TODOS os componentes respondem ao tema claro/escuro usando CSS variables ao inves de cores hardcoded como `bg-zinc-800`, `text-zinc-200`, `border-zinc-700`.

- [ ] **Step 1: Buscar e catalogar todas as cores hardcoded**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta" && rg "bg-\[#09090b\]|bg-zinc-|text-zinc-|border-zinc-" src/ --files-with-matches
```

- [ ] **Step 2: Substituir nos componentes principais**

Mapa de substituicao:
| Hardcoded | CSS Variable |
|-----------|-------------|
| `bg-[#09090b]` | `bg-background` |
| `bg-zinc-900` | `bg-background` ou `bg-card` |
| `bg-zinc-800` | `bg-muted` ou `bg-secondary` |
| `bg-zinc-800/50` | `bg-muted/50` |
| `text-white` | `text-foreground` |
| `text-zinc-200` | `text-foreground` |
| `text-zinc-300` | `text-foreground` |
| `text-zinc-400` | `text-muted-foreground` |
| `text-zinc-500` | `text-muted-foreground` |
| `text-zinc-600` | `text-muted-foreground/60` |
| `border-zinc-700` | `border-border` |
| `border-zinc-800` | `border-border` |
| `placeholder:text-zinc-500` | `placeholder:text-muted-foreground` |
| `placeholder:text-zinc-600` | `placeholder:text-muted-foreground/60` |

**Nota:** Nao substituir tudo cegamente. Algumas cores como `bg-zinc-800/50` em hovers podem ficar melhores como `hover:bg-accent`. Analisar caso a caso.

**Nota 2:** Componentes como badges de role (Super Admin = purple, Admin = blue) devem MANTER suas cores semanticas — essas nao mudam com o tema.

- [ ] **Step 3: Testar visualmente dark e light mode**

Verificar cada pagina principal:
1. Login
2. Dashboard
3. Empresas (lista + detalhe)
4. Usuarios
5. Configuracoes
6. Perfil

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: substitui cores hardcoded por CSS variables para suporte light/dark mode"
```

---

## Task 14: Limpeza de Codigo e Documentacao

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/` (verificar obsoletos)
- Modify: `README.md` (se existir)

- [ ] **Step 1: Atualizar CLAUDE.md**

Atualizar o status do projeto:
- Fase 3B: CONCLUIDA — rebranding roxo, light mode, responsividade mobile, selects padronizados
- Remover pendencias que foram concluidas
- Adicionar `custom-select.tsx` na lista de componentes

- [ ] **Step 2: Limpar arquivos obsoletos**

Verificar se ha arquivos nao utilizados:
- `src/components/ui/textarea.tsx` (listado como untracked) — verificar se e usado em algum lugar. Se nao, nao adicionar ao git.
- Verificar imports nao utilizados em componentes modificados

- [ ] **Step 3: Atualizar memoria do projeto**

Atualizar os arquivos de memoria com as mudancas feitas.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: atualiza documentacao com Fase 3B concluida"
```

---

## Task 15: Build Final e Deploy

**Files:**
- Nenhum arquivo novo

- [ ] **Step 1: Build completo**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta" && npx next build --no-lint
```
Expected: Build bem-sucedido sem erros

- [ ] **Step 2: Verificar que nao ha erros de TypeScript**

```bash
npx tsc --noEmit
```
Expected: Sem erros

- [ ] **Step 3: Push para main**

```bash
git push origin main
```

O GitHub Actions vai fazer build + deploy automatico no Portainer.

- [ ] **Step 4: Verificar deploy em producao**

Acessar https://roteadorwebhook.nexusai360.com e verificar:
1. Tela de login com branding roxo Nexus AI
2. Dark mode funcional
3. Light mode funcional
4. Sidebar mostrando avatar e nome corretos
5. Selects padronizados no dashboard
6. Responsividade no celular

---

## Resumo de Entregaveis

| # | Task | Descricao |
|---|------|-----------|
| 1 | Assets | Logo Nexus AI copiada para public/ |
| 2 | Cores | Paleta migrada de azul para roxo + light mode CSS |
| 3 | ThemeProvider | next-themes integrado, dark/light/system funcional |
| 4 | Sidebar Sync | Avatar e nome sincronizados via session update |
| 5 | Login | Redesenho completo com branding Nexus AI roxo |
| 6 | Rebranding | Todos os componentes migrados para roxo |
| 7 | Selects | CustomSelect padronizado em toda plataforma |
| 8 | Email | Validacao regex no client e server |
| 9 | Mobile Base | Sidebar, layout e navegacao responsivos |
| 10 | Mobile Dashboard | Dashboard totalmente responsivo |
| 11 | Mobile Empresas | Tabelas, tabs e grids responsivos |
| 12 | Mobile Perfil/Users | Todas as paginas restantes responsivas |
| 13 | Light Mode | Cores hardcoded substituidas por CSS variables |
| 14 | Docs | CLAUDE.md e documentacao atualizados |
| 15 | Deploy | Build, push e verificacao em producao |
