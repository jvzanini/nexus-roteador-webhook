# Busca Global — Design Spec

**Data:** 2026-04-09
**Feature:** Command palette de busca unificada
**Escopo:** Empresas, Rotas, Logs, Usuários

---

## 1. Visão Geral

Command palette acessível de qualquer página protegida, permitindo buscar e navegar rapidamente entre empresas, rotas de webhook, logs e usuários. Inspirado no padrão `Cmd+K` moderno.

**Dois pontos de acesso:**
- Atalho de teclado: `⌘K` (Mac) / `Ctrl+K` (Windows/Linux)
- Botão de busca na sidebar (ícone Search), com tooltip mostrando o atalho

---

## 2. Decisões de Design

### 2.1. Abordagem: Command Palette customizado (sem cmdk)

Construir o componente do zero usando os primitivos existentes do projeto (`Dialog` base-ui, `Input`, `ScrollArea`). Motivos:
- Evita nova dependência
- Controle total sobre o estilo e comportamento
- O projeto já tem um Dialog maduro com animações e overlay
- A complexidade é gerenciável (filtro de texto, agrupamento, navegação por teclado)

### 2.2. Busca: Server Action única

Uma Server Action `globalSearch(query)` em `src/lib/actions/search.ts` que:
- Recebe o termo de busca (string, mínimo 2 caracteres)
- Consulta as 4 entidades em paralelo (`Promise.all`)
- Retorna resultados agrupados por tipo, limitados (max 5 por tipo)
- Respeita permissões do usuário autenticado (tenant scoping)

### 2.3. Busca server-side (não client-side)

Motivo: logs podem ser milhões de registros, e mesmo empresas/rotas crescem. Buscar no servidor garante que:
- Não carregamos dados desnecessários no client
- A filtragem por permissão acontece no servidor
- O banco faz o trabalho pesado com `ILIKE` / índices

### 2.4. Debounce de 300ms no client

O input dispara a Server Action com debounce de 300ms para evitar chamadas excessivas enquanto o usuário digita.

---

## 3. Entidades e Campos Buscáveis

| Entidade | Campos buscáveis | Resultado exibido | Navegação |
|----------|------------------|-------------------|-----------|
| **Empresa** | `name`, `slug` | Nome + slug | `/companies/{id}` |
| **Rota** | `name`, `url` | Nome + URL (truncada) + empresa | `/companies/{companyId}?tab=routes` |
| **Log** | `eventType`, `dedupeKey` | Tipo de evento + status + data | `/companies/{companyId}?tab=logs` |
| **Usuário** | `name`, `email` | Nome + email + role | `/users` (com filtro) |

---

## 4. Controle de Acesso

A busca respeita a mesma hierarquia existente:

| Role | Empresas | Rotas | Logs | Usuários |
|------|----------|-------|------|----------|
| **Super Admin** | Todas | Todas | Todos | Todos |
| **Admin** | Com membership | Com membership | Com membership | Todos (via /users) |
| **Manager** | Com membership | Com membership | Com membership | Não busca |
| **Viewer** | Com membership | Com membership | Com membership | Não busca |

- Empresas/Rotas/Logs: filtrados por `UserCompanyMembership` ativa (exceto super admin)
- Usuários: apenas `super_admin` e `admin` veem resultados de usuários

---

## 5. Arquitetura de Componentes

```
src/
├── lib/actions/
│   └── search.ts                    # Server Action globalSearch()
├── components/layout/
│   ├── command-palette.tsx           # Componente principal (modal)
│   └── sidebar.tsx                   # Adicionar botão de busca
└── app/(protected)/
    └── layout.tsx                    # Montar CommandPalette no layout
```

### 5.1. `CommandPalette` (client component)

**Estado:**
- `open: boolean` — controla visibilidade do modal
- `query: string` — texto digitado
- `results: SearchResults` — resultados agrupados
- `loading: boolean` — indicador de carregamento
- `activeIndex: number` — item selecionado por teclado

**Comportamento:**
- Abre com `⌘K` / `Ctrl+K` (listener global `keydown`)
- Abre com clique no botão da sidebar (via callback prop)
- Input com autofocus, placeholder "Buscar empresas, rotas, logs..."
- Debounce de 300ms antes de chamar `globalSearch()`
- Resultados agrupados por seções com headers (Empresas, Rotas, Logs, Usuários)
- Navegação por setas ↑↓, Enter para navegar, Escape para fechar
- Estado vazio (sem query): mensagem "Digite para buscar..."
- Sem resultados: mensagem "Nenhum resultado encontrado"
- Loading: spinner inline no input

### 5.2. `globalSearch()` Server Action

```typescript
interface SearchResults {
  companies: SearchItem[];
  routes: SearchItem[];
  logs: SearchItem[];
  users: SearchItem[];
}

interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  icon: string; // nome do ícone Lucide
  meta?: string; // info adicional (badge de status, data, etc.)
}
```

**Lógica:**
1. Autenticar com `getCurrentUser()`
2. Sanitizar query (trim, lowercase)
3. Montar filtro de empresas acessíveis (membership scoping)
4. Executar 4 queries em paralelo com `Promise.all`:
   - Empresas: `WHERE (name ILIKE '%query%' OR slug ILIKE '%query%') AND scoping`
   - Rotas: `WHERE (name ILIKE '%query%' OR url ILIKE '%query%') AND company IN scoped`
   - Logs (InboundWebhook): `WHERE (eventType ILIKE '%query%' OR dedupeKey ILIKE '%query%') AND company IN scoped`
   - Usuários (se admin+): `WHERE (name ILIKE '%query%' OR email ILIKE '%query%')`
5. Limitar 5 resultados por tipo
6. Mapear para `SearchItem[]` com href correto

**Prisma queries usam `contains` com `mode: 'insensitive'`** (equivalente a ILIKE).

---

## 6. UI / Layout

### 6.1. Botão na Sidebar

Posicionado entre o logo e a navegação:
- Ícone `Search` (Lucide) + texto "Buscar" + badge `⌘K`
- Estilo: similar aos nav items mas com fundo sutil diferenciado
- Ao clicar, abre o command palette

### 6.2. Modal Command Palette

- Usa `Dialog` existente do projeto (base-ui) com customizações:
  - Posição: topo da tela (não centralizado), `top-[20%]` em vez de `top-1/2`
  - Largura: `max-w-lg` (512px)
  - Sem botão de fechar (fecha com Escape ou clique fora)
  - Sem padding padrão do DialogContent (layout customizado)
- Input no topo com ícone Search, borda inferior como separador
- Área de resultados com scroll (max-height ~400px)
- Cada grupo tem header cinza com nome da seção e contagem
- Cada item: ícone + título + subtitle, hover com background

### 6.3. Item de resultado

```
[ícone] Título                    [meta/badge]
        Subtítulo em cinza
```

- Empresa: `Building2` + nome + slug como subtitle
- Rota: ícone da rota (ou `Route`) + nome + URL truncada como subtitle
- Log: `FileText` + eventType + status badge + data
- Usuário: `User` + nome + email como subtitle + role badge

### 6.4. Animações

- Modal: fade-in + slide-down sutil (reutiliza animações do Dialog)
- Resultados: fade-in rápido quando chegam
- Item ativo (teclado): background highlight instantâneo (sem transição lenta)

---

## 7. Performance

- **Debounce 300ms**: evita queries a cada keystroke
- **Mínimo 2 caracteres**: não busca com 1 char (resultados demais)
- **Limit 5 por tipo**: máximo 20 resultados totais
- **Promise.all**: queries paralelas, tempo total = query mais lenta
- **Sem cache client-side**: resultados sempre frescos (dados mudam frequentemente)
- **Índices existentes**: empresas e rotas já têm índices adequados. Logs usam índice `(companyId, createdAt)` — a busca por `eventType` pode ser mais lenta em volumes grandes, mas aceitável com limit 5

---

## 8. Responsividade

- **Desktop**: modal centralizado com `max-w-lg`
- **Tablet**: igual desktop, modal com `max-w-[calc(100%-2rem)]`
- **Mobile**: modal quase fullscreen, input maior para touch, botão de busca na sidebar mobile também funciona
- Atalho `⌘K` funciona em todos os tamanhos (mas mobile depende de teclado físico — por isso o botão na sidebar é essencial)

---

## 9. Fluxo do Usuário

1. Usuário pressiona `⌘K` ou clica no botão "Buscar" na sidebar
2. Modal abre com input focado
3. Digita "acme" → debounce 300ms → Server Action executa
4. Resultados aparecem agrupados: "Empresas (1)", "Rotas (2)"
5. Usa setas ↑↓ para navegar entre resultados
6. Pressiona Enter → navega para a página do item selecionado
7. Modal fecha automaticamente após navegação

---

## 10. Escopo Excluído (YAGNI)

- **Histórico de buscas recentes**: não implementar agora
- **Ações na palette** (criar empresa, etc.): apenas busca/navegação
- **Busca fuzzy**: usar `contains` simples, sem fuzzy matching
- **Filtros por tipo na palette**: busca tudo de uma vez, sem toggles
- **Cache de resultados**: dados mudam frequentemente, sempre buscar fresco
- **Busca em credenciais/notificações**: fora do escopo conforme decisão
