# Design: Aba Logs Completa + Visao Geral Mini Dashboard

**Data:** 2026-04-04
**Status:** Aprovado

## Resumo

Dois pendentes antes da Fase 2B:
1. Aba Logs dentro da empresa passa de placeholder para funcionalidade completa
2. Aba Visao Geral ganha metricas e mini grafico (mini dashboard por empresa)

---

## 1. Aba Logs Completa

### O que muda

A aba Logs (`logs-tab.tsx`) deixa de ser um card placeholder com botao "Ver logs completos" e passa a renderizar diretamente os componentes de logs que hoje vivem na pagina separada `/companies/[id]/logs/`.

### Abordagem

Reutilizar os componentes existentes sem reescrever:
- `log-filters.tsx` — filtros de status, evento, rota, periodo
- `log-table.tsx` — tabela com expansao, selecao, reenvio batch
- `log-row-detail.tsx` — payload JSON collapsible, tentativas, status por delivery
- `log-status-badge.tsx` — badges coloridos

### Mudancas

| Arquivo | Acao |
|---------|------|
| `logs-tab.tsx` | Reescrever: substituir placeholder pelo componente completo de logs. Recebe `companyId` como prop. Gerencia estado de filtros e paginacao. |
| `/companies/[id]/logs/page.tsx` | Remover pagina separada |
| `/companies/[id]/logs/*.tsx` | Mover componentes para `_components/logs/` dentro da pasta da empresa |
| Server actions (`logs.ts`) | Sem mudancas |
| Schema Prisma | Sem mudancas |

### Comportamento

- Filtros colapsados por padrao, expandem ao clicar
- Tabela com paginacao cursor-based (ja implementado)
- Linhas expandiveis com payload JSON e detalhes de delivery (ja implementado)
- Reenvio individual e batch de deliveries falhas (ja implementado)

---

## 2. Visao Geral como Mini Dashboard

### O que muda

A aba Visao Geral (`overview-tab.tsx`) ganha metricas e grafico no topo, mantendo as informacoes existentes abaixo.

### Layout (de cima para baixo)

**Bloco 1 — Cards de metricas (grid 2x2):**
- Webhooks Recebidos (ultimas 24h)
- Entregas Concluidas (ultimas 24h)
- Entregas com Falha (ultimas 24h)
- Taxa de Sucesso (%)
- Cada card com icone Lucide, valor numerico e cor contextual

**Bloco 2 — Mini grafico + Rotas ativas (2 colunas):**
- Esquerda (2/3): Mini grafico de barras (ultimos 7 dias) — entregas ok vs falhas, Recharts
- Direita (1/3): Card de rotas ativas — contagem ativas/total, lista compacta com nome e status

**Bloco 3 — Informacoes da empresa (existente):**
- URL do webhook com botao copiar
- Stats grid (rotas, status credenciais)
- Info card (slug, webhook key, data criacao)

### Server Action

Nova funcao `getCompanyOverviewData(companyId)` em `dashboard.ts`:

```typescript
interface CompanyOverviewData {
  stats: {
    webhooksReceived: number
    deliveriesCompleted: number
    deliveriesFailed: number
    successRate: number
  }
  chart: Array<{
    date: string
    delivered: number
    failed: number
  }>
  routes: Array<{
    id: string
    name: string
    isActive: boolean
  }>
}
```

Queries:
- Stats: COUNT em `inbound_webhooks` e `route_deliveries` WHERE `companyId` AND `receivedAt >= 24h ago`
- Chart: GROUP BY dia em `route_deliveries` WHERE `companyId` AND ultimos 7 dias
- Rotas: SELECT de `webhook_routes` WHERE `companyId`

### Mudancas

| Arquivo | Acao |
|---------|------|
| `overview-tab.tsx` | Expandir: adicionar metricas e grafico acima do conteudo existente |
| `_components/overview/` | Novos componentes: `overview-stats.tsx`, `overview-chart.tsx`, `overview-routes.tsx` |
| `dashboard.ts` | Nova funcao `getCompanyOverviewData()` |
| Schema Prisma | Sem mudancas |

---

## Decisoes Tecnicas

- Sem seletor de periodo no mini dashboard (fixo: 24h para stats, 7 dias para grafico)
- Animacoes Framer Motion consistentes com o resto da UI
- Componentes de logs movidos, nao copiados (sem duplicacao)
- Server actions existentes reutilizados onde possivel
