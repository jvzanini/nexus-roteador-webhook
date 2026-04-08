# Modulo: Multi-tenant

## Resumo
Sistema de separacao de dados por empresas/workspaces com memberships e controle de acesso hierarquico. Cada empresa (Company) e um tenant isolado. Usuarios acessam empresas via `UserCompanyMembership`, que define o papel (role) dentro daquela empresa. Super admins tem acesso irrestrito a todas as empresas sem necessidade de membership explicita.

## Dependencias
- **Obrigatorias:** core (auth, users) -- autenticacao, sessao JWT, modelo User
- **Opcionais:** audit-log (registrar criacao/edicao/exclusao de empresas), notifications (notificar membros sobre mudancas)
- **Servicos:** PostgreSQL (relacoes entre tabelas, transacoes para cascade delete)

## Pacotes npm
- `nanoid` -- geracao de webhook keys e sufixos de slug unicos
- `zod` -- validacao de inputs (createCompanySchema, updateCompanySchema)

Nenhum pacote adicional alem dos ja presentes no core.

## Schema Prisma

### Enum CompanyRole

```prisma
enum CompanyRole {
  super_admin
  company_admin
  manager
  viewer
}
```

### Model Company

```prisma
model Company {
  id         String   @id @default(uuid()) @db.Uuid
  name       String
  slug       String   @unique
  webhookKey String   @unique @map("webhook_key")
  logoUrl    String?  @map("logo_url")
  isActive   Boolean  @default(true) @map("is_active")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  credential      CompanyCredential?
  memberships     UserCompanyMembership[]
  routes          WebhookRoute[]
  inboundWebhooks InboundWebhook[]
  routeDeliveries RouteDelivery[]
  notifications   Notification[]
  auditLogs       AuditLog[]

  @@map("companies")
}
```

### Model UserCompanyMembership

```prisma
model UserCompanyMembership {
  id        String      @id @default(uuid()) @db.Uuid
  userId    String      @map("user_id") @db.Uuid
  companyId String      @map("company_id") @db.Uuid
  role      CompanyRole
  isActive  Boolean     @default(true) @map("is_active")
  createdAt DateTime    @default(now()) @map("created_at")
  updatedAt DateTime    @updatedAt @map("updated_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Restrict)
  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@unique([userId, companyId])
  @@map("user_company_memberships")
}
```

**Observacoes sobre o schema:**
- `onDelete: Restrict` em ambas as relacoes -- impede exclusao acidental de User ou Company enquanto houver memberships. A exclusao de empresa e feita via transacao com cascade manual.
- `@@unique([userId, companyId])` -- garante no maximo uma membership por usuario por empresa.
- `slug` e `webhookKey` sao `@unique` -- usados para roteamento de webhooks e URLs amigaveis.

## Variaveis de ambiente

Nenhuma variavel de ambiente especifica para este modulo. A conexao com PostgreSQL (`DATABASE_URL`) ja e provida pelo core.

## Arquivos a criar

### Server Actions e Logica
| Arquivo | Descricao |
|---------|-----------|
| `src/lib/tenant.ts` | Funcoes de tenant scoping (getAccessibleCompanyIds, buildTenantFilter, assertCompanyAccess, getUserCompanyRole) |
| `src/lib/actions/company.ts` | Server Actions CRUD de empresas (getCompanies, getCompanyById, createCompany, updateCompany, deleteCompany) |
| `src/lib/validations/company.ts` | Schemas Zod de validacao (createCompanySchema, updateCompanySchema) |
| `src/lib/utils/slugify.ts` | Utilitario de geracao de slugs a partir de nomes |

### Paginas
| Arquivo | Descricao |
|---------|-----------|
| `src/app/(protected)/companies/page.tsx` | Pagina de listagem de empresas (Server Component) |
| `src/app/(protected)/companies/[id]/page.tsx` | Pagina de detalhe da empresa com tabs (Server Component) |
| `src/app/(protected)/companies/[id]/loading.tsx` | Loading skeleton da pagina de detalhe |
| `src/app/(protected)/companies/[id]/routes/page.tsx` | Sub-pagina de rotas (se acessada diretamente) |

### Componentes da listagem
| Arquivo | Descricao |
|---------|-----------|
| `src/app/(protected)/companies/_components/company-list.tsx` | Grid de cards de empresas com animacao Framer Motion |
| `src/app/(protected)/companies/_components/company-card.tsx` | Card individual de empresa (nome, status, membros, credencial) |
| `src/app/(protected)/companies/_components/company-status-badge.tsx` | Badge de status ativa/inativa |
| `src/app/(protected)/companies/_components/create-company-dialog.tsx` | Dialog de criacao de empresa (apenas super admin) |

### Componentes do detalhe
| Arquivo | Descricao |
|---------|-----------|
| `src/app/(protected)/companies/[id]/_components/company-header.tsx` | Header com nome, status, botoes de acao (editar/excluir) |
| `src/app/(protected)/companies/[id]/_components/company-tabs.tsx` | Container de tabs: Visao Geral, WhatsApp Cloud, Rotas, Logs, Membros |
| `src/app/(protected)/companies/[id]/_components/overview-tab.tsx` | Tab Visao Geral (mini dashboard da empresa) |
| `src/app/(protected)/companies/[id]/_components/overview/overview-stats.tsx` | Cards de metricas da visao geral |
| `src/app/(protected)/companies/[id]/_components/overview/overview-chart.tsx` | Grafico de atividade da empresa |
| `src/app/(protected)/companies/[id]/_components/overview/overview-routes.tsx` | Lista resumida de rotas ativas |
| `src/app/(protected)/companies/[id]/_components/credentials-tab.tsx` | Tab WhatsApp Cloud (credenciais Meta) |
| `src/app/(protected)/companies/[id]/_components/credential-form.tsx` | Formulario de credenciais Meta |
| `src/app/(protected)/companies/[id]/_components/sensitive-field.tsx` | Campo com mascara para dados sensiveis (tokens, secrets) |
| `src/app/(protected)/companies/[id]/_components/logs-tab.tsx` | Tab Logs (historico de webhooks recebidos/enviados) |
| `src/app/(protected)/companies/[id]/_components/logs/log-table.tsx` | Tabela de logs com paginacao cursor-based |
| `src/app/(protected)/companies/[id]/_components/logs/log-filters.tsx` | Filtros de logs (status, evento, data) |
| `src/app/(protected)/companies/[id]/_components/logs/log-row-detail.tsx` | Detalhes expandidos de uma linha de log |
| `src/app/(protected)/companies/[id]/_components/logs/log-status-badge.tsx` | Badge de status do log |
| `src/app/(protected)/companies/[id]/_components/members-tab.tsx` | Tab Membros (usuarios vinculados a empresa) |
| `src/app/(protected)/companies/[id]/_components/edit-company-dialog.tsx` | Dialog de edicao de empresa (nome, slug, logo, webhook key, status) |

## Server Actions

### `getCompanies(options?: { includeInactive?: boolean }): Promise<ActionResult>`
Retorna lista de empresas acessiveis pelo usuario autenticado. Super admin ve todas. Demais usuarios veem apenas empresas onde possuem `UserCompanyMembership` ativa. Inclui contagem de membros e rotas ativas, e indicador de existencia de credencial.

### `getCompanyById(companyId: string): Promise<ActionResult>`
Retorna uma empresa pelo ID com verificacao de acesso. Super admin bypassa. Demais precisam de membership ativa. Retorna dados da empresa com contagens e indicador de credencial.

### `createCompany(input: CreateCompanyInput): Promise<ActionResult>`
Cria nova empresa. **Apenas super admin.** Gera slug automaticamente a partir do nome (com sufixo nanoid se ja existir). Gera webhook key via `nanoid(21)` ou aceita key customizada. Apos criar, auto-vincula todos os super admins da plataforma como `company_admin` via `createMany`. Revalida `/companies`.

### `updateCompany(companyId: string, input: UpdateCompanyInput): Promise<ActionResult>`
Atualiza empresa. **Super admin ou company_admin da empresa.** Suporta atualizacao parcial de: name, slug (com validacao de unicidade), logoUrl, isActive (soft delete), webhookKey (com validacao de unicidade). Se o nome mudar e slug nao for informado, regenera slug automaticamente. Revalida `/companies` e `/companies/[id]`.

### `deleteCompany(companyId: string): Promise<ActionResult>`
Exclui empresa permanentemente com cascade manual em transacao. **Apenas super admin.** Ordem de exclusao: DeliveryAttempt -> RouteDelivery -> WebhookRoute -> InboundWebhook -> CompanyCredential -> Notification -> AuditLog -> UserCompanyMembership -> Company. Revalida `/companies`.

### Tipos auxiliares

```typescript
type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// CreateCompanyInput (via Zod)
{
  name: string;        // 2-100 chars, trimmed
  logoUrl?: string;    // URL valida ou vazio
  webhookKey?: string; // 4-50 chars, [a-zA-Z0-9_-], opcional
}

// UpdateCompanyInput (via Zod)
{
  name?: string;       // 2-100 chars, trimmed
  slug?: string;       // 2-50 chars, [a-z0-9-]
  logoUrl?: string;    // URL valida ou vazio
  isActive?: boolean;
  webhookKey?: string; // 4-50 chars, [a-zA-Z0-9_-]
}
```

## Componentes UI

### Pagina de listagem (`/companies`)
- **CompanyList** -- grid responsivo de cards com empty state animado (Framer Motion)
- **CompanyCard** -- card com nome, slug, badge de status, contagem de membros, indicador de credencial
- **CompanyStatusBadge** -- badge verde (ativa) ou vermelha (inativa)
- **CreateCompanyDialog** -- dialog modal com formulario de criacao (visivel apenas para super admin)

### Pagina de detalhe (`/companies/[id]`)
- **CompanyHeader** -- titulo, badges, botoes de editar/excluir condicionais por role
- **CompanyTabs** -- 5 tabs: Visao Geral, WhatsApp Cloud, Rotas de Webhook, Logs, Membros
- **OverviewTab** -- mini dashboard com stats, grafico e rotas ativas
- **CredentialsTab** -- formulario de credenciais Meta (app ID, secret, verify token, access token, phone number ID, WABA ID)
- **LogsTab** -- tabela de logs com filtros e paginacao cursor-based
- **MembersTab** -- lista de membros com roles e acoes (apenas super admin e company_admin veem esta tab)
- **EditCompanyDialog** -- dialog de edicao com todos os campos editaveis
- **SensitiveField** -- campo com toggle de visibilidade para dados sensiveis

### Permissoes por role na UI
| Acao | super_admin | company_admin | manager | viewer |
|------|:-----------:|:-------------:|:-------:|:------:|
| Ver empresa | Sim | Sim | Sim | Sim |
| Criar empresa | Sim | - | - | - |
| Editar empresa | Sim | Sim | - | - |
| Excluir empresa | Sim | - | - | - |
| Gerenciar rotas | Sim | Sim | Sim | - |
| Ver membros | Sim | Sim | - | - |
| Ver logs | Sim | Sim | Sim | Sim |

## Integracao (o que muda em arquivos existentes)

| Arquivo | Mudanca |
|---------|---------|
| `prisma/schema.prisma` | Adicionar models Company, UserCompanyMembership, enum CompanyRole |
| `src/lib/constants/navigation.ts` | Adicionar item "Empresas" (`/companies`, icone Building2) em `MAIN_NAV_ITEMS` |
| `src/lib/actions/dashboard.ts` | Usar `buildTenantFilter()` para filtrar metricas por empresas acessiveis |
| `src/lib/actions/logs.ts` | Usar `buildTenantFilter()` para filtrar logs por empresas acessiveis |
| `src/lib/actions/webhook-routes.ts` | Usar `assertCompanyAccess()` antes de CRUD de rotas |
| `src/lib/actions/credential.ts` | Usar `assertCompanyAccess()` antes de CRUD de credenciais |
| `src/lib/actions/notifications.ts` | Filtrar notificacoes por `companyId` acessivel |
| `src/lib/actions/users.ts` | Na criacao de usuario, criar memberships automaticamente; na listagem, filtrar por empresa |
| `src/auth.config.ts` | Incluir `isSuperAdmin` e opcionalmente memberships no token JWT |
| `src/app/(protected)/layout.tsx` | Sidebar ja consome `getNavItems()` que inclui "Empresas" |

### Detalhes da integracao de navegacao

O item "Empresas" e definido em `MAIN_NAV_ITEMS` (visivel para todos os roles):

```typescript
export const MAIN_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Empresas", href: "/companies", icon: Building2 },
];
```

A funcao `getNavItems(platformRole)` combina `MAIN_NAV_ITEMS` (sem restricao) com `RESTRICTED_NAV_ITEMS` (filtrados por `allowedRoles`), garantindo que "Empresas" aparece para todos.

## Funcoes de Tenant Scoping

### `getAccessibleCompanyIds(user: TenantUser): Promise<string[] | undefined>`

```typescript
interface TenantUser {
  id: string;
  isSuperAdmin: boolean;
}
```

Retorna lista de IDs de empresas que o usuario pode acessar. Se o usuario e super admin, retorna `undefined` (significando "sem restricao", acesso total). Para demais usuarios, consulta `UserCompanyMembership` filtrando por `userId` e `isActive: true`, retornando array de `companyId`.

### `buildTenantFilter(companyIds: string[] | undefined): Record<string, any>`

Constroi clausula WHERE do Prisma para tenant scoping. Se `companyIds` e `undefined` (super admin), retorna `{}` (sem filtro). Se e um array, retorna `{ companyId: { in: [...] } }`. Deve ser espalhado no `where` de qualquer query que precise de isolamento por tenant.

**Exemplo de uso:**
```typescript
const companyIds = await getAccessibleCompanyIds(user);
const filter = buildTenantFilter(companyIds);
const logs = await prisma.inboundWebhook.findMany({
  where: { ...filter, ...outrosFiltros },
});
```

### `assertCompanyAccess(user: TenantUser, companyId: string): Promise<void>`

Verifica se o usuario tem acesso a uma empresa especifica. Super admin sempre passa. Para demais, chama `getAccessibleCompanyIds()` e verifica se o `companyId` esta na lista. Lanca `Error('Acesso negado: voce nao tem permissao para acessar esta empresa.')` se nao tiver acesso.

**Uso:** Antes de qualquer operacao em uma empresa especifica (CRUD de rotas, credenciais, etc.).

### `getUserCompanyRole(user: TenantUser, companyId: string): Promise<string | null>`

Retorna o role do usuario em uma empresa especifica. Se super admin, retorna `'super_admin'`. Se nao tem membership ou membership inativa, retorna `null`. Caso contrario, retorna o valor de `CompanyRole` (`company_admin`, `manager`, `viewer`).

**Uso:** Para determinar nivel de permissao na UI (o que mostrar/esconder) e no backend (o que permitir).

## Referencia no Nexus

### Logica e Actions
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/lib/tenant.ts`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/lib/actions/company.ts`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/lib/validations/company.ts`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/lib/utils/slugify.ts`

### Navegacao
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/lib/constants/navigation.ts`

### Paginas
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/page.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/page.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/loading.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/routes/page.tsx`

### Componentes
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/_components/company-list.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/_components/company-card.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/_components/company-status-badge.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/_components/create-company-dialog.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/company-header.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/company-tabs.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/overview-tab.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/overview/overview-stats.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/overview/overview-chart.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/overview/overview-routes.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/credentials-tab.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/credential-form.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/sensitive-field.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/logs-tab.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/logs/log-table.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/logs/log-filters.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/logs/log-row-detail.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/logs/log-status-badge.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/members-tab.tsx`
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/src/app/(protected)/companies/[id]/_components/edit-company-dialog.tsx`

### Schema
- `/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta/prisma/schema.prisma`

## Customizacoes por plataforma

| Aspecto | Padrao Nexus | Alternativas comuns |
|---------|-------------|---------------------|
| Entidade principal | "Empresa" | "Workspace", "Organizacao", "Conta", "Projeto" |
| Slug | Gerado do nome, editavel | Fixo, ou subdomain-based |
| Webhook key | nanoid(21), customizavel | UUID, API key com prefixo |
| Roles na empresa | super_admin, company_admin, manager, viewer | Customizar conforme dominio (ex: editor, billing_admin) |
| Campos extras | logoUrl | Endereco, CNPJ, plano, limites de uso, dominio customizado |
| Soft delete | isActive flag | deletedAt timestamp, ou hard delete |
| Auto-vinculacao | Super admins auto-vinculados como company_admin | Opcional, ou vincular apenas o criador |
| Criacao | Apenas super admin | Self-service (qualquer usuario cria) |

## Seguranca

### Isolamento de tenant
- **Todas as queries de dados** (logs, rotas, deliveries, credenciais) passam por `buildTenantFilter()` que injeta `companyId IN (...)` no WHERE.
- **Operacoes em empresa especifica** usam `assertCompanyAccess()` que lanca erro se o usuario nao tem membership ativa.
- **Super admin bypassa** todas as restricoes -- `getAccessibleCompanyIds()` retorna `undefined`, que gera filtro vazio `{}`.

### Controle de acesso hierarquico
- `super_admin` (plataforma): acesso total, nao precisa de membership.
- `company_admin`: edita empresa, gerencia membros e credenciais.
- `manager`: gerencia rotas de webhook, ve logs.
- `viewer`: apenas leitura (read-only em todas as tabs).

### Protecoes especificas
- **Criacao de empresa:** restrita a super admin no backend (`createCompany` verifica `isSuperAdmin`).
- **Exclusao de empresa:** restrita a super admin, com cascade manual em transacao atomica (`$transaction`).
- **Webhook key unica:** validada antes de criar/atualizar para evitar conflito de roteamento.
- **Slug unico:** validado com fallback para sufixo nanoid(6) em caso de colisao.
- **Membership com onDelete: Restrict:** impede exclusao acidental de User ou Company via ORM -- a exclusao deve ser explicita via transacao.
- **Super admin auto-vinculado:** ao criar empresa, todos os super admins sao automaticamente adicionados como `company_admin`, garantindo que nunca perdem acesso.
- **Soft delete preferencial:** `isActive: false` desativa empresa sem perder dados. Hard delete disponivel apenas para super admin com cascade completo.
