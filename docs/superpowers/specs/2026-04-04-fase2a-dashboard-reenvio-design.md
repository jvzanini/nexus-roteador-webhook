# Sub-fase 2A: Dashboard com Dados Reais + Reenvio de Webhooks — Design Spec

**Data:** 2026-04-04
**Status:** Aprovado (v3 — revisão final)
**Pré-requisito:** Fase 1 completa e em produção
**Spec pai:** `docs/superpowers/specs/2026-04-03-nexus-roteador-webhook-design.md` (v7)

---

## 1. Escopo

Substituir os dados mockados do dashboard por métricas reais do banco de dados, adicionar gráficos e filtros, e implementar reenvio de webhooks individual e em lote.

### Incluído
- API de métricas via Server Action agregadora única
- Dashboard com cards, gráfico de linha (Recharts), top 5 erros, entregas recentes
- Filtro por empresa (dropdown) e por período (hoje, 7d, 30d)
- Polling automático de 60s + botão refresh manual
- Reenvio individual e em lote (cria nova delivery derivada)
- Audit log de reenvios
- Migração: campo `origin_delivery_id` em `RouteDelivery`

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

- Server Action agregadora `getDashboardData()` em `src/actions/dashboard.ts` (helpers internos por seção)
- Server Actions de reenvio em `src/actions/resend.ts`
- Dashboard como Client Component consumindo a action agregadora
- Polling via `useEffect` + `setInterval` (60s), resetável pelo botão refresh
- Reenvio cria nova `RouteDelivery` derivada e enfileira no BullMQ
- Tenant scoping: super admin vê tudo ou filtra por empresa; usuário normal vê apenas empresas com membership ativa

**Dependências novas:**
- `recharts` — gráficos de linha no dashboard

**Alteração de schema:**
- Campo `origin_delivery_id` em `RouteDelivery` (única mudança, detalhada na seção 5)

**Sem mudanças em:**
- Worker BullMQ (reutiliza a fila `webhook-delivery` existente)
- Infraestrutura Docker (nenhum container novo)

---

## 3. Regras Temporais

Todas as queries de dashboard seguem estas regras:

- **Armazenamento e queries:** UTC sempre. O banco armazena `created_at` em UTC. Todas as queries filtram por `created_at` em UTC
- **Campo de referência:** `created_at` (não `received_at`) — é o campo indexado e consistente em todas as tabelas
- **Frontend:** Converte UTC → timezone local do browser para exibição (timestamps, labels do gráfico)
- **Definição dos períodos (UTC):**
  - `today` — do início do dia UTC atual (00:00:00Z) até agora (`NOW()`)
  - `7d` — últimos 7 dias completos em UTC (não inclui hoje). Do início do 7º dia anterior até o início de hoje
  - `30d` — últimos 30 dias completos em UTC (não inclui hoje). Do início do 30º dia anterior até o início de hoje
- **Limites:** Inclusivo no início, exclusivo no fim. Ex: `created_at >= '2026-04-04T00:00:00Z' AND created_at < '2026-04-05T00:00:00Z'`
- **Comparação com período anterior (janela equivalente):**
  - `today` — compara com **ontem até o mesmo horário**. Se agora são 14:30 UTC, o período atual é `hoje 00:00 → 14:30` e o anterior é `ontem 00:00 → ontem 14:30`. Isso evita distorção de comparar janela parcial com dia inteiro
  - `7d` — compara com os 7 dias imediatamente anteriores (mesma duração, janela deslocada)
  - `30d` — compara com os 30 dias imediatamente anteriores

---

## 4. Server Actions

### 4.1 `getDashboardData(companyId?: string, period?: string, page?: number)`

**Localização:** `src/actions/dashboard.ts`

Action agregadora que retorna todos os dados do dashboard num único fetch. Internamente chama helpers separados (`getStats`, `getChart`, `getTopErrors`, `getRecentDeliveries`) mas a borda pública é uma só. Isso garante snapshot consistente entre widgets e uma única chamada no polling.

**Parâmetros:**
- `companyId` — UUID da empresa ou undefined (todas)
- `period` — "today" | "7d" | "30d" (default: "today")
- `page` — página das entregas recentes (default: 1)

**Retorno:**
```typescript
{
  stats: {
    webhooksReceived: number;
    deliveriesCompleted: number;
    deliveriesFailed: number;
    deliverySuccessRate: number | null;  // null quando não há entregas no período
    comparison: {
      webhooksReceived: number | null;   // null = período anterior zerado
      deliveriesCompleted: number | null;
      deliveriesFailed: number | null;
      deliverySuccessRate: number | null;
    };
  };
  chart: Array<{
    bucketStart: Date;    // início do intervalo em UTC (ISO 8601). Client formata para timezone local
    total: number;
    delivered: number;
    failed: number;
  }>;
  topErrors: Array<{
    errorMessage: string;
    count: number;
    lastOccurrence: Date;
    routeName: string;
    routeId: string;
    companyId: string;
    companyName: string;
  }>;  // máximo 5 itens
  recentDeliveries: {
    items: Array<{
      id: string;
      createdAt: Date;
      eventType: string;
      companyName: string;
      companyId: string;
      routeName: string;
      routeId: string;
      status: DeliveryStatus;
      durationMs: number | null;   // null para deliveries sem tentativa (pending, recém-criadas)
      totalAttempts: number;
      isResend: boolean;
    }>;
    totalPages: number;
    currentPage: number;
  };
}
```

**Regras de cada helper:**

**Stats:**
- `webhooksReceived` conta `InboundWebhook` (webhooks recebidos da Meta)
- `deliveriesCompleted` e `deliveriesFailed` contam `RouteDelivery` por status terminal (`delivered` e `failed`)
- **Reenvios nas métricas:** deliveries derivadas de reenvio contam normalmente em todos os cards, gráfico e tabela. Do ponto de vista operacional, um reenvio é uma entrega real ao destino — tratar diferente geraria complexidade sem benefício. Isso é decisão de produto, não efeito colateral
- `deliverySuccessRate` = delivered / (delivered + failed) * 100, 1 casa decimal. **Quando não há entregas no período (delivered + failed = 0):** retorna `null`. O frontend exibe "—" em vez de número
- **Comparação:** variação percentual vs período anterior equivalente (ver seção 3). Fórmula: `((atual - anterior) / anterior) * 100`. **Quando o período anterior é zero:** retorna `null` (o frontend exibe "Novo" em vez de percentual)

**Chart:**
- Agrega `RouteDelivery` agrupando por hora (today) ou por dia (7d/30d)
- **Retorna `bucketStart` como Date (ISO 8601 em UTC).** O client é responsável por formatar o label do eixo X na timezone local do browser. Isso evita bugs de formatação de timezone no server
- **Série completa sempre:** retorna todos os pontos do período, inclusive horas/dias sem dados (valor 0). Ex: today sempre retorna 24 pontos (ou até a hora atual), 7d sempre retorna 7 pontos, 30d sempre retorna 30 pontos
- Granularidade: today = por hora, 7d = por dia, 30d = por dia

**Top Errors:**
- `DeliveryAttempt` WHERE `error_message IS NOT NULL`, JOIN `RouteDelivery` JOIN `WebhookRoute` JOIN `Company`
- **Agrupa por `error_message` + `route_id`** (mesmo erro em rotas diferentes = linhas diferentes)
- Ordena por `count DESC`, **desempate por `lastOccurrence DESC`** (erros com mesma contagem: o mais recente primeiro)
- LIMIT 5. Filtrada por período e empresa
- Retorna `companyId` e `companyName` para permitir navegação direta aos logs da empresa/rota no dashboard "Todas as empresas"

**Recent Deliveries:**
- **Tabela de `RouteDelivery`** (não de `InboundWebhook`). Cada linha = uma entrega
- JOIN `InboundWebhook` (pra `eventType`), `WebhookRoute` (pra `routeName`), `Company` (pra `companyName`)
- Ordenado por `created_at DESC`. Paginação de 20 por página
- `isResend` derivado de `origin_delivery_id IS NOT NULL`
- `durationMs` vem do último `DeliveryAttempt` da delivery. Para deliveries sem tentativa (pending, recém-criadas por reenvio): `null`

**Tenant scoping (todos os helpers):** Se o usuário não é super admin, filtra apenas por empresas com membership ativa. Se `companyId` é fornecido, valida que o usuário tem acesso.

### 4.2 `resendDelivery(deliveryId: string)`

**Localização:** `src/actions/resend.ts`

**Modelo de domínio do reenvio:** O reenvio **cria uma nova `RouteDelivery` derivada**, ligada ao mesmo `InboundWebhook` e à mesma `WebhookRoute` da delivery original. A delivery original permanece intacta com status `failed`, preservando todo o histórico (tentativas, timestamps, http status). Isso garante:
- Histórico da falha original nunca é apagado
- `totalAttempts` da original não é alterado
- Métricas contam deliveries distintas (sem double-counting retroativo)
- Uma delivery falhada nunca deixa de ser falhada retroativamente

**Campos da nova delivery derivada:**
- `inbound_webhook_id` — mesmo da original
- `route_id` — mesmo da original
- `company_id` — mesmo da original
- `status` — `pending`
- `origin_delivery_id` — ID da delivery original
- Todos os demais campos: valores default (null/0)

**Validações:**
1. Delivery existe
2. Usuário tem acesso à empresa do delivery (tenant scoping)
3. Status é `failed`

**Ações:**
1. Cria nova `RouteDelivery` com `origin_delivery_id` apontando pra original
2. Enfileira job no BullMQ (fila `webhook-delivery`) — **best-effort.** Se o enqueue falhar, a nova delivery fica com status `pending` e o job `orphan-recovery` existente a detecta e reenfileira automaticamente
3. Registra no AuditLog:
   - `action`: `delivery.resend`
   - `actor_type`: `user`
   - `actor_id`: ID do usuário
   - `resource_type`: `route_delivery`
   - `resource_id`: ID da **nova** delivery criada
   - `details`: `{ originalDeliveryId, newDeliveryId, routeId, inboundWebhookId }`

**Retorno:**
```typescript
{
  created: boolean;       // delivery derivada criada no banco
  enqueued: boolean;      // job enfileirado no BullMQ (false = orphan-recovery vai compensar)
  newDeliveryId: string;  // ID da nova delivery
  error?: string;         // presente apenas se created = false (validação falhou)
}
```

O frontend diferencia os cenários no toast:
- `created && enqueued` → "Reenvio criado e enfileirado"
- `created && !enqueued` → "Reenvio criado. Enfileiramento pendente (será processado automaticamente)"
- `!created` → exibe `error`

### 4.3 `resendDeliveries(deliveryIds: string[])`

**Validação parcial (não atômica):** a action processa cada delivery individualmente. Deliveries inválidas (não existem, sem acesso, status não-failed) são ignoradas e reportadas nos erros. Deliveries válidas são processadas normalmente. Isso evita que um único ID inválido bloqueie o lote inteiro.

**Pré-processamento:**
1. **Deduplica IDs** antes de qualquer validação. Se o mesmo `deliveryId` aparecer mais de uma vez na lista, é tratado como um só. Isso previne criação acidental de múltiplos reenvios pra mesma delivery falhada
2. Valida máximo 50 IDs (após deduplicação)

**Ações:**
1. Para cada delivery válida: cria nova `RouteDelivery` derivada (em transação batch)
2. Enfileira jobs no BullMQ — **best-effort.** Se parte dos enqueues falhar, as deliveries já criadas ficam com `pending`. O `orphan-recovery` compensa as que ficaram sem job
3. Registra no AuditLog:
   - `action`: `delivery.resend_batch`
   - `actor_type`: `user`
   - `resource_type`: `route_delivery`
   - `resource_id`: null (batch)
   - `details`: `{ originalIds, newIds, created, enqueued, enqueueFailed, skipped }`

**Retorno:**
```typescript
{
  created: number;          // deliveries derivadas criadas no banco
  enqueued: number;         // jobs enfileirados com sucesso
  enqueueFailed: number;    // jobs que falharam no enqueue (recovery vai compensar)
  skipped: number;          // deliveries ignoradas (inválidas)
  errors: string[];         // descrição dos skips ("ID xxx: não encontrado", "ID yyy: status não é failed", etc.)
}
```

---

## 5. Alteração de Schema

Único campo novo necessário:

```prisma
model RouteDelivery {
  // ... campos existentes ...
  originDeliveryId  String?        @map("origin_delivery_id") @db.Uuid

  originDelivery    RouteDelivery?  @relation("DeliveryResend", fields: [originDeliveryId], references: [id])
  resends           RouteDelivery[] @relation("DeliveryResend")
}
```

**Migration:** `ALTER TABLE route_deliveries ADD COLUMN origin_delivery_id UUID REFERENCES route_deliveries(id);`

Este é a **única alteração de schema** desta sub-fase.

---

## 6. Dashboard UI

### 6.1 Layout (de cima pra baixo)

**Header:**
- Título "Dashboard"
- Dropdown de empresa: select com "Todas as empresas" + lista das empresas acessíveis. Super admin vê todas, usuário normal vê só as com membership
- Seletor de período: "Hoje", "7 dias", "30 dias"
- Botão refresh com ícone RefreshCw (spinner durante loading)

**Cards de métricas (grid 4 colunas desktop, 2 mobile):**
- **Webhooks Recebidos** — ícone Inbox, valor, variação %
- **Entregas Concluídas** — ícone CheckCircle, valor, variação %
- **Entregas com Falha** — ícone XCircle, valor, variação %
- **Taxa de Sucesso** — ícone TrendingUp, valor em %, label "(entregas)", variação

Os nomes explicitam a unidade de medida: "Webhooks Recebidos" conta inbounds, os demais contam deliveries. Isso evita confusão entre unidades.

**Regras de exibição dos cards:**
- Variação positiva em verde (seta ArrowUp), negativa em vermelho (seta ArrowDown). Exceção: card de "Entregas com Falha" inverte (mais falhas = vermelho)
- **Quando `comparison` é `null`:** exibe badge "Novo" em zinc-500 (sem seta), indicando que não há período anterior pra comparar
- **Quando `deliverySuccessRate` é `null`:** exibe "—" no valor principal (sem entregas no período, não faz sentido mostrar 100% de sucesso de algo que não existiu)

**Gráfico de linha (Recharts):**
- Card bg-zinc-900 com título "Entregas por Hora" (today) ou "Entregas por Dia" (7d/30d)
- 3 linhas: Total (zinc-400), Concluídas (green-500), Falhas (red-500)
- Tooltip customizado (dark mode) com valores
- **Eixo X:** client formata `bucketStart` pra timezone local. Formato: "HH:00" (today) ou "DD/MM" (7d/30d)
- ResponsiveContainer para responsividade
- Fundo transparente, grid lines zinc-800
- Sem dados = mensagem "Nenhuma entrega no período"

**Top 5 Erros:**
- Card bg-zinc-900 com título "Erros Mais Frequentes"
- Tabela compacta: mensagem de erro (truncada 60 chars), contagem (badge), última ocorrência (relativo), rota afetada, empresa
- Cada linha clicável → navega pra `/companies/{companyId}/logs?route={routeId}` (usa `companyId` do retorno)
- Sem erros = mensagem "Nenhum erro no período"

**Entregas Recentes:**
- Card bg-zinc-900 com título "Entregas Recentes"
- Tabela achatada: **uma linha por delivery** (não por webhook)
- Colunas: timestamp (relativo, timezone local), tipo evento (badge), empresa, rota, status (badge colorido), duração, tentativas
- **`durationMs` null:** exibe "—" (deliveries sem tentativa, como pending ou recém-criadas por reenvio)
- Deliveries de reenvio exibem badge "Reenvio" (zinc-500) ao lado do status
- Status badges: delivered (green), failed (red), pending (yellow), retrying (orange), delivering (blue)
- Paginação simples no rodapé (anterior/próximo + "Página X de Y")

### 6.2 Polling e Refresh

- `useEffect` com `setInterval` de 60s chamando `getDashboardData()` (single fetch)
- Botão refresh: cancela timer atual, chama action imediatamente, reinicia timer
- **Mudança de empresa ou período:** chama action imediatamente, reinicia timer, **reseta página pra 1**
- Mudança de página (entregas recentes): chama action imediatamente, **não** reinicia timer
- Loading: skeleton nos cards e gráfico durante fetch inicial. Polling subsequente não mostra skeleton (atualiza silenciosamente)

### 6.3 Design System

Segue `design-system/nexus-roteador-webhook/MASTER.md`:
- Background: #09090b (zinc-950)
- Cards: bg-zinc-900 border-zinc-800 rounded-xl
- Primary: #2563EB (blue-600)
- Texto: zinc-100 (principal), zinc-400 (secundário)
- Interações: cursor-pointer + transition 200ms
- Animações: Framer Motion para entrada dos cards (stagger)

---

## 7. Reenvio de Webhooks (UI)

### 7.1 Reenvio Individual

**Localização:** Tela de logs da empresa (`/companies/:id/logs`)

- Botão com ícone RefreshCw em cada linha de delivery com status `failed`
- Desabilitado para outros status
- Ao clicar: chama `resendDelivery`, mostra toast diferenciado:
  - `created && enqueued` → "Reenvio criado e enfileirado"
  - `created && !enqueued` → "Reenvio criado. Será processado automaticamente"
  - `!created` → toast de erro com mensagem
- Nova delivery aparece na tabela no próximo polling

### 7.2 Reenvio em Lote

**Localização:** Mesma tela de logs

- Checkbox em cada linha de delivery com status `failed` (desabilitado pra outros status)
- Checkbox "selecionar todos da página" no header da tabela (seleciona apenas os `failed` **da página atual**)
- **Escopo da seleção:** apenas a página atual. Navegar pra outra página limpa a seleção. Sem seleção cross-page
- Barra de ações aparece quando há seleção: "X selecionados" + botão "Reenviar selecionados"
- Modal de confirmação: "Tem certeza que deseja reenviar X entregas? Novas entregas serão criadas e enfileiradas."
- Ao confirmar: chama `resendDeliveries`, mostra toast com resultado detalhado:
  - Sucesso total: "X reenvios criados e enfileirados"
  - Parcial: "X criados, Y enfileirados, Z ignorados"
  - Se `enqueueFailed > 0`: mensagem adicional "W serão processados automaticamente"
- Limite de 50 por vez (após deduplicação). Se selecionar mais, botão fica desabilitado com tooltip "Máximo 50 por vez"

---

## 8. Estrutura de Arquivos

```
src/
├── actions/
│   ├── dashboard.ts          # getDashboardData (+ helpers: getStats, getChart, getTopErrors, getRecentDeliveries)
│   └── resend.ts             # resendDelivery, resendDeliveries
├── components/
│   └── dashboard/
│       ├── dashboard-content.tsx   # EXISTENTE — refatorar para dados reais
│       ├── stats-cards.tsx         # 4 cards de métricas
│       ├── webhook-chart.tsx       # gráfico Recharts
│       ├── top-errors.tsx          # tabela top 5 erros
│       ├── recent-deliveries.tsx   # tabela entregas recentes
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
prisma/
└── schema.prisma                   # EXISTENTE — adicionar origin_delivery_id + self-relation
```

---

## 9. Testes

- **Server Action agregadora:** Testes unitários para cada helper interno (mock do Prisma, validação de tenant scoping, edge cases: zero deliveries, período anterior zerado, série completa do gráfico com zeros, comparação janela equivalente today)
- **Reenvio individual:** Teste de criação de delivery derivada (origin_delivery_id preenchido), teste de retorno diferenciado (created/enqueued), validações (não-failed, sem acesso, inexistente)
- **Reenvio em lote:** Teste de deduplicação de IDs, validação parcial (mix de válidos e inválidos), limite de 50, enqueue best-effort (simular falha parcial), audit log batch
- **Componentes:** Testes básicos de renderização dos novos componentes do dashboard (skeleton, estado vazio, badge "Novo", "—" pra null)
- **Integração:** Teste end-to-end do fluxo de reenvio (action → nova delivery → BullMQ → worker)
