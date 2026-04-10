# Módulo de Relatórios CSV — Design

**Data:** 2026-04-10
**Status:** Aprovado (v1)
**Autor:** brainstorm colaborativo

---

## 1. Objetivo

Permitir que admins e super admins exportem dados do sistema em arquivos CSV prontos para análise externa (Excel, Google Sheets, scripts Python). Escopo do v1: logs de webhook, empresas, rotas e usuários.

## 2. Não-objetivos (YAGNI)

Deliberadamente fora do v1:

- Métricas do dashboard em CSV (quem vê o gráfico raramente precisa do CSV dos mesmos números; pode virar v2 sob demanda)
- Agendamento de relatórios recorrentes
- Envio por e-mail
- Formatos adicionais (XLSX, JSON, PDF)
- Histórico de exportações
- Gráficos embedados

## 3. Escopo funcional

Quatro tipos de relatório, cada um com filtros dedicados e export em CSV UTF-8.

### 3.1 Logs de webhook

**Filtros**
- Período (obrigatório) — default: últimos 30 dias
- Empresa (opcional, select) — limitado às empresas visíveis ao usuário
- Status (opcional) — `success` | `error` | `pending`
- Tipo de evento (opcional) — select com os eventos do WhatsApp Cloud (messages, statuses, message_template_status_update, etc.)

**Colunas**
- Data/hora (ISO `yyyy-MM-dd HH:mm:ss`)
- Empresa
- Rota
- Tipo de evento
- Status
- URL destino
- Duração (ms)
- Código HTTP de resposta
- Mensagem de erro (se houver)

### 3.2 Empresas

**Filtros**
- Nenhum (lista pequena na prática)

**Colunas**
- Nome
- Slug
- Status (ativa/inativa)
- Webhook key
- Criada em
- Total de rotas
- Total de membros

### 3.3 Rotas

**Filtros**
- Empresa (opcional, select) — limitado às visíveis

**Colunas**
- Empresa
- Nome da rota
- URL destino
- Eventos inscritos (lista separada por `; `)
- Status
- Criada em

### 3.4 Usuários

**Filtros**
- Platform role (opcional, select) — `super_admin` | `admin` | `manager` | `viewer`

**Colunas**
- Nome
- E-mail
- Platform role
- Status (ativo/inativo)
- Empresas vinculadas (lista `nome (CompanyRole); ...`)
- Criado em

Coluna `avatarUrl` explicitamente excluída — base64 inline explodiria o arquivo.

## 4. UI

### 4.1 Navegação

Novo item **Relatórios** na sidebar, visível apenas para `platformRole` `super_admin` ou `admin`. Posição: após **Usuários** e antes de **Configurações** (mesmo cluster administrativo).

### 4.2 Página `/relatorios`

Server component que:
1. Faz auth check — redireciona para `/dashboard` se role < admin
2. Carrega lista de empresas visíveis (para popular selects)
3. Renderiza `ReportsContent` client component

`ReportsContent` exibe **lista vertical de 4 blocos** (um por tipo de relatório). Sem modal. Cada bloco tem:

- Ícone + título + descrição curta
- Seção de filtros inline (inputs/selects relevantes ao tipo)
- Texto de contagem estimada: "~N registros serão exportados" (recalcula on-change de filtros, debounce 300ms)
- Botão **Baixar CSV** à direita, com estado de loading

Quando o usuário muda filtros, uma query `count()` é chamada no backend para atualizar a estimativa. Ao clicar **Baixar**, o browser inicia o download via navegação para a rota `/api/reports/{tipo}?...`.

### 4.3 Design visual

- Seguir design system do projeto (`bg-card/50`, border, motion stagger)
- Cada bloco é um `Card` com padding generoso
- Usar ícones Lucide: `FileText` (logs), `Building2` (empresas), `Route` (rotas), `Users` (usuários)
- Filtros usam `CustomSelect` e `Input` existentes
- Layout responsivo — filtros em grid `sm:grid-cols-2` para telas maiores

## 5. Arquitetura técnica

```
src/app/(protected)/relatorios/
  page.tsx                    # server: auth + role check + lista empresas
  reports-content.tsx         # client: 4 blocos + filtros + botão baixar

src/app/api/reports/
  [type]/route.ts             # GET: stream CSV por tipo
  [type]/count/route.ts       # GET: retorna contagem estimada (JSON)

src/lib/reports/
  csv.ts                      # serialização: escape RFC 4180, BOM UTF-8
  generators/
    logs.ts                   # async iterable via cursor
    companies.ts
    routes.ts
    users.ts
  filters.ts                  # parse + validação de query params (zod)
  access.ts                   # resolve empresas visíveis por usuário

src/lib/reports/__tests__/
  csv.test.ts                 # testes unitários do escape
```

### 5.1 Geradores (async iterables)

Cada gerador exporta uma função `async function* generateX(filters, accessScope): AsyncIterable<string[]>` que yielda arrays de células já formatadas como strings. Primeira iteração é sempre o header.

Logs usa **cursor pagination em batches de 500** para evitar carregar tudo em memória. Empresas/rotas/usuários são pequenos suficientes para query única.

### 5.2 Streaming HTTP

A route handler monta um `ReadableStream` que:
1. Emite BOM UTF-8 (`\uFEFF`)
2. Emite header row
3. Itera o gerador, emitindo cada linha CSV-encoded + CRLF

Headers de resposta:
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="nexus-{tipo}-{range}.csv"`

Nome do arquivo inclui range quando aplicável (logs):
- Logs: `nexus-logs-2026-03-01_2026-03-31.csv`
- Outros: `nexus-{tipo}-2026-04-10.csv` (data de exportação)

### 5.3 Formato CSV

- **BOM UTF-8** (`\uFEFF`) — Excel BR abre com acentos corretos
- **Separador:** vírgula
- **Quebra de linha:** CRLF (`\r\n`)
- **Escape RFC 4180:** valores contendo `,`, `"` ou `\n` são envolvidos em aspas; aspas internas são duplicadas (`"` → `""`)
- **Datas:** ISO `yyyy-MM-dd HH:mm:ss` (amigável a Excel BR e scripts)
- **Cabeçalhos:** em português

## 6. Permissões e acesso

### 6.1 Camada de plataforma

- `super_admin`: acesso total, exporta qualquer empresa
- `admin`: acesso à página, mas filtrado por membership (ver abaixo)
- `manager`, `viewer`: sem acesso — item da sidebar oculto, página redireciona, API retorna 403

### 6.2 Camada de empresa (admin não-super)

Um admin só vê e exporta dados de empresas onde tem `CompanyRole` `company_admin` ou `manager`. Implementação:

- `resolveAccessScope(user)` retorna `{ isSuperAdmin: true }` ou `{ companyIds: string[] }`
- Todos os geradores aplicam filtro: logs, rotas e members WHERE companyId IN accessibleIds
- Relatório de **Empresas**: admin vê só as que é membro ≥ manager
- Relatório de **Usuários**: admin vê apenas usuários que são membros das mesmas empresas que ele (não vazar lista de usuários sem relação)

### 6.3 Redirecionamento

`/relatorios/page.tsx` chama `getCurrentUser()`; se role < admin, `redirect('/dashboard')`.

## 7. Limites e performance

- **Teto de 50.000 linhas por export.** Ao atingir, o gerador emite uma linha final `"_aviso","Limite de 50.000 registros atingido — refine os filtros para obter o restante","","..."` e para.
- **1 export simultâneo por usuário.** Guardado em memória no servidor (`Map<userId, boolean>`); se já tem um em curso, API retorna 429. Aceitável para single-instance; se escalarmos horizontalmente, migrar para Redis.
- **Contagem estimada** (`/api/reports/{type}/count`) usa `prisma.count()` simples; rápido mesmo em tabelas grandes. Debounce de 300ms no client.
- Batches Prisma de 500 para logs — trade-off entre round-trips e memória. Total ~100 queries para 50k linhas, aceitável.

## 8. Tratamento de erros

- Filtros inválidos (zod) → 400 com mensagem
- Sem permissão → 403
- Export já em curso → 429
- Erro durante streaming → stream é fechado; usuário recebe arquivo incompleto (trade-off aceitável do streaming)
- Log de erros via `console.error` com prefixo `[reports]`

## 9. Testes

- **Unitários:** `csv.ts` — escape RFC 4180 cobrindo vírgulas, aspas, quebras, células vazias, BOM
- **Integração manual:** cada tipo de relatório exportado ao menos uma vez em produção com filtros variados
- Sem testes E2E no v1

## 10. Migrations / schema

**Nenhuma mudança no schema.** Usa modelos existentes (`WebhookLog`, `Company`, `WebhookRoute`, `User`, `CompanyMembership`).

## 11. Arquivos afetados

**Novos**
- `src/app/(protected)/relatorios/page.tsx`
- `src/app/(protected)/relatorios/reports-content.tsx`
- `src/app/api/reports/[type]/route.ts`
- `src/app/api/reports/[type]/count/route.ts`
- `src/lib/reports/csv.ts`
- `src/lib/reports/generators/{logs,companies,routes,users}.ts`
- `src/lib/reports/filters.ts`
- `src/lib/reports/access.ts`
- `src/lib/reports/__tests__/csv.test.ts`

**Modificados**
- `src/lib/constants/navigation.ts` — adicionar item **Relatórios** para admin+

## 12. Sequência de entrega

1. Helpers CSV + testes unitários (base)
2. Access scope resolver
3. Gerador de **Empresas** (mais simples, valida arquitetura)
4. API route streaming + count + UI de um tipo funcionando ponta-a-ponta
5. Geradores restantes (rotas, usuários, logs)
6. Navegação e polish de UI
7. QA manual em produção

---

## Decisões de design em destaque

| Decisão | Racional |
|---|---|
| Sem modal, filtros inline | Menos cliques, menos componentes, UX mais direta |
| Cortar métricas do dashboard | YAGNI — dashboard já exibe, CSV duplicaria sem valor |
| ISO date em vez de BR | Compatível com Excel BR E scripts/grep |
| Limite 50k linhas | Protege servidor e evita downloads acidentais gigantes |
| 1 export por usuário | Evita abuso; rate limit simples |
| Access scope por CompanyRole | Respeita regra de duas camadas já existente |
| Sem histórico de exports | YAGNI; logs do servidor bastam para auditoria |
