# Busca Global — Design Spec v2

**Data:** 2026-04-09
**Feature:** Command palette de busca unificada
**Escopo:** Empresas, Rotas, Logs, Usuários

---

## 1. Visão Geral

Command palette acessível de qualquer página protegida, permitindo buscar e navegar rapidamente entre empresas, rotas de webhook, logs e usuários. Padrão `Cmd+K` moderno.

**Dois pontos de acesso:**
- Atalho de teclado: `⌘K` (Mac) / `Ctrl+K` (Windows/Linux)
- Botão de busca na sidebar (ícone Search), com tooltip mostrando o atalho

---

## 2. Decisões de Design

### 2.1. Biblioteca: cmdk

Usar a lib `cmdk` (~3KB gzip) para o command menu. Motivos:
- Navegação por teclado (↑↓, Enter, Escape) built-in
- Agrupamento de resultados (`Command.Group`)
- Acessibilidade completa (ARIA roles, focus management, screen reader)
- Filtro client-side opcional (desabilitamos pois o filtro é server-side)
- Amplamente adotado (Vercel, Linear, Raycast)

O modal usa o `Dialog` base-ui existente como wrapper. O `cmdk` cuida apenas da lista de comandos dentro dele.

### 2.2. API Route para busca

Usar API Route `GET /api/search?q=termo` em vez de Server Action. Motivos:
- Server Actions são para mutations, não leituras
- API Route permite `AbortController` no client para cancelar requests em voo
- Semântica REST correta (GET para consulta)
- Facilita debug no browser (Network tab)

### 2.3. Busca server-side com Prisma

Todas as queries rodam no servidor. O client envia apenas o termo, o server:
- Autentica via session
- Aplica tenant scoping (membership)
- Executa 4 queries em paralelo
- Retorna resultados já formatados

### 2.4. Debounce 300ms + AbortController

- Debounce de 300ms no client antes de disparar a request
- `AbortController` cancela a request anterior se o usuário continua digitando
- Garante que resultados nunca chegam fora de ordem (race condition eliminada)

---

## 3. Entidades e Campos Buscáveis

| Entidade | Campos buscáveis | Resultado exibido | Navegação |
|----------|------------------|-------------------|-----------|
| **Empresa** | `name`, `slug` | Nome + slug | `/companies/{id}` |
| **Rota** | `name`, `url` | Nome + URL truncada + nome da empresa | `/companies/{companyId}?tab=routes` |
| **Log** | `eventType` | Tipo de evento + status + data relativa | `/companies/{companyId}?tab=logs` |
| **Usuário** | `name`, `email` | Nome + email + role label | `/users` |

**Mudanças vs v1:**
- Logs: removido `dedupeKey` (campo técnico, sem valor para busca do usuário)
- Logs: usa `startsWith` em vez de `contains` para `eventType` (aproveita índice `(eventType, createdAt)`)
- Rotas: resultado mostra nome da empresa dona para contexto
- Usuário: link direto para `/users` (a página já tem lista com filtro visual)

---

## 4. Controle de Acesso

A busca respeita a mesma hierarquia existente:

| Role | Empresas | Rotas | Logs | Usuários |
|------|----------|-------|------|----------|
| **Super Admin** | Todas | Todas | Todos | Todos |
| **Admin** | Com membership | Com membership | Com membership | Todos |
| **Manager** | Com membership | Com membership | Com membership | Não busca |
| **Viewer** | Com membership | Com membership | Com membership | Não busca |

- Empresas/Rotas/Logs: filtrados por `UserCompanyMembership` ativa (exceto super admin)
- Usuários: apenas `super_admin` e `admin` veem resultados de usuários
- A query de scoping é feita uma vez e reutilizada nas 4 buscas

---

## 5. Arquitetura

### 5.1. Novos arquivos

```
src/
├── app/api/search/
│   └── route.ts              # GET /api/search?q=termo
├── components/layout/
│   └── command-palette.tsx    # Componente principal (client)
```

### 5.2. Arquivos modificados

```
src/
├── components/layout/
│   └── sidebar.tsx            # Adicionar botão "Buscar" + callback
├── app/(protected)/
│   └── layout.tsx             # Montar CommandPalette
└── app/(protected)/companies/[id]/_components/
    └── company-tabs.tsx       # Suporte a ?tab= via query param
```

### 5.3. Dependência nova

```
cmdk (^1.0.0)
```

---

## 6. API Route — `GET /api/search`

### Request
```
GET /api/search?q=acme
```

### Response
```typescript
interface SearchResponse {
  companies: SearchItem[];
  routes: SearchItem[];
  logs: SearchItem[];
  users: SearchItem[];
}

interface SearchItem {
  id: string;
  title: string;       // nome principal
  subtitle: string;    // info secundária
  href: string;        // URL de navegação
  type: 'company' | 'route' | 'log' | 'user';
  meta?: string;       // badge extra (status, role, data)
}
```

O campo `type` permite ao client determinar o ícone correto sem receber nomes de ícones do server:
- `company` → `Building2`
- `route` → `Route`
- `log` → `FileText`
- `user` → `User`

### Lógica

1. Extrair session via `auth()`
2. Validar: query deve ter >= 2 caracteres, retorna 400 se não
3. Sanitizar query: `trim()`
4. Montar lista de `companyIds` acessíveis (membership scoping):
   - Super admin: sem filtro
   - Demais: `SELECT companyId FROM UserCompanyMembership WHERE userId = ? AND isActive = true`
5. Executar queries em paralelo (`Promise.all`):
   - **Empresas**: `name contains query OR slug contains query` (mode insensitive), limit 5
   - **Rotas**: `name contains query OR url contains query` (mode insensitive), filtro por companyIds, include company.name, limit 5
   - **Logs** (InboundWebhook): `eventType startsWith query` (mode insensitive), filtro por companyIds, orderBy receivedAt desc, limit 5
   - **Usuários** (se role permite): `name contains query OR email contains query` (mode insensitive), limit 5
6. Mapear resultados para `SearchItem[]`
7. Retornar JSON

### Performance

- `contains` (ILIKE '%x%'): usado em empresas, rotas e usuários — volume pequeno, sem problema
- `startsWith` (ILIKE 'x%'): usado em logs — aproveita índice `(eventType, createdAt)`, performante mesmo com milhões de registros
- `Promise.all`: tempo total = query mais lenta
- Limit 5 por tipo: máximo 20 resultados totais

---

## 7. Componente `CommandPalette`

### Props
```typescript
interface CommandPaletteProps {
  // Nenhuma prop necessária — usa listener global de teclado
  // Exposto via ref ou contexto para o botão da sidebar acionar
}
```

### Estado interno
- `open: boolean` — visibilidade do modal
- `query: string` — texto digitado
- `results: SearchResponse | null` — resultados da API
- `loading: boolean` — indicador de carregamento

### Comportamento

**Abertura:**
- `⌘K` / `Ctrl+K`: listener global `keydown`, previne comportamento padrão do browser
- Botão na sidebar: callback via contexto React (`SearchContext`) compartilhado no layout
- Mobile: ao abrir a palette, fechar a sidebar mobile se estiver aberta

**Busca:**
- Input controlado com `onChange`
- Debounce 300ms via `setTimeout` + cleanup
- Ao disparar fetch, aborta request anterior via `AbortController`
- Mínimo 2 caracteres para buscar
- Loading: ícone `Loader2` com animação `spin` no lugar do ícone Search no input

**Resultados:**
- Agrupados via `Command.Group` do cmdk (Empresas, Rotas, Logs, Usuários)
- Header de cada grupo: nome da seção + contagem entre parênteses
- Grupos vazios são ocultados
- Navegação ↑↓ gerenciada automaticamente pelo cmdk

**Navegação:**
- Click ou Enter no item: `router.push(href)`, fecha o modal
- Escape: fecha o modal, limpa a query

**Estados:**
- Sem query: texto "Digite para buscar..." centralizado
- Loading: spinner inline no input
- Sem resultados: "Nenhum resultado para '{query}'"
- Com resultados: lista agrupada

---

## 8. UI / Layout

### 8.1. Botão na Sidebar

Posicionado entre o logo e a nav (com separador visual `border-b`):

```
[Search icon] Buscar                    ⌘K
```

- Estilo: fundo `bg-muted/30`, borda `border-border`, rounded
- Texto `Buscar` à esquerda, badge `⌘K` à direita em `text-xs text-muted-foreground`
- Hover: `bg-muted/50`
- Aparece tanto no desktop quanto no mobile sidebar

### 8.2. Modal

- Wrapper: `Dialog` base-ui com overlay `bg-black/60 backdrop-blur-sm`
- Posição: `top-[15%]` (não centralizado verticalmente — padrão command palette)
- Largura: `max-w-lg` (512px), mobile: `max-w-[calc(100%-2rem)]`
- Sem botão X (fecha com Escape ou clique fora)
- `showCloseButton={false}` no DialogContent
- Padding: zero no DialogContent (layout interno customizado)
- Animação: reutiliza fade-in + zoom do Dialog existente

### 8.3. Layout interno do modal

```
┌─────────────────────────────────────┐
│ [🔍] Buscar empresas, rotas, logs..│  ← input com ícone
├─────────────────────────────────────┤
│ Empresas (2)                        │  ← Command.Group heading
│ ┌─────────────────────────────────┐ │
│ │ [Building2] Acme Corp           │ │  ← Command.Item (hover/active)
│ │              acme-corp          │ │
│ ├─────────────────────────────────┤ │
│ │ [Building2] Acme Labs           │ │
│ │              acme-labs          │ │
│ └─────────────────────────────────┘ │
│ Rotas (1)                           │
│ ┌─────────────────────────────────┐ │
│ │ [Route] Webhook Principal       │ │
│ │          https://api.acm... Acme│ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

- Input: padding generoso, ícone Search à esquerda, borda inferior como separador
- Área de resultados: `max-h-[360px]` com overflow scroll
- Item: padding `px-4 py-3`, dois blocos de texto (título + subtitle)
- Item ativo (teclado/hover): `bg-accent/50` sem transição (instantâneo)
- Meta badge (quando presente): alinhado à direita, `text-xs`

### 8.4. Ícones por tipo de resultado

Determinados no client pelo campo `type`:
- `company` → `Building2`
- `route` → `Route`
- `log` → `FileText`
- `user` → `User`

Ícone em `text-muted-foreground`, `h-4 w-4`.

---

## 9. Deep-link para tabs de empresa

**Mudança necessária** em `company-tabs.tsx`: aceitar prop `defaultTab` controlada por query param.

No `page.tsx` da empresa:
- Ler `searchParams.tab` 
- Passar como `defaultTab` para `CompanyTabs`
- Valores válidos: `overview`, `credentials`, `routes`, `logs`, `members`
- Fallback: `overview`

Isso permite que a busca global leve direto para `/companies/{id}?tab=routes` e a aba correta já abra.

---

## 10. Contexto React para comunicação Sidebar ↔ Palette

Um `SearchProvider` simples no layout protegido:

```typescript
const SearchContext = createContext<{
  openSearch: () => void;
}>({ openSearch: () => {} });
```

- `CommandPalette` registra `openSearch` via contexto
- `Sidebar` consome o contexto e chama `openSearch()` no clique do botão
- Sem prop drilling, sem estado no layout

---

## 11. Responsividade

- **Desktop (≥1024px)**: modal `max-w-lg`, centralizado horizontalmente, `top-[15%]`
- **Tablet (768-1023px)**: igual desktop
- **Mobile (<768px)**: modal `max-w-[calc(100%-2rem)]`, `top-[10%]`, ao abrir palette fecha sidebar mobile
- Atalho `⌘K` funciona em desktop/tablet; no mobile o botão na sidebar é o acesso principal

---

## 12. Fluxo do Usuário

1. Pressiona `⌘K` ou clica "Buscar" na sidebar
2. Modal abre com input focado
3. Digita "acme" → espera 300ms → request para `GET /api/search?q=acme`
4. Resultados aparecem agrupados: "Empresas (1)", "Rotas (2)"
5. Navega com ↑↓, seleciona com Enter
6. Navega para `/companies/abc123`, modal fecha
7. (Se resultado era uma rota): navega para `/companies/abc123?tab=routes`, aba já abre

---

## 13. Escopo Excluído (YAGNI)

- Histórico de buscas recentes
- Ações na palette (criar empresa, logout, etc.)
- Busca fuzzy (contains simples é suficiente)
- Filtros por tipo na palette (toggles empresa/rota/etc.)
- Cache de resultados no client
- Busca em credenciais ou notificações
- Busca full-text (pg_trgm, tsvector) — contains/startsWith é suficiente para o volume atual
