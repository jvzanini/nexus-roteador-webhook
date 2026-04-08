# Pattern: Dashboard

## Resumo

Painel com stats cards, gráficos temporais, filtros de período e tabelas de dados. Combina Server Actions (busca e agregação de dados no backend) com componentes client-side reativos (polling, SSE real-time, Framer Motion). O padrão separa claramente a camada de dados (action com queries Prisma) da camada de apresentação (componentes que recebem dados via props).

## Quando usar

Qualquer plataforma que precisa visualizar métricas e KPIs em tempo real. Exemplos: painel de operações, monitoramento de integrações, análise de vendas, acompanhamento de suporte, gestão de infraestrutura. O padrão é especialmente útil quando se precisa de comparação temporal (período atual versus período anterior) e atualização automática dos dados.

## Arquitetura

O fluxo de dados segue esta cadeia:

1. **Page (Server Component)** — `page.tsx` busca a sessão do usuário via `auth()` e renderiza o componente principal `DashboardContent`, passando `userName` e `isSuperAdmin` como props.

2. **DashboardContent (Client Component)** — Componente orquestrador que gerencia todo o estado do dashboard: filtros (empresa, período, página), polling (60 segundos), SSE real-time via `useRealtime` hook, e delegação de dados para subcomponentes.

3. **Server Action `getDashboardData`** — Chamada pelo client component. Recebe `companyId`, `period` e `page`. Internamente:
   - Autentica o usuário via `getCurrentUser()`
   - Aplica tenant scoping via `getAccessibleCompanyIds()` e `buildTenantFilter()`
   - Se `companyId` fornecido, valida acesso via `assertCompanyAccess()`
   - Executa 4 queries em paralelo via `Promise.all`: stats, chart, topErrors, recentDeliveries
   - Busca lista de empresas acessíveis para o dropdown de filtro
   - Retorna tudo empacotado em `ActionResult<DashboardData>`

4. **Queries Prisma** — Cada helper function faz queries específicas ao domínio:
   - `getStats()` — 6 queries `count` em paralelo (período atual + anterior) para calcular KPIs e comparações percentuais
   - `getChart()` — `findMany` com bucketização manual em memória (hora ou dia)
   - `getTopErrors()` — `findMany` em `DeliveryAttempt` com agrupamento manual por errorMessage + routeId
   - `getRecentDeliveries()` — `findMany` paginado com `skip/take` + `count` para total de páginas

5. **Componentes de apresentação** — Recebem dados via props e renderizam:
   - `StatsCards` recebe `DashboardStats`
   - `WebhookChart` recebe `ChartPoint[]` e `period`
   - `TopErrors` recebe `TopError[]`
   - `RecentDeliveries` recebe `RecentDeliveryItem[]` + paginação
   - `DashboardFilters` recebe lista de empresas, estado dos filtros e callbacks

6. **Atualização em tempo real** — Dois mecanismos complementares:
   - Polling silencioso a cada 60 segundos (sem skeleton)
   - SSE via `useRealtime` hook que escuta eventos `delivery:completed`, `delivery:failed`, `webhook:received` e dispara refetch com debounce de 2 segundos

## Componentes típicos

### Stats Cards (4 KPIs com comparação percentual)

Cada card exibe: ícone com cor contextual, valor numérico formatado, label descritivo, e badge de comparação com o período anterior (seta para cima/baixo + percentual). Suporta `invertTrend` para métricas onde aumento é negativo (exemplo: falhas).

A comparação é calculada no backend: `((atual - anterior) / anterior) * 100`. Retorna `null` quando o período anterior não tem dados, exibindo badge "Novo" no frontend.

### Gráfico temporal (Recharts LineChart)

LineChart com 3 linhas (Total, Concluídas, Falhas). Adapta granularidade conforme o período: hora para "hoje", dia para 7 e 30 dias. Gera série completa de buckets (sem gaps) mesmo quando não há dados. Inclui tooltip customizado e estado vazio ("Nenhuma entrega no período").

### Filtros

Três controles: dropdown de empresa (CustomSelect com opção "Todas as empresas"), grupo de botões de período (hoje/7d/30d) com highlight visual no selecionado, e botão de refresh manual com ícone animado durante loading.

### Tabela de itens recentes

Tabela paginada (20 itens por página) com colunas: quando (tempo relativo via date-fns), evento, empresa, rota, status (badge colorido), duração em ms, tentativas. Inclui badge "Reenvio" para entregas derivadas. Paginação anterior/próxima no rodapé.

### Tabela de top erros

Lista dos 5 erros mais frequentes no período, agrupados por mensagem de erro + rota. Cada item mostra mensagem truncada, nome da rota, empresa, tempo relativo da última ocorrência, e badge com contagem. Clicável — navega para a aba de logs da empresa/rota correspondente.

## Implementação no Nexus (referência)

### Camada de dados (Server Action)

- **`src/lib/actions/dashboard.ts`** — WEBHOOK-SPECIFIC. Contém todas as queries Prisma para o domínio de webhooks (InboundWebhook, RouteDelivery, DeliveryAttempt). Define os tipos `DashboardStats`, `ChartPoint`, `TopError`, `RecentDeliveryItem`, `DashboardData`. Inclui helpers de período (`getPeriodRange`, `getPreviousPeriodRange`, `computeComparison`) que são GENERIC e reutilizáveis. Também exporta `getCompanyOverviewData` para o mini-dashboard da aba Visão Geral da empresa.

### Camada de apresentação (Client Components)

- **`src/components/dashboard/dashboard-content.tsx`** — GENERIC. Layout orquestrador do dashboard. Gerencia estado (filtros, loading, erro), polling, SSE real-time, skeleton loading no primeiro carregamento, estado vazio (sem empresas), saudação com data por extenso. Padrão reutilizável: trocar a action e os subcomponentes de domínio.

- **`src/components/dashboard/stats-cards.tsx`** — GENERIC. Componente que recebe `DashboardStats` como props e renderiza 4 cards com ícone, valor, label, comparação percentual. Para adaptar, basta mudar o array `cards` com labels, ícones e cores diferentes. Suporta `invertTrend` para métricas inversas.

- **`src/components/dashboard/webhook-chart.tsx`** — GENERIC. Padrão de gráfico Recharts (LineChart com ResponsiveContainer, tooltip customizado, estado vazio). Para adaptar, trocar as séries de dados (dataKeys) e cores. A lógica de formatação de label por período é reutilizável.

- **`src/components/dashboard/dashboard-filters.tsx`** — GENERIC. Filtros de empresa (CustomSelect) e período (botões toggle) + botão refresh. Para adaptar, trocar as opções de filtro e callbacks.

- **`src/components/dashboard/recent-deliveries.tsx`** — WEBHOOK-SPECIFIC. Tabela paginada de entregas recentes com colunas específicas do domínio (evento, rota, status de delivery, duração, tentativas, badge de reenvio). Para um novo domínio, criar tabela equivalente com suas colunas.

- **`src/components/dashboard/top-errors.tsx`** — WEBHOOK-SPECIFIC. Lista de erros frequentes agrupados por mensagem + rota, com navegação para logs. Para um novo domínio, criar lista equivalente com seu agrupamento e navegação.

### Page (Server Component)

- **`src/app/(protected)/dashboard/page.tsx`** — GENERIC. Server component mínimo que busca sessão e renderiza o componente orquestrador. Padrão reutilizável em qualquer projeto Next.js com autenticação.

## Como adaptar

### Passo 1: Defina os KPIs do seu domínio

Identifique 4 métricas principais que importam para o seu negócio. Cada KPI precisa de: nome, query para o período atual, query para o período anterior (para comparação). Decida se alguma métrica tem tendência invertida (aumento é ruim).

### Passo 2: Crie a Server Action com suas queries Prisma

Copie a estrutura de `src/lib/actions/dashboard.ts`. Mantenha os helpers de período (`getPeriodRange`, `getPreviousPeriodRange`, `computeComparison`) intactos. Substitua as queries Prisma para seus models. Mantenha o padrão `Promise.all` para executar queries em paralelo. Mantenha a estrutura de retorno `ActionResult<DashboardData>` com tenant scoping.

### Passo 3: Reutilize o StatsCards (mude labels e valores)

O componente `StatsCards` recebe dados via props tipadas. Ajuste a interface `DashboardStats` para seus KPIs. No componente, mude o array `cards` com: `label` (nome do KPI), `icon` (ícone Lucide), `iconBg` e `iconColor` (cores de fundo e ícone), `invertTrend` (se aumento é negativo).

### Passo 4: Reutilize o padrão de gráfico (mude shape dos dados)

O componente `WebhookChart` aceita dados genéricos em formato de pontos temporais. Ajuste a interface `ChartPoint` para incluir suas séries (exemplo: `leads`, `conversions` em vez de `delivered`, `failed`). Mude as `Line` no JSX para refletir suas séries, com cores e labels adequados.

### Passo 5: Crie sua tabela de itens recentes

Substitua `RecentDeliveries` por um componente de tabela para seu domínio. Mantenha o padrão: Card com header, Table com colunas tipadas, paginação anterior/próxima no rodapé, estado vazio, e props `items`, `currentPage`, `totalPages`, `onPageChange`.

### Passo 6 (Opcional): Crie sua lista de top erros/issues

Se seu domínio tem conceito de erros ou issues frequentes, copie o padrão de `TopErrors`: agrupamento por chave composta, ordenação por contagem, limite de 5, navegação para detalhes.

### Passo 7: Monte o orquestrador

Copie `DashboardContent` e substitua: a action chamada, os subcomponentes renderizados, os eventos SSE escutados (se usar real-time). Mantenha o padrão de estado, polling, skeleton loading e estados vazios.

## Exemplo de adaptação

### CRM

- **KPIs:** Leads no mês, Taxa de conversão, Receita total, Ticket médio
- **Gráfico:** Leads por dia (linha) + Conversões por dia (linha)
- **Tabela recente:** Últimos leads (nome, origem, valor, estágio, responsável)
- **Top issues:** Leads parados há mais de 7 dias (agrupados por estágio)
- **Filtros:** Período + Equipe/Vendedor + Pipeline

### E-commerce

- **KPIs:** Pedidos, Receita, Ticket médio, Taxa de abandono de carrinho
- **Gráfico:** Pedidos por dia (linha) + Receita por dia (área)
- **Tabela recente:** Últimos pedidos (cliente, valor, status, pagamento)
- **Top issues:** Produtos mais devolvidos (agrupados por motivo)
- **Filtros:** Período + Loja/Canal + Categoria

### SaaS

- **KPIs:** Usuários ativos (DAU), MRR, Churn rate, NPS
- **Gráfico:** Signups por dia + Churns por dia
- **Tabela recente:** Últimos signups (email, plano, origem)
- **Top issues:** Features mais solicitadas no suporte

## Referência no Nexus

Todos os arquivos que compõem o pattern de Dashboard no projeto Nexus Roteador Webhook:

- `src/app/(protected)/dashboard/page.tsx` — Page (Server Component) com autenticação
- `src/components/dashboard/dashboard-content.tsx` — Orquestrador client-side (estado, polling, SSE, layout)
- `src/components/dashboard/stats-cards.tsx` — 4 cards de KPIs com comparação percentual
- `src/components/dashboard/webhook-chart.tsx` — Gráfico temporal Recharts (LineChart)
- `src/components/dashboard/dashboard-filters.tsx` — Filtros de empresa, período e refresh
- `src/components/dashboard/recent-deliveries.tsx` — Tabela paginada de entregas recentes
- `src/components/dashboard/top-errors.tsx` — Lista dos 5 erros mais frequentes
- `src/lib/actions/dashboard.ts` — Server Action com todas as queries e tipos
- `src/hooks/use-realtime.ts` — Hook de SSE para atualização em tempo real
- `src/components/ui/custom-select.tsx` — Select padronizado usado nos filtros
