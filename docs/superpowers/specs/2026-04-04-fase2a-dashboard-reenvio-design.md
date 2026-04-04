# Sub-fase 2A: Dashboard com Dados Reais + Reenvio de Webhooks — Design Spec

**Data:** 2026-04-04
**Status:** Aprovado
**Pré-requisito:** Fase 1 completa e em produção
**Spec pai:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md` (v7)

---

## 1. Escopo

Substituir os dados mockados do dashboard por métricas reais do banco de dados, adicionar gráficos e filtros, e implementar reenvio de webhooks individual e em lote.

### Incluído
- API de métricas via Server Actions
- Dashboard com cards, gráfico de linha (Recharts), top 5 erros, webhooks recentes
- Filtro por empresa (dropdown) e por período (hoje, 7d, 30d)
- Polling automático de 60s + botão refresh manual
- Reenvio individual de deliveries com falha
- Reenvio em lote por seleção (até 50 por vez)
- Audit log de reenvios

### Excluído (Sub-fase 2B)
- Socket.io (tempo real)
- Notificações (criação, envio, UI)
- Configurações globais (tela /settings)
- Health check por rota

### Excluído (Fase 3)
- Gestão de usuários, perfil, busca global, exportação CSV, esqueci senha, audit log UI, modo de teste, notificações WhatsApp

---

## 2. Arquitetura

**Abordagem:** Server Actions + Client Polling

- Server Actions em `src/actions/dashboard.ts` e `src/actions/resend.ts`
- Dashboard como Client Component consumindo Server Actions
- Polling via `useEffect` + `setInterval` (60s), resetável pelo botão refresh
- Reenvio enfileira jobs no BullMQ (fila `webhook-delivery` existente)
- Tenant scoping: super admin vê tudo ou filtra por empresa; usuário normal vê apenas empresas com membership ativa

**Dependências novas:**
- `recharts` — gráficos de linha no dashboard

**Sem mudanças em:**
- Schema Prisma (todas as tabelas já existem)
- Worker BullMQ (reutiliza a fila `webhook-delivery` existente)
- Infraestrutura Docker (nenhum container novo)

---

## 3. Server Actions

### 3.1 `getDashboardStats(companyId?: string, period?: string)`

**Localização:** `src/actions/dashboard.ts`

**Parâmetros:**
- `companyId` — UUID da empresa ou undefined (todas)
- `period` — "today" | "7d" | "30d" (default: "today")

**Retorno:**
```typescript
{
  totalReceived: number;
  delivered: number;
  failed: number;
  successRate: number; // 0-100, 1 casa decimal
  comparison: {
    totalReceived: number; // variação % vs período anterior
    delivered: number;
    failed: number;
    successRate: number;
  };
}
```

**Query:** `totalReceived` conta `InboundWebhook` (webhooks recebidos da Meta). `delivered` e `failed` contam `RouteDelivery` por status (uma InboundWebhook pode gerar múltiplas deliveries). `successRate` = delivered / (delivered + failed) * 100. Filtrada por `created_at` dentro do período e opcionalmente por `company_id`. O período anterior é calculado automaticamente (ex: "today" compara com ontem, "7d" compara com os 7d anteriores).

**Tenant scoping:** Se o usuário não é super admin, filtra apenas por empresas com membership ativa. Se `companyId` é fornecido, valida que o usuário tem acesso.

### 3.2 `getDashboardChart(companyId?: string, period?: string)`

**Retorno:**
```typescript
Array<{
  hour: string; // formato "HH:00" ou "DD/MM" dependendo do período
  total: number;
  delivered: number;
  failed: number;
}>
```

**Query:** Agrega `RouteDelivery` agrupando por hora (period "today") ou por dia (period "7d", "30d"). Retorna dados formatados prontos pro Recharts.

**Granularidade por período:**
- "today" — por hora (24 pontos)
- "7d" — por dia (7 pontos)
- "30d" — por dia (30 pontos)

### 3.3 `getTopErrors(companyId?: string, period?: string)`

**Retorno:**
```typescript
Array<{
  errorMessage: string;
  count: number;
  lastOccurrence: Date;
  routeName: string;
  routeId: string;
}> // máximo 5 itens
```

**Query:** `DeliveryAttempt` WHERE `error_message IS NOT NULL`, JOIN `RouteDelivery` JOIN `WebhookRoute`. Agrupa por `error_message`, ordena por count DESC, LIMIT 5. Filtrada por período e empresa.

### 3.4 `getRecentWebhooks(companyId?: string, page?: number)`

**Retorno:**
```typescript
{
  webhooks: Array<{
    id: string;
    receivedAt: Date;
    eventType: string;
    companyName: string;
    companyId: string;
    deliveries: Array<{
      id: string;
      routeName: string;
      routeId: string;
      status: DeliveryStatus;
      durationMs: number | null;
      totalAttempts: number;
    }>;
  }>;
  totalPages: number;
  currentPage: number;
}
```

**Query:** `InboundWebhook` JOIN `RouteDelivery` JOIN `WebhookRoute` JOIN `Company`. Ordenado por `received_at DESC`. Paginação de 20 por página.

### 3.5 `resendDelivery(deliveryId: string)`

**Localização:** `src/actions/resend.ts`

**Validações:**
1. Delivery existe
2. Usuário tem acesso à empresa do delivery (tenant scoping)
3. Status é `failed`

**Ações:**
1. Atualiza `RouteDelivery`: status → `pending`, `next_retry_at` → null
2. Enfileira job no BullMQ (fila `webhook-delivery`)
3. Registra no AuditLog: action `delivery.resend`, actor_type `user`, com delivery_id e route_id nos details

**Retorno:** `{ success: boolean; error?: string }`

### 3.6 `resendDeliveries(deliveryIds: string[])`

**Validações:**
1. Máximo 50 IDs por chamada
2. Todos os deliveries existem e pertencem a empresas que o usuário tem acesso
3. Todos têm status `failed`

**Ações:**
1. Em transação: atualiza todos os deliveries (status → `pending`, `next_retry_at` → null)
2. Enfileira jobs no BullMQ para cada delivery
3. Registra no AuditLog: action `delivery.resend_batch`, com array de IDs nos details

**Retorno:** `{ success: number; failed: number; errors?: string[] }`

---

## 4. Dashboard UI

### 4.1 Layout (de cima pra baixo)

**Header:**
- Título "Dashboard"
- Dropdown de empresa: select com "Todas as empresas" + lista das empresas acessíveis. Super admin vê todas, usuário normal vê só as com membership
- Seletor de período: "Hoje", "7 dias", "30 dias"
- Botão refresh com ícone RefreshCw (spinner durante loading)

**Cards de métricas (grid 4 colunas desktop, 2 mobile):**
- Total Recebidos — ícone Inbox, valor, variação %
- Entregues — ícone CheckCircle, valor, variação %
- Falhas — ícone XCircle, valor, variação %
- Taxa de Sucesso — ícone TrendingUp, valor em %, variação

Variação positiva em verde (seta ArrowUp), negativa em vermelho (seta ArrowDown). Exceção: card de Falhas inverte (mais falhas = vermelho).

**Gráfico de linha (Recharts):**
- Card bg-zinc-900 com título "Webhooks por Hora/Dia"
- 3 linhas: Total (zinc-400), Entregues (green-500), Falhas (red-500)
- Tooltip customizado (dark mode) com valores
- ResponsiveContainer para responsividade
- Fundo transparente, grid lines zinc-800
- Sem dados = mensagem "Nenhum webhook no período"

**Top 5 Erros:**
- Card bg-zinc-900 com título "Erros Mais Frequentes"
- Tabela compacta: mensagem de erro (truncada 60 chars), contagem (badge), última ocorrência (relativo), rota afetada
- Cada linha clicável → navega pra logs da empresa filtrado por rota
- Sem erros = mensagem "Nenhum erro no período"

**Webhooks Recentes:**
- Card bg-zinc-900 com título "Webhooks Recentes"
- Tabela: timestamp (relativo), tipo evento (badge), empresa, rota, status (badge colorido), duração
- Status badges: delivered (green), failed (red), pending (yellow), retrying (orange), delivering (blue)
- Paginação simples no rodapé (anterior/próximo + "Página X de Y")

### 4.2 Polling e Refresh

- `useEffect` com `setInterval` de 60s
- Botão refresh: cancela timer atual, chama Server Actions imediatamente, reinicia timer
- Mudança de empresa ou período: chama Server Actions imediatamente, reinicia timer
- Loading: skeleton nos cards e gráfico durante fetch inicial. Polling subsequente não mostra skeleton (atualiza silenciosamente)

### 4.3 Design System

Segue `design-system/nexus-roteador-webhook/MASTER.md`:
- Background: #09090b (zinc-950)
- Cards: bg-zinc-900 border-zinc-800 rounded-xl
- Primary: #2563EB (blue-600)
- Texto: zinc-100 (principal), zinc-400 (secundário)
- Interações: cursor-pointer + transition 200ms
- Animações: Framer Motion para entrada dos cards (stagger)

---

## 5. Reenvio de Webhooks (UI)

### 5.1 Reenvio Individual

**Localização:** Tela de logs da empresa (`/companies/:id/logs`)

- Botão com ícone RefreshCw em cada linha de delivery com status `failed`
- Desabilitado para outros status
- Ao clicar: chama `resendDelivery`, mostra toast de sucesso/erro
- Status do delivery atualiza no próximo polling da tabela

### 5.2 Reenvio em Lote

**Localização:** Mesma tela de logs

- Checkbox em cada linha de delivery com status `failed` (desabilitado pra outros status)
- Checkbox "selecionar todos da página" no header da tabela (seleciona apenas os `failed` da página)
- Barra de ações aparece quando há seleção: "X selecionados" + botão "Reenviar selecionados"
- Modal de confirmação: "Tem certeza que deseja reenviar X webhooks? Eles serão reenfileirados para entrega."
- Ao confirmar: chama `resendDeliveries`, mostra toast com resultado ("Y reenviados com sucesso, Z falharam")
- Limite de 50 por vez. Se selecionar mais, botão fica desabilitado com tooltip explicando o limite

---

## 6. Estrutura de Arquivos

```
src/
├── actions/
│   ├── dashboard.ts          # getDashboardStats, getDashboardChart, getTopErrors, getRecentWebhooks
│   └── resend.ts             # resendDelivery, resendDeliveries
├── components/
│   └── dashboard/
│       ├── dashboard-content.tsx   # EXISTENTE — refatorar para dados reais
│       ├── stats-cards.tsx         # 4 cards de métricas
│       ├── webhook-chart.tsx       # gráfico Recharts
│       ├── top-errors.tsx          # tabela top 5 erros
│       ├── recent-webhooks.tsx     # tabela webhooks recentes
│       ├── company-filter.tsx      # dropdown de empresa
│       └── period-filter.tsx       # seletor de período
├── app/
│   └── (protected)/
│       ├── dashboard/
│       │   └── page.tsx            # EXISTENTE — sem mudanças
│       └── companies/
│           └── [id]/
│               └── logs/
│                   └── page.tsx    # EXISTENTE — adicionar reenvio
```

---

## 7. Testes

- **Server Actions:** Testes unitários para cada action (mock do Prisma, validação de tenant scoping, edge cases)
- **Reenvio:** Testes de validação (delivery não-failed, sem acesso, limite de 50), teste de enqueue no BullMQ
- **Componentes:** Testes básicos de renderização dos novos componentes do dashboard
- **Integração:** Teste end-to-end do fluxo de reenvio (action → BullMQ → worker)
