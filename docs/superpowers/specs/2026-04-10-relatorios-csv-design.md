# Módulo de Relatórios CSV — Design

**Data:** 2026-04-10
**Status:** Aprovado (v2 — revisto após review crítico e verificação de schema)
**Autor:** brainstorm colaborativo

---

## 1. Objetivo

Permitir que admins, managers e super admins exportem dados do sistema em arquivos CSV prontos para análise externa (Excel, Google Sheets, scripts). Escopo do v1: logs de webhook, empresas, rotas e usuários.

## 2. Não-objetivos (YAGNI)

- Métricas do dashboard em CSV (dashboard já exibe; duplicação sem valor)
- Agendamento de relatórios recorrentes
- Envio por e-mail
- Formatos adicionais (XLSX, JSON, PDF)
- Histórico de exportações
- Gráficos embedados
- Export de `DeliveryAttempt` individual (granularidade máxima) — se pedido, vira v2
- Export de audit logs — fora do v1

## 3. Escopo funcional

Quatro tipos de relatório. Todos os tipos respeitam as regras de permissão (seção 6) antes de qualquer query.

### 3.1 Logs de webhook

> **Modelo real do projeto:** logs são hierárquicos.
> `InboundWebhook` (1 recebimento da Meta) → `RouteDelivery[]` (1 entrega por rota elegível) → `DeliveryAttempt[]` (tentativas/retries).

**Granularidade escolhida: 1 linha por `RouteDelivery`** (join com inbound + route + última tentativa). Isso dá o registro mais útil para auditoria — "evento X foi para rota Y com status Z em W ms" — sem a explosão de volume de DeliveryAttempt.

**Filtros** (reutilizam o `LogFiltersSchema` de `src/lib/actions/logs.ts`)
- Período (obrigatório) — default: últimos 30 dias, teto máximo de 90 dias por export
- Empresa (opcional, select) — limitado às empresas visíveis ao usuário
- Rota (opcional, select) — populado dinamicamente quando uma empresa é selecionada
- Status (opcional, multi-select) — enum `DeliveryStatus`: `pending | delivering | delivered | retrying | failed`
- Tipo de evento (opcional, multi-select) — populado dinamicamente via `getAvailableEventTypes(companyId)` quando empresa é selecionada; oculto se nenhuma empresa foi escolhida

**Colunas**
- Data de recebimento (`inboundWebhook.receivedAt`, ISO)
- Empresa (`company.name`)
- Rota (`route.name`)
- URL destino (`route.url`)
- Tipo de evento (`inboundWebhook.eventType`)
- Status da entrega (`delivery.status`)
- Total de tentativas (`delivery.totalAttempts`)
- Duração da última tentativa (ms) (`lastAttempt.durationMs`)
- HTTP final (`delivery.finalHttpStatus`)
- Entregue em (`delivery.deliveredAt`, ISO)
- Última tentativa em (`delivery.lastAttemptAt`, ISO)
- Erro da última tentativa (`lastAttempt.errorMessage`)

### 3.2 Empresas

**Filtros**: nenhum (lista pequena na prática).

**Colunas**
- Nome
- Slug
- Webhook key
- Status (ativa/inativa)
- Logo URL (se houver — URL, não base64)
- Data de criação (ISO)
- Total de rotas
- Total de membros

### 3.3 Rotas

**Filtros**
- Empresa (opcional, select) — limitado às visíveis

**Colunas**
- Empresa
- Nome da rota
- URL destino
- Eventos inscritos (JSON serializado como lista legível `evento1; evento2; evento3`)
- Status (ativa/inativa)
- Timeout (ms)
- Data de criação (ISO)

**Não exportados por segurança**: `secretKey`, `headers` (podem conter credenciais).

### 3.4 Usuários

**Filtros**
- Platform role (opcional, select) — `super_admin | admin | manager | viewer`

**Colunas**
- Nome
- E-mail
- Platform role
- Super admin (sim/não)
- Status (ativo/inativo)
- Empresas vinculadas (lista `nome (companyRole); ...`) — **filtrada pelas empresas visíveis ao exportador**
- Data de criação (ISO)

**Não exportado**: `avatarUrl` (base64 inline explodiria o arquivo), `password` (óbvio).

## 4. UI

### 4.1 Navegação

Novo item **Relatórios** em `src/lib/constants/navigation.ts`, adicionado ao `RESTRICTED_NAV_ITEMS` com `allowedRoles: ["super_admin", "admin", "manager"]`. Posição: após **Usuários**, antes de **Configurações**.

### 4.2 Página `/relatorios`

**Server component** (`page.tsx`):
1. `getCurrentUser()` — se `platformRole < manager`, `redirect('/dashboard')`
2. Calcula `accessibleCompanyIds` via `getAccessibleCompanyIds(user)` (já existe em `src/lib/tenant.ts`)
3. Busca empresas visíveis para popular os selects
4. Renderiza `ReportsContent` com `initialData` tipado

**Client component** (`reports-content.tsx`):
Lista vertical de blocos (um por tipo de relatório), sem modal. A lista é filtrada pelo role do usuário:

- `super_admin` / `admin`: 4 blocos (Logs, Empresas, Rotas, Usuários)
- `manager`: 3 blocos (Logs, Empresas, Rotas) — **sem Usuários**

Cada bloco tem:
- Ícone (Lucide: `FileText`, `Building2`, `Route`, `Users`) + título + descrição
- Seção de filtros inline em grid `sm:grid-cols-2`
- Texto de contagem estimada: `~N registros · ~S MB` (recalcula on-change de filtros via debounce 300 ms)
- Botão **Baixar CSV** à direita
  - Disabled quando: estimativa ainda carregando, ou contagem = 0, ou contagem > 50.000
  - Quando contagem > 50.000: exibe aviso "Refine os filtros — limite de 50.000 registros por export"
- Estado de loading durante estimativa e durante o click (cancela se usuário navegar)

### 4.3 Design visual

- Seguir design system: `Card` com `bg-card/50`, `border-border`, motion stagger nas entradas
- Cada bloco com padding generoso
- Filtros usam `CustomSelect` e `Input` existentes
- Layout responsivo

## 5. Arquitetura técnica

```
src/app/(protected)/relatorios/
  page.tsx                    # server: auth + role + lista empresas
  reports-content.tsx         # client: blocos + filtros + baixar

src/app/api/reports/
  [type]/route.ts             # GET: stream CSV por tipo
  [type]/count/route.ts       # GET: retorna { count, estimatedBytes }

src/lib/reports/
  csv.ts                      # serialização + formula-injection guard + BOM
  generators/
    logs.ts                   # async iterable via batches (RouteDelivery)
    companies.ts
    routes.ts
    users.ts
  filters.ts                  # schemas zod por tipo + parse de query params
  estimate.ts                 # count + estimativa de bytes por tipo
  rate-limit.ts               # Redis SET NX EX

src/lib/reports/__tests__/
  csv.test.ts                 # testes unitários (escape + formula-injection)
```

### 5.1 Geradores como async iterables

Cada gerador exporta uma função com assinatura:

```ts
async function* generateX(
  filters: XFilters,
  accessibleCompanyIds: string[] | undefined
): AsyncIterable<string[]>
```

Yielda arrays de células pré-formatadas como strings. Primeira iteração é sempre o header.

**Logs** usa **batches de 500 via cursor pagination** no `RouteDelivery` (não `InboundWebhook`), fazendo join com inbound + route + company + último attempt. Ordenação por `routeDelivery.createdAt desc`. Respeita o teto de 50.000 linhas — ao atingir, emite linha final de aviso e para.

**Empresas / Rotas / Usuários** são suficientemente pequenos para query única (uma para todos os dados, com `take: 50000`).

### 5.2 Streaming HTTP

Route handler monta um `ReadableStream`:
1. Emite BOM UTF-8 (`\uFEFF`)
2. Emite header row CSV-encoded + CRLF
3. Itera o gerador, emitindo cada linha CSV-encoded + CRLF
4. Se o gerador atingir o teto: emite linha final `["_aviso","Limite de 50.000 registros atingido — refine os filtros","","..."]`

Headers de resposta:
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="<nome>"`
- `Cache-Control: no-store` (relatório é sempre fresh)

**Nome do arquivo**:
- Logs: `nexus-logs-<dataInicio>_<dataFim>.csv` (ex: `nexus-logs-2026-03-01_2026-03-31.csv`)
- Outros: `nexus-<tipo>-<dataExportacao>.csv`

### 5.3 Formato CSV

- **BOM UTF-8** (`\uFEFF`) — Excel BR abre com acentos corretos
- **Separador:** vírgula
- **Quebra de linha:** CRLF (`\r\n`)
- **Escape RFC 4180:** valores contendo `,`, `"` ou `\n` são envolvidos em aspas; aspas internas são duplicadas (`"` → `""`)
- **Proteção contra CSV Formula Injection (CWE-1236):** qualquer célula cujo conteúdo comece com `=`, `+`, `-`, `@`, `\t` ou `\r` é prefixada com `'` antes do escape RFC 4180. Implementado no `escapeCsvCell()` de `csv.ts`.
- **Datas:** ISO `yyyy-MM-dd HH:mm:ss` (compatível com Excel BR E scripts/grep/sort)
- **Cabeçalhos:** em português, padrão "Data de criação" (não "Criado em" / "Criada em")

## 6. Permissões e acesso

### 6.1 Três camadas de verificação

| Camada | Quando | Ação |
|---|---|---|
| **Plataforma** | Entrada na página + início do download/count | Se `platformRole < manager`: bloqueado (redirect ou 403) |
| **Por tipo de relatório** | Antes de cada gerador | `manager` não acessa **Usuários** (o tipo não aparece na UI e a API retorna 403) |
| **Por empresa (tenant scoping)** | Em cada query do gerador | Usa `getAccessibleCompanyIds(user)` de `tenant.ts`. Se `undefined` (super_admin): sem filtro. Senão: `WHERE companyId IN (...)` |

### 6.2 Regras detalhadas por relatório

- **Logs**: filtra `routeDelivery.companyId IN accessibleCompanyIds` (exceto super_admin)
- **Empresas**: `WHERE company.id IN accessibleCompanyIds` (exceto super_admin)
- **Rotas**: `WHERE route.companyId IN accessibleCompanyIds` (exceto super_admin)
- **Usuários**:
  - Manager: sem acesso ao relatório
  - Admin: lista usuários que têm pelo menos uma membership em empresa do `accessibleCompanyIds` do admin
  - Super admin: todos os usuários
  - **Lista "empresas vinculadas" é filtrada** pelas empresas visíveis ao exportador (não vazar nomes de empresas onde o admin não é membro)

### 6.3 Count endpoint

`/api/reports/[type]/count/route.ts` compartilha o mesmo middleware de verificação: role check + access scope. Bloqueio e filtragem **idênticos** ao download.

## 7. Limites e performance

### 7.1 Teto duro: 50.000 linhas por export

Implementado no gerador — para de yieldar ao atingir. Ao final, emite uma linha de aviso para o usuário perceber que foi truncado.

### 7.2 Limite de período em logs: 90 dias

Filtros de data em logs são validados pelo schema zod — se o range for maior que 90 dias, retorna 400. Evita usuário tentar exportar "o ano inteiro" e travar o servidor.

### 7.3 Rate limit via Redis (1 export simultâneo por usuário)

```ts
const key = `report:export:${userId}`;
const acquired = await redis.set(key, "1", "EX", 300, "NX");
if (acquired !== "OK") return 429; // export em curso
// ... stream ...
await redis.del(key); // em try/finally para liberar em erro
```

- TTL de 5 minutos (cobre o pior cenário de export lento; se o stream crashar e não der `del`, libera sozinho)
- Funciona em multi-réplica (Docker Swarm pode escalar sem quebrar)
- Reutiliza o `redis` client de `src/lib/redis.ts`

### 7.4 Batches Prisma de 500 em logs

Trade-off entre round-trips e memória. ~100 queries para 50.000 linhas. Aceitável. Se virar gargalo em prod, aumentar para 1000.

### 7.5 Estimativa rápida (count endpoint)

- `prisma.count()` com os mesmos filtros + access scope
- Estimativa de bytes: `count * avgBytesPerRow[tipo]` (constantes empíricas: logs ≈ 250 B, empresas ≈ 200 B, rotas ≈ 180 B, usuários ≈ 220 B)
- Exibido no client como `~N registros · ~S MB`
- Debounce 300 ms no client

## 8. Segurança

1. **Autenticação obrigatória** em todas as rotas (`auth()` do NextAuth)
2. **Role check no entry** (`/relatorios` page + cada API route)
3. **Tenant scoping via `getAccessibleCompanyIds`** em todas as queries dos geradores
4. **CSV Formula Injection mitigado** em `escapeCsvCell` (ver 5.3)
5. **Rate limit** via Redis evita abuso (1 export por usuário)
6. **Rotas não exportam secrets** (`secretKey`, `headers` do `WebhookRoute`; `password`, `theme`, `avatarUrl` do `User`; `accessToken` do `CompanyCredential` — que aliás não tem relatório)
7. **Cookies de autenticação** carregados automaticamente pelo browser no download (via `fetch` com `credentials: 'include'` no count; navegação direta no download)

## 9. Tratamento de erros

| Situação | Resposta |
|---|---|
| Não autenticado | 401 |
| Role insuficiente | 403 |
| Filtros inválidos (zod) | 400 com mensagem |
| Range de data > 90 dias (logs) | 400 |
| Export já em curso (Redis rate limit) | 429 "Aguarde o export em andamento terminar" |
| Erro durante streaming (DB falha mid-stream) | Stream fechado; frontend mostra toast. Arquivo fica truncado — trade-off aceitável do streaming (documentar) |
| Tipo de relatório inválido (`/api/reports/foo`) | 404 |

Logs de erro via `console.error` com prefixo `[reports:<tipo>]` para facilitar grep em produção.

## 10. Testes

**Unitários** (`src/lib/reports/__tests__/csv.test.ts`):
- `escapeCsvCell` com vírgula, aspas, quebras de linha, célula vazia
- CSV Formula Injection: células começando com `=`, `+`, `-`, `@`, `\t`, `\r` são prefixadas com `'`
- BOM UTF-8 presente no início

**Integração manual em produção** (documentado na seção 12 — sequência de entrega):
- Cada tipo exportado ao menos uma vez com filtros variados
- Teste de permissão: manager não vê Usuários; admin não vê empresas fora do scope; super_admin vê tudo
- Teste de rate limit: dois clicks rápidos no mesmo tipo → segundo retorna 429
- Teste de formula injection: criar empresa com nome `=HYPERLINK(...)` e confirmar que vira `'=HYPERLINK(...)` no CSV

Sem testes E2E no v1.

## 11. Arquivos afetados

**Novos**
- `src/app/(protected)/relatorios/page.tsx`
- `src/app/(protected)/relatorios/reports-content.tsx`
- `src/app/api/reports/[type]/route.ts`
- `src/app/api/reports/[type]/count/route.ts`
- `src/lib/reports/csv.ts`
- `src/lib/reports/filters.ts`
- `src/lib/reports/estimate.ts`
- `src/lib/reports/rate-limit.ts`
- `src/lib/reports/generators/logs.ts`
- `src/lib/reports/generators/companies.ts`
- `src/lib/reports/generators/routes.ts`
- `src/lib/reports/generators/users.ts`
- `src/lib/reports/__tests__/csv.test.ts`

**Modificados**
- `src/lib/constants/navigation.ts` — adicionar item **Relatórios** em `RESTRICTED_NAV_ITEMS` com `allowedRoles: ["super_admin", "admin", "manager"]`

**Reutilizados sem modificação**
- `src/lib/tenant.ts` (`getAccessibleCompanyIds`)
- `src/lib/actions/logs.ts` (`getAvailableEventTypes`, `LogFiltersSchema` como referência)
- `src/lib/redis.ts` (client Redis para rate limit)
- `src/lib/auth.ts` (`getCurrentUser`)
- `src/components/ui/custom-select.tsx`, `Card`, `Button`, `Input`

## 12. Sequência de entrega

1. **Base CSV**: `csv.ts` com escape + formula-injection guard + testes unitários
2. **Rate limit**: `rate-limit.ts` com Redis
3. **Gerador mais simples (Empresas)** + estimate + API route (valida arquitetura ponta-a-ponta)
4. **UI skeleton**: página `/relatorios` com um bloco funcional (Empresas)
5. **Navegação**: item na sidebar
6. **Geradores restantes**: Rotas, Usuários, Logs (logs por último — mais complexo)
7. **Polish de UI**: estados de loading, mensagens de erro, motion
8. **QA manual em produção** (checklist da seção 10)

---

## Decisões de design em destaque

| Decisão | Racional |
|---|---|
| 1 linha por `RouteDelivery` (não Inbound nem Attempt) | Granularidade útil para auditoria sem explosão de volume |
| Managers incluídos em Relatórios (sem Usuários) | Manager da empresa X precisa exportar logs da X; negar seria frustrante |
| Logs limitados a 90 dias por export | Evita abuso e travamento do DB |
| Sem modal, filtros inline | Menos cliques, UX mais direta |
| Cortar métricas do dashboard | YAGNI — dashboard já exibe |
| ISO date em vez de BR | Compatível com Excel BR E scripts |
| Teto 50k linhas + aviso inline | Protege servidor e avisa o usuário |
| Rate limit via Redis (não Map em memória) | Funciona em multi-réplica do Docker Swarm |
| Proteção contra CSV Formula Injection | CWE-1236 — risco real quando dados vêm de input de usuário |
| Eventos populados dinamicamente | Evita hardcoded desatualizado conforme Meta adiciona eventos |
| Lista "empresas vinculadas" filtrada pelo scope do exportador | Evita vazar nomes de empresas que o admin não deveria ver |
| Reutilizar `tenant.ts` existente | Não duplicar lógica de access scope |
| Sem histórico de exports | YAGNI; logs do servidor bastam para auditoria |
