# Busca Global — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Command palette de busca global (⌘K) para navegar entre empresas, rotas, logs e usuários.

**Architecture:** API Route `GET /api/search?q=` executa 4 queries Prisma em paralelo com tenant scoping. Client usa `cmdk` dentro de Dialog base-ui, com debounce + AbortController. SearchContext compartilha controle entre Sidebar e CommandPalette.

**Tech Stack:** cmdk, Next.js API Route, Prisma (contains/startsWith), Dialog base-ui, Lucide React, date-fns

**Spec:** `docs/superpowers/specs/2026-04-09-busca-global-design.md`

---

### Task 1: Instalar cmdk

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar dependência**

```bash
npm install cmdk@^1.0.0
```

- [ ] **Step 2: Verificar instalação**

```bash
node -e "require('cmdk'); console.log('cmdk OK')"
```

Expected: `cmdk OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: adiciona cmdk para command palette"
```

---

### Task 2: API Route de busca

**Files:**
- Create: `src/app/api/search/route.ts`

- [ ] **Step 1: Criar API Route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  type: "company" | "route" | "log" | "user";
  meta?: string;
}

interface SearchResponse {
  companies: SearchItem[];
  routes: SearchItem[];
  logs: SearchItem[];
  users: SearchItem[];
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ error: "Busca requer pelo menos 2 caracteres" }, { status: 400 });
  }

  const user = session.user as any;
  const isSuperAdmin: boolean = user.isSuperAdmin ?? false;
  const platformRole: string = user.platformRole ?? "viewer";
  const userId: string = user.id;

  // Tenant scoping — IDs de empresas acessíveis
  let companyIds: string[] | null = null; // null = sem filtro (super admin)
  if (!isSuperAdmin) {
    const memberships = await prisma.userCompanyMembership.findMany({
      where: { userId, isActive: true },
      select: { companyId: true },
    });
    companyIds = memberships.map((m) => m.companyId);
    if (companyIds.length === 0) {
      return NextResponse.json({ companies: [], routes: [], logs: [], users: [] } satisfies SearchResponse);
    }
  }

  const companyWhere = companyIds ? { id: { in: companyIds } } : {};
  const routeCompanyWhere = companyIds ? { companyId: { in: companyIds } } : {};

  // Queries em paralelo
  const canSearchUsers = platformRole === "super_admin" || platformRole === "admin";

  const [companies, routes, logs, users] = await Promise.all([
    // Empresas
    prisma.company.findMany({
      where: {
        ...companyWhere,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, slug: true },
      take: 5,
      orderBy: { name: "asc" },
    }),

    // Rotas
    prisma.webhookRoute.findMany({
      where: {
        ...routeCompanyWhere,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { url: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        url: true,
        companyId: true,
        company: { select: { name: true } },
      },
      take: 5,
      orderBy: { name: "asc" },
    }),

    // Logs (InboundWebhook)
    prisma.inboundWebhook.findMany({
      where: {
        ...(companyIds ? { companyId: { in: companyIds } } : {}),
        eventType: { startsWith: q, mode: "insensitive" },
      },
      select: {
        id: true,
        eventType: true,
        processingStatus: true,
        receivedAt: true,
        companyId: true,
        company: { select: { name: true } },
      },
      take: 5,
      orderBy: { receivedAt: "desc" },
    }),

    // Usuários (apenas admin+)
    canSearchUsers
      ? prisma.user.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, email: true, platformRole: true },
          take: 5,
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // Mapear para SearchItem
  const response: SearchResponse = {
    companies: companies.map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: c.slug,
      href: `/companies/${c.id}`,
      type: "company" as const,
    })),
    routes: routes.map((r) => ({
      id: r.id,
      title: r.name,
      subtitle: r.url.length > 50 ? r.url.slice(0, 50) + "..." : r.url,
      href: `/companies/${r.companyId}?tab=routes`,
      type: "route" as const,
      meta: r.company.name,
    })),
    logs: logs.map((l) => ({
      id: l.id,
      title: l.eventType ?? "Evento",
      subtitle: `${l.company.name} · ${formatDistanceToNow(l.receivedAt, { addSuffix: true, locale: ptBR })}`,
      href: `/companies/${l.companyId}?tab=logs`,
      type: "log" as const,
      meta: l.processingStatus,
    })),
    users: users.map((u) => ({
      id: u.id,
      title: u.name ?? u.email,
      subtitle: u.email,
      href: "/users",
      type: "user" as const,
      meta: PLATFORM_ROLE_LABELS[u.platformRole] ?? u.platformRole,
    })),
  };

  return NextResponse.json(response);
}
```

- [ ] **Step 2: Testar manualmente**

```bash
# Com o dev server rodando:
# 1. Fazer login no browser
# 2. Abrir DevTools > Console
# 3. Executar:
fetch('/api/search?q=test').then(r => r.json()).then(console.log)
```

Expected: JSON com `{ companies: [], routes: [], logs: [], users: [] }` (arrays podem ter items dependendo dos dados)

- [ ] **Step 3: Testar validações**

```bash
# Sem query (deve retornar 400)
fetch('/api/search?q=a').then(r => console.log(r.status))
# Expected: 400

# Sem auth (abrir aba anônima e testar)
# Expected: 401
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/search/route.ts
git commit -m "feat: API Route GET /api/search — busca global com tenant scoping"
```

---

### Task 3: SearchContext para comunicação Sidebar ↔ Palette

**Files:**
- Create: `src/components/layout/search-context.tsx`

- [ ] **Step 1: Criar contexto**

```typescript
"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SearchContextValue {
  open: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  setOpen: (open: boolean) => void;
}

const SearchContext = createContext<SearchContextValue>({
  open: false,
  openSearch: () => {},
  closeSearch: () => {},
  setOpen: () => {},
});

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openSearch = useCallback(() => setOpen(true), []);
  const closeSearch = useCallback(() => setOpen(false), []);

  return (
    <SearchContext.Provider value={{ open, openSearch, closeSearch, setOpen }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  return useContext(SearchContext);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/search-context.tsx
git commit -m "feat: SearchContext para comunicação sidebar ↔ command palette"
```

---

### Task 4: Componente CommandPalette

**Files:**
- Create: `src/components/layout/command-palette.tsx`

- [ ] **Step 1: Criar componente**

```typescript
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSearch } from "@/components/layout/search-context";
import {
  Search,
  Loader2,
  Building2,
  Route,
  FileText,
  User,
} from "lucide-react";

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  type: "company" | "route" | "log" | "user";
  meta?: string;
}

interface SearchResponse {
  companies: SearchItem[];
  routes: SearchItem[];
  logs: SearchItem[];
  users: SearchItem[];
}

const ICON_MAP = {
  company: Building2,
  route: Route,
  log: FileText,
  user: User,
} as const;

const GROUP_LABELS = {
  companies: "Empresas",
  routes: "Rotas",
  logs: "Logs",
  users: "Usuários",
} as const;

export function CommandPalette() {
  const router = useRouter();
  const { open, setOpen, closeSearch } = useSearch();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup do debounce e abort no unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Atalho global ⌘K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  // Busca com debounce + abort
  const search = useCallback((term: string) => {
    // Limpa debounce anterior
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Menos de 2 chars — limpa resultados
    if (term.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    debounceRef.current = setTimeout(async () => {
      // Cancela request anterior
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(term.trim())}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          setResults(null);
          setLoading(false);
          return;
        }
        const data: SearchResponse = await res.json();
        setResults(data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    search(value);
  }

  function handleSelect(href: string) {
    closeSearch();
    setQuery("");
    setResults(null);
    router.push(href);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery("");
      setResults(null);
      setLoading(false);
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }

  const hasResults = results && (
    results.companies.length > 0 ||
    results.routes.length > 0 ||
    results.logs.length > 0 ||
    results.users.length > 0
  );

  const totalResults = results
    ? results.companies.length + results.routes.length + results.logs.length + results.users.length
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="fixed top-[15%] left-1/2 -translate-x-1/2 translate-y-0 max-w-lg w-[calc(100%-2rem)] p-0 gap-0 sm:top-[20%]"
      >
        <Command
          className="rounded-2xl overflow-hidden"
          shouldFilter={false}
          loop
        >
              {/* Input */}
              <div className="flex items-center gap-3 px-4 border-b border-border">
                {loading ? (
                  <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
                ) : (
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <Command.Input
                  value={query}
                  onValueChange={handleQueryChange}
                  placeholder="Buscar empresas, rotas, logs..."
                  className="flex-1 bg-transparent py-4 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                {query.length > 0 && (
                  <kbd className="text-[10px] text-muted-foreground bg-muted/50 border border-border rounded px-1.5 py-0.5 font-mono">
                    ESC
                  </kbd>
                )}
              </div>

              {/* Resultados */}
              <Command.List className="max-h-[360px] overflow-y-auto overscroll-contain">
                {/* Estado vazio: sem query */}
                {query.trim().length < 2 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Digite para buscar...
                  </div>
                )}

                {/* Estado: sem resultados */}
                {query.trim().length >= 2 && !loading && results && !hasResults && (
                  <Command.Empty className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum resultado para &ldquo;{query}&rdquo;
                  </Command.Empty>
                )}

                {/* Grupos de resultados */}
                {results && hasResults && (
                  <>
                    {(["companies", "routes", "logs", "users"] as const).map((group) => {
                      const items = results[group];
                      if (items.length === 0) return null;

                      return (
                        <Command.Group
                          key={group}
                          heading={
                            <span className="text-xs font-medium text-muted-foreground px-4 py-2 block">
                              {GROUP_LABELS[group]} ({items.length})
                            </span>
                          }
                        >
                          {items.map((item) => {
                            const Icon = ICON_MAP[item.type];
                            return (
                              <Command.Item
                                key={`${item.type}-${item.id}`}
                                value={`${item.type}-${item.id}`}
                                onSelect={() => handleSelect(item.href)}
                                className="flex items-center gap-3 px-4 py-3 cursor-pointer text-sm transition-none data-[selected=true]:bg-accent/50 hover:bg-accent/50"
                              >
                                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-foreground truncate">{item.title}</p>
                                  <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                                </div>
                                {item.meta && (
                                  <span className="text-xs text-muted-foreground bg-muted/50 border border-border rounded px-2 py-0.5 shrink-0">
                                    {item.meta}
                                  </span>
                                )}
                              </Command.Item>
                            );
                          })}
                        </Command.Group>
                      );
                    })}
                  </>
                )}
              </Command.List>

              {/* Footer com contagem */}
              {results && hasResults && (
                <div className="border-t border-border px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{totalResults} resultado{totalResults !== 1 ? "s" : ""}</span>
                  <span>
                    <kbd className="bg-muted/50 border border-border rounded px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>
                    {" "}navegar{" "}
                    <kbd className="bg-muted/50 border border-border rounded px-1 py-0.5 font-mono text-[10px]">↵</kbd>
                    {" "}abrir
                  </span>
                </div>
              )}
        </Command>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/command-palette.tsx
git commit -m "feat: componente CommandPalette — cmdk + dialog + debounce + abort"
```

---

### Task 5: Integrar no layout protegido

**Files:**
- Modify: `src/app/(protected)/layout.tsx`

- [ ] **Step 1: Adicionar SearchProvider e CommandPalette ao layout**

Modificar `src/app/(protected)/layout.tsx`:

Adicionar imports no topo:
```typescript
import { SearchProvider } from '@/components/layout/search-context';
import { CommandPalette } from '@/components/layout/command-palette';
```

Envolver o conteúdo com `SearchProvider` e adicionar `CommandPalette`. O return fica:
```tsx
return (
  <SearchProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      <ThemeInitializer theme={(session.user as any)?.theme ?? null} />
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-8 sm:pb-8 lg:px-8">
          {children}
        </div>
      </main>
      <CommandPalette />
    </div>
  </SearchProvider>
);
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(protected)/layout.tsx
git commit -m "feat: integra SearchProvider + CommandPalette no layout protegido"
```

---

### Task 6: Botão de busca na Sidebar

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Adicionar import e botão de busca**

Adicionar import no topo de `sidebar.tsx`:
```typescript
import { Search } from 'lucide-react';
import { useSearch } from '@/components/layout/search-context';
```

Dentro do componente `Sidebar`, antes do `sidebarContent`:
```typescript
const { openSearch } = useSearch();
```

No `sidebarContent`, entre o bloco `{/* Logo */}` e `{/* Menu */}`, adicionar:
```tsx
{/* Busca */}
<div className="px-3 pb-2">
  <button
    onClick={() => {
      openSearch();
      setMobileOpen(false);
    }}
    className="flex w-full items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:bg-muted/50 hover:text-foreground cursor-pointer"
  >
    <Search className="h-4 w-4" />
    <span className="flex-1 text-left">Buscar</span>
    <kbd className="hidden text-[10px] font-mono text-muted-foreground/70 bg-background border border-border rounded px-1.5 py-0.5 sm:inline-block">
      ⌘K
    </kbd>
  </button>
</div>
```

Note: `setMobileOpen(false)` fecha a sidebar mobile ao abrir a busca.

- [ ] **Step 2: Testar visualmente**

```
1. Abrir o app no browser
2. Verificar que o botão "Buscar" aparece na sidebar entre logo e menu
3. Clicar no botão — command palette deve abrir
4. Pressionar ⌘K — command palette deve abrir/fechar
5. Digitar algo com 2+ caracteres — deve carregar resultados
6. Clicar em um resultado — deve navegar e fechar a palette
7. Testar no mobile: abrir sidebar, clicar buscar, sidebar fecha e palette abre
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: botão Buscar na sidebar com badge ⌘K"
```

---

### Task 7: Deep-link para tabs de empresa

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/company-tabs.tsx`
- Modify: `src/app/(protected)/companies/[id]/page.tsx`

- [ ] **Step 1: Adicionar prop defaultTab em CompanyTabs**

Em `company-tabs.tsx`, adicionar `defaultTab` à interface:
```typescript
interface CompanyTabsProps {
  company: {
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    isActive: boolean;
    createdAt: Date;
    credential: { id: string } | null;
    _count: {
      memberships: number;
      routes: number;
    };
  };
  canEdit?: boolean;
  canManageRoutes?: boolean;
  canDelete?: boolean;
  currentUserId?: string;
  currentUserIsSuperAdmin?: boolean;
  defaultTab?: string;
}
```

Atualizar a assinatura da função e o componente Tabs:
```typescript
export function CompanyTabs({ company, canEdit = true, canManageRoutes = true, canDelete = false, currentUserId, currentUserIsSuperAdmin = false, defaultTab = "overview" }: CompanyTabsProps) {
  const validTabs = ["overview", "credentials", "routes", "logs", "members"];
  const tab = validTabs.includes(defaultTab) ? defaultTab : "overview";

  return (
    <Tabs defaultValue={tab} className="space-y-6">
```

O resto do componente permanece igual.

- [ ] **Step 2: Passar searchParams no page.tsx**

Em `src/app/(protected)/companies/[id]/page.tsx`, atualizar a interface e passar a prop:

Alterar a interface:
```typescript
interface CompanyPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}
```

Atualizar a assinatura da função:
```typescript
export default async function CompanyPage({ params, searchParams }: CompanyPageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
```

Na linha do `<CompanyTabs>`, adicionar a prop `defaultTab`:
```tsx
<CompanyTabs company={company} canEdit={canEdit} canManageRoutes={canManageRoutes} canDelete={canDelete} currentUserId={userId} currentUserIsSuperAdmin={isSuperAdmin} defaultTab={tab} />
```

- [ ] **Step 3: Testar deep-link**

```
1. Abrir /companies/{id}?tab=routes — deve abrir na aba "Rotas de Webhook"
2. Abrir /companies/{id}?tab=logs — deve abrir na aba "Logs"
3. Abrir /companies/{id}?tab=invalid — deve abrir na aba "Visão Geral" (fallback)
4. Abrir /companies/{id} — deve abrir na aba "Visão Geral" (padrão)
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(protected)/companies/[id]/_components/company-tabs.tsx src/app/(protected)/companies/[id]/page.tsx
git commit -m "feat: deep-link tabs via ?tab= query param em CompanyTabs"
```

---

### Task 8: Teste integrado completo

**Files:**
- Nenhum arquivo novo

- [ ] **Step 1: Teste completo end-to-end**

```
Checklist de teste manual:

ACESSO:
□ ⌘K (Mac) / Ctrl+K abre a palette
□ ⌘K novamente fecha a palette
□ Botão "Buscar" na sidebar abre a palette
□ Escape fecha a palette
□ Clique fora fecha a palette

BUSCA:
□ 1 caractere — não busca, mostra "Digite para buscar..."
□ 2+ caracteres — busca após 300ms
□ Spinner aparece durante loading
□ Digitar rápido — apenas a última busca retorna (sem flickering)
□ Resultados agrupados por tipo com contagem
□ Grupos vazios são ocultos

NAVEGAÇÃO:
□ Setas ↑↓ movem seleção entre itens
□ Enter navega para o item selecionado
□ Click navega para o item selecionado
□ Modal fecha após navegação
□ Empresa: navega para /companies/{id}
□ Rota: navega para /companies/{id}?tab=routes (aba abre)
□ Log: navega para /companies/{id}?tab=logs (aba abre)
□ Usuário: navega para /users

PERMISSÕES:
□ Super admin: vê empresas, rotas, logs, usuários
□ Admin: vê empresas/rotas/logs com membership + todos usuários
□ Manager: vê empresas/rotas/logs com membership, SEM usuários
□ Viewer: vê empresas/rotas/logs com membership, SEM usuários

RESPONSIVIDADE:
□ Desktop: modal centralizado, max-w-lg
□ Mobile: sidebar fecha ao abrir palette
□ Mobile: modal ajusta largura

UI:
□ Tema dark: cores corretas
□ Tema light: cores corretas
□ Footer com contagem e dicas de teclado
□ Badge ⌘K visível na sidebar (desktop)
□ Badge ESC visível no input quando há texto
```

- [ ] **Step 2: Commit final com atualização do CLAUDE.md**

Adicionar na seção "Status" do CLAUDE.md, após a linha da Fase 3E:
```
- **Busca Global:** CONCLUÍDA — command palette ⌘K, 4 entidades, deep-link tabs
```

Adicionar na seção "Próximo Passo", remover "Busca global" da lista.

```bash
git add CLAUDE.md
git commit -m "docs: marca busca global como concluída no CLAUDE.md"
```
