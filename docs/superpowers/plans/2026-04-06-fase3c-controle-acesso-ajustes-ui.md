# Fase 3C — Controle de Acesso, Seguranca, Ajustes UI e UX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar controle de acesso completo (frontend + backend) por role, corrigir falhas criticas de seguranca em webhook-routes e logs, fix bug de alteracao de nivel, e aplicar melhorias de UX em membros/usuarios/overview/toasts.

**Architecture:** Abordagem permission-driven: PRIMEIRO proteger as server actions (backend), DEPOIS esconder botoes na UI (frontend). O controle de acesso usa `User.isSuperAdmin` (flag global) e `UserCompanyMembership.role` (company_admin, manager, viewer). O nivel do usuario e GLOBAL: ao mudar em /users, propaga para todas as memberships. A aba Membros permite override pontual por empresa.

**Tech Stack:** Next.js 14+ (App Router, Server Actions), Prisma v7 (`@/generated/prisma/client`), NextAuth v5, Tailwind CSS, Framer Motion, sonner

---

## Decisao Arquitetural: Nivel e Global

O nivel do usuario (Super Admin, Admin, Gerente, Visualizador) e um atributo GLOBAL — se aplica igualmente a TODAS as empresas onde o usuario tem membership.

**Quando o admin muda o nivel de um usuario na pagina /users** (ex: viewer → gerente), o sistema:
1. Atualiza `User.isSuperAdmin` (true apenas para super_admin)
2. Atualiza `UserCompanyMembership.role` em TODAS as memberships desse usuario para o novo role

**Justificativa:** A plataforma tem poucos usuarios e o controle deve ser simples e centralizado. Se no futuro precisar de granularidade por empresa (ex: admin na Empresa A, viewer na Empresa B), a aba Membros do card da empresa ja permite isso como override. Mas o fluxo padrao e: nivel definido globalmente em /users.

**Consequencia para a aba Membros:** O select de papel na aba Membros TAMBEM funciona, mas altera APENAS a membership daquela empresa especifica (nao propaga para outras). Isso permite override pontual quando necessario.

---

## Diretriz de UI/UX

**OBRIGATORIO:** Toda task que envolve layout, componentes visuais ou frontend DEVE usar o skill `ui-ux-pro-max` para garantir consistencia com o design system da plataforma (cores roxas Nexus AI, dark/light mode, Framer Motion, componentes shadcn/base-ui).

**Brand:** Cor primaria violet (#7c3aed dark, #6d28d9 light). Acoes destrutivas em vermelho. Acoes de alerta/desativar em amarelo/amber. CSS variables para suporte a temas.

---

## Matriz de Permissoes

### Legenda
- **V** = Pode ver | **C** = Pode criar | **E** = Pode editar | **D** = Pode deletar | **—** = Sem acesso

### Paginas e Acoes

| Tela / Acao | Super Admin | Admin (company_admin) | Gerente (manager) | Visualizador (viewer) |
|-------------|------------|----------------------|-------------------|----------------------|
| **Dashboard** | V (todas empresas) | V (suas empresas) | V (suas empresas) | V (suas empresas) |
| **Empresas — lista** | V (todas) | V (suas) | V (suas) | V (suas) |
| **Empresas — criar** | C | — | — | — |
| **Empresa — editar nome/logo** | E | E | — | — |
| **Empresa — desativar** | E | E | — | — |
| **Empresa — excluir** | D | — | — | — |
| **WhatsApp Cloud — ver credenciais (mascaradas)** | V | V | V | V (so sufixo) |
| **WhatsApp Cloud — revelar chave** | V | V | — | — |
| **WhatsApp Cloud — editar credenciais** | E | E | — | — |
| **WhatsApp Cloud — editar slug** | E | E | — | — |
| **Rotas — listar** | V | V | V | V |
| **Rotas — criar** | C | C | C | — |
| **Rotas — editar** | E | E | E | — |
| **Rotas — excluir/toggle** | D | D | D | — |
| **Logs — ver** | V | V | V | V |
| **Logs — filtrar** | V | V | V | V |
| **Membros — listar** | V | V | V | V |
| **Membros — adicionar** | C | C | — | — |
| **Membros — mudar papel** | E | E | — | — |
| **Membros — remover** | D | D | — | — |
| **Usuarios (/users)** | V/C/E/D | V/C/E/D (hierarquia) | — (sem acesso a pagina) | — |
| **Configuracoes (/settings)** | V/E | — | — | — |
| **Perfil** | V/E (proprio) | V/E (proprio) | V/E (proprio) | V/E (proprio) |

### Regra de Ouro
- **Frontend:** Esconder botoes/acoes que o usuario nao pode executar
- **Backend:** NEGAR a operacao na server action, MESMO que o frontend nao esconda. Seguranca e server-side.

---

## Mapa de Arquivos

### Seguranca (Backend — PRIORIDADE MAXIMA)
- `src/lib/actions/webhook-routes.ts` — Adicionar getCurrentUser + assertCompanyAccess + role check em TODAS as 6 funcoes
- `src/lib/actions/logs.ts` — Adicionar getCurrentUser + assertCompanyAccess em TODAS as 4 funcoes
- `src/lib/actions/users.ts` — Fix bug updateUser (propagar role global para todas memberships) + reforcar hierarquia backend (admin nao edita super admin, manager/viewer sem acesso a actions de usuario)
- `src/lib/actions/company.ts` — Adicionar deleteCompany + role check para manager/viewer em updateCompany + slug editavel
- `src/lib/actions/credential.ts` — Negar upsertCredential para manager/viewer no backend + garantir que viewer nao revela chaves completas
- `src/lib/tenant.ts` — Adicionar helper `getUserCompanyRole` se nao existir

### UI (Frontend)
- `src/app/(protected)/companies/page.tsx` — Esconder "Nova Empresa" para nao-super-admin
- `src/app/(protected)/companies/[id]/page.tsx` — Passar `userRole` e `canEdit` para sub-componentes
- `src/app/(protected)/companies/[id]/_components/company-tabs.tsx` — Esconder "Editar" para viewer/manager
- `src/app/(protected)/companies/[id]/_components/credential-form.tsx` — Slug editavel + read-only para viewer
- `src/app/(protected)/companies/[id]/_components/members-tab.tsx` — Remover Status, fix z-index, esconder acoes
- `src/app/(protected)/companies/[id]/_components/overview-tab.tsx` — Compactar Informacoes
- `src/app/(protected)/companies/[id]/_components/edit-company-dialog.tsx` — Botao excluir empresa
- `src/app/(protected)/users/users-content.tsx` — Selects inline, remover mudanca de role (so super admin toggle)
- `src/components/routes/route-list.tsx` — Esconder criar/editar/deletar para viewer
- `src/components/routes/route-form-dialog.tsx` — Fix focus ring
- `src/components/dashboard/dashboard-content.tsx` — Mensagem sem empresas
- `src/app/(protected)/companies/_components/company-list.tsx` — Mensagem viewer sem vinculo
- `src/components/ui/custom-select.tsx` — Fix z-index (fixed positioning)
- `src/components/ui/sonner.tsx` — Redesenhar toast
- `src/app/globals.css` — CSS toast progress bar

---

## Task 1: SEGURANCA — Proteger webhook-routes.ts (CRITICO)

**Files:**
- Modify: `src/lib/actions/webhook-routes.ts`

**Problema:** ZERO checks de permissao. Qualquer usuario autenticado pode criar/editar/deletar rotas de QUALQUER empresa.

- [ ] **Step 1: Ler webhook-routes.ts completo**

Identificar todas as 6 funcoes: createWebhookRoute, updateWebhookRoute, hardDeleteWebhookRoute, toggleWebhookRouteActive, listWebhookRoutes, getWebhookRoute.

- [ ] **Step 2: Adicionar imports necessarios**

No topo do arquivo, adicionar:
```typescript
import { getCurrentUser } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
```

(Verificar quais ja existem)

- [ ] **Step 3: Proteger funcoes de LEITURA (list e get)**

Em `listWebhookRoutes` e `getWebhookRoute`, adicionar no inicio:
```typescript
const user = await getCurrentUser();
if (!user) return { success: false, error: "Nao autenticado" };
await assertCompanyAccess(user, companyId);
```

Qualquer role com membership ativa pode VER rotas (viewer, manager, admin).

- [ ] **Step 4: Proteger funcoes de MUTACAO (create, update, delete, toggle)**

Em `createWebhookRoute`, `updateWebhookRoute`, `hardDeleteWebhookRoute`, `toggleWebhookRouteActive`, adicionar:
```typescript
const user = await getCurrentUser();
if (!user) return { success: false, error: "Nao autenticado" };

// Verificar acesso a empresa
await assertCompanyAccess(user, companyId);

// Viewer nao pode mutar rotas
if (!user.isSuperAdmin) {
  const membership = await prisma.userCompanyMembership.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
    select: { role: true },
  });
  if (!membership || membership.role === "viewer") {
    return { success: false, error: "Sem permissao para esta acao" };
  }
}
```

Isso permite super_admin, company_admin e manager mutarem rotas. Viewer e bloqueado.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/webhook-routes.ts
git commit -m "security: adiciona controle de acesso em todas as funcoes de webhook-routes"
```

---

## Task 2: SEGURANCA — Proteger logs.ts (CRITICO)

**Files:**
- Modify: `src/lib/actions/logs.ts`

**Problema:** ZERO checks de permissao. Qualquer usuario pode ler logs de qualquer empresa.

- [ ] **Step 1: Adicionar checks em todas as 4 funcoes**

Em `getWebhookLogs`, `getWebhookLogDetail`, `getAvailableEventTypes`, `getAvailableRoutes`:

```typescript
const user = await getCurrentUser();
if (!user) throw new Error("Nao autenticado");
await assertCompanyAccess(user, companyId); // ou filters.companyId
```

Todos os roles com membership ativa podem VER logs (incluindo viewer) — logs sao read-only.

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/logs.ts
git commit -m "security: adiciona controle de acesso em todas as funcoes de logs"
```

---

## Task 3: Fix Bug — updateUser (nivel nao muda)

**Files:**
- Modify: `src/lib/actions/users.ts`

**Bug:** `updateUser` recebe `parsed.role` (ex: "manager") mas so atualiza `User.isSuperAdmin`. NAO atualiza `UserCompanyMembership.role`. Resultado: nivel nunca muda no frontend porque `highestRole` e derivado das memberships.

**Conforme decisao arquitetural:** O nivel e GLOBAL. Ao mudar via /users, propaga para TODAS as memberships.

- [ ] **Step 1: Substituir o bloco de update por transacao**

No `updateUser`, localizar o `await prisma.user.update(...)` e substituir por:

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Atualizar dados do usuario
  await tx.user.update({ where: { id: userId }, data: updateData });

  // 2. Se role mudou, propagar para TODAS as memberships (nivel e global)
  if (parsed.role !== undefined) {
    if (parsed.role === "super_admin") {
      // Super admin: todas memberships viram company_admin
      await tx.userCompanyMembership.updateMany({
        where: { userId },
        data: { role: "company_admin" },
      });
    } else {
      // Qualquer outro role: propagar globalmente
      await tx.userCompanyMembership.updateMany({
        where: { userId },
        data: { role: parsed.role as "company_admin" | "manager" | "viewer" },
      });
    }
  }
});
```

Isso garante que ao mudar viewer → gerente em /users, TODAS as memberships do usuario sao atualizadas para "manager".

- [ ] **Step 2: Reforcar hierarquia backend em users.ts**

Validar que as seguintes regras existem E estao corretas nas server actions de users.ts. Se alguma estiver faltando, adicionar:

**Em `getUsers`, `createUser`, `updateUser`, `deleteUser`:**
```typescript
// Somente super_admin ou company_admin pode acessar
const user = await getCurrentUser();
if (!user) return { success: false, error: "Nao autenticado" };
if (!user.isSuperAdmin) {
  // Verificar se e company_admin de ALGUMA empresa
  const adminMembership = await prisma.userCompanyMembership.findFirst({
    where: { userId: user.id, role: "company_admin", isActive: true },
  });
  if (!adminMembership) {
    return { success: false, error: "Sem permissao" };
  }
}
```

**Em `updateUser` — regras de hierarquia:**
- Admin NAO pode editar super admin (ja existe, verificar)
- Admin NAO pode promover ninguem a super admin (ja existe, verificar)
- Admin NAO pode editar outro admin (ja existe, verificar)
- Ninguem pode alterar a si mesmo via updateUser (adicionar check: `if (userId === user.id) return error`)
- Manager e viewer NAO podem chamar updateUser de jeito nenhum (garantir no check inicial)

**Em `deleteUser`:**
- Super admin NAO pode ser deletado (ja existe, verificar)
- Admin NAO pode deletar super admin (ja existe, verificar)

Verificar CADA regra no codigo existente. Se ja existir, manter. Se faltar, adicionar.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/users.ts
git commit -m "fix: updateUser propaga role global + reforco hierarquia backend"
```

---

## Task 4: Backend — Adicionar deleteCompany + reforcar role checks

**Files:**
- Modify: `src/lib/actions/company.ts`

- [ ] **Step 1: Criar funcao deleteCompany**

Apenas super admin pode excluir. Deletar em cascata com transacao:

```typescript
export async function deleteCompany(companyId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };
    if (!user.isSuperAdmin) {
      return { success: false, error: "Apenas Super Admin pode excluir empresas" };
    }

    await prisma.$transaction(async (tx) => {
      const routes = await tx.webhookRoute.findMany({
        where: { companyId },
        select: { id: true },
      });
      const routeIds = routes.map((r) => r.id);

      if (routeIds.length > 0) {
        await tx.deliveryAttempt.deleteMany({
          where: { delivery: { routeId: { in: routeIds } } },
        });
        await tx.routeDelivery.deleteMany({
          where: { routeId: { in: routeIds } },
        });
      }

      await tx.webhookRoute.deleteMany({ where: { companyId } });
      await tx.inboundWebhook.deleteMany({ where: { companyId } });
      await tx.companyCredential.deleteMany({ where: { companyId } });
      await tx.notification.deleteMany({ where: { companyId } });
      await tx.auditLog.deleteMany({ where: { companyId } });
      await tx.userCompanyMembership.deleteMany({ where: { companyId } });
      await tx.company.delete({ where: { id: companyId } });
    });

    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir empresa:", error);
    return { success: false, error: "Erro ao excluir empresa" };
  }
}
```

- [ ] **Step 2: Garantir que updateCompany verifica role**

O `updateCompany` ja verifica `isSuperAdmin || company_admin`. Verificar que manager e viewer sao bloqueados. Se nao, adicionar check:

```typescript
if (!user.isSuperAdmin) {
  const membership = await prisma.userCompanyMembership.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
    select: { role: true },
  });
  if (!membership || membership.role !== "company_admin") {
    return { success: false, error: "Sem permissao" };
  }
}
```

- [ ] **Step 3: Adicionar suporte a slug na updateCompany**

Verificar se o schema de validacao aceita `slug`. Se nao, adicionar:
```typescript
slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/).optional(),
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/company.ts
git commit -m "feat: deleteCompany + reforco de permissoes + slug editavel"
```

---

## Task 4B: SEGURANCA — Proteger credential.ts (manager/viewer nao pode editar)

**Files:**
- Modify: `src/lib/actions/credential.ts`

**Contexto:** A auditoria mostrou que `upsertCredential` e `revealCredentialField` ja verificam role (super_admin ou company_admin). Porem, conforme a regra de ouro do plano ("backend nega mesmo que a UI esconda"), esta task VALIDA e REFORCA esses checks com a mesma clareza das Tasks 1 e 2.

- [ ] **Step 1: Validar checks existentes em upsertCredential**

Ler a funcao `upsertCredential` em `credential.ts`. Verificar que:
- Chama `getCurrentUser()` — se nao, adicionar
- Chama `assertCompanyAccess(user, companyId)` — se nao, adicionar
- Verifica que APENAS super_admin ou company_admin podem executar — se nao, adicionar:

```typescript
if (!user.isSuperAdmin) {
  const membership = await prisma.userCompanyMembership.findUnique({
    where: { userId_companyId: { userId: user.id, companyId } },
    select: { role: true },
  });
  if (!membership || membership.role !== "company_admin") {
    return { success: false, error: "Apenas administradores podem editar credenciais" };
  }
}
```

Manager e viewer sao BLOQUEADOS no backend, nao so na UI.

- [ ] **Step 2: Validar checks existentes em revealCredentialField**

Mesma validacao: super_admin ou company_admin apenas. Manager e viewer NAO podem revelar chaves completas.

- [ ] **Step 3: Validar getCredential**

`getCredential` retorna dados MASCARADOS (****...e6d5). Qualquer role com membership ativa pode chamar (viewer incluso). Verificar que `assertCompanyAccess` esta presente.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/credential.ts
git commit -m "security: valida e reforca permissoes em credential.ts (manager/viewer bloqueados)"
```

---

## Task 5: Acesso direto por URL — Validar, reforcar e mensagens amigaveis

**Files:**
- Modify: `src/app/(protected)/companies/[id]/page.tsx`
- Modify: `src/components/dashboard/dashboard-content.tsx`
- Modify: `src/app/(protected)/companies/_components/company-list.tsx`

**Esta task VALIDA (nao assume) que o acesso por URL esta protegido, e adiciona mensagens amigaveis.**

**Cenarios de acesso por URL a validar:**
1. **Usuario sem membership tenta `/companies/[id]`** → Validar que `getCompanyById` retorna erro e a page chama `notFound()`. LER o codigo e confirmar. Se nao estiver protegido, adicionar check.
2. **Usuario sem membership tenta `/companies/[id]/routes`** → Validar que a mesma protecao se aplica (a page usa o mesmo getCompanyById? ou e independente?). Se for rota separada, verificar.
3. **Viewer sem nenhuma empresa acessa `/dashboard`** → Dashboard retorna dados vazios (nao erro). Precisa de mensagem amigavel.
4. **Viewer sem nenhuma empresa acessa `/companies`** → Lista vazia. Precisa de mensagem diferente de "Crie sua primeira empresa".
5. **Manager/viewer tenta acessar `/users`** → Validar que a page bloqueia. Se nao, adicionar redirect.
6. **Manager/viewer tenta acessar `/settings`** → Validar que a page bloqueia.

- [ ] **Step 1: Mensagem amigavel no dashboard**

No `dashboard-content.tsx`, quando `companies.length === 0`, mostrar:

```tsx
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  className="flex flex-col items-center justify-center py-20 text-center"
>
  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
    <Building2 className="h-8 w-8 text-muted-foreground" />
  </div>
  <h3 className="text-lg font-semibold text-foreground mb-2">
    Nenhuma empresa vinculada
  </h3>
  <p className="text-sm text-muted-foreground max-w-md">
    Para visualizar os dados do dashboard, voce precisa estar vinculado a pelo menos uma empresa. Entre em contato com o administrador do sistema.
  </p>
</motion.div>
```

- [ ] **Step 2: Mensagem amigavel na lista de empresas**

No `company-list.tsx`, receber prop `isSuperAdmin: boolean`. Se nao e super admin e lista esta vazia:

```tsx
<div className="flex flex-col items-center justify-center py-20 text-center">
  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
    <Building2 className="h-8 w-8 text-muted-foreground" />
  </div>
  <h3 className="text-lg font-semibold text-foreground mb-2">
    Sem acesso a empresas
  </h3>
  <p className="text-sm text-muted-foreground max-w-md">
    Voce ainda nao esta vinculado a nenhuma empresa. Solicite ao administrador que adicione voce como membro de uma empresa.
  </p>
</div>
```

Se e super admin e lista vazia (nenhuma empresa existe):
```tsx
<p className="text-sm text-muted-foreground">
  Nenhuma empresa cadastrada. Crie sua primeira empresa para comecar.
</p>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/dashboard-content.tsx src/app/(protected)/companies/_components/company-list.tsx src/app/(protected)/companies/[id]/page.tsx
git commit -m "feat: mensagens amigaveis para usuarios sem empresas vinculadas"
```

---

## Task 6: Frontend — Esconder acoes por role (Matriz de Permissoes)

**Files:**
- Modify: `src/app/(protected)/companies/page.tsx`
- Modify: `src/app/(protected)/companies/[id]/page.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/company-tabs.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/members-tab.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/credential-form.tsx`
- Modify: `src/components/routes/route-list.tsx`

- [ ] **Step 1: Determinar role do usuario no page.tsx da empresa**

No `src/app/(protected)/companies/[id]/page.tsx` (server component), apos carregar a empresa:

```typescript
const session = await auth();
const userId = (session?.user as any)?.id;
const isSuperAdmin = (session?.user as any)?.isSuperAdmin ?? false;

let userRole: string = "viewer";
if (isSuperAdmin) {
  userRole = "super_admin";
} else if (userId) {
  const membership = await prisma.userCompanyMembership.findUnique({
    where: { userId_companyId: { userId, companyId: id } },
    select: { role: true },
  });
  if (membership) userRole = membership.role;
}

const canEdit = userRole === "super_admin" || userRole === "company_admin";
const canManageRoutes = canEdit || userRole === "manager";
const canDelete = userRole === "super_admin";
```

Passar `canEdit`, `canManageRoutes`, `canDelete` como props para CompanyTabs.

- [ ] **Step 2: Esconder "Nova Empresa" para nao-super-admin**

No `companies/page.tsx`:
```tsx
{isSuperAdmin && <CreateCompanyDialog />}
```

- [ ] **Step 3: Propagar props para sub-componentes**

CompanyTabs recebe `canEdit`, `canManageRoutes`, `canDelete` e passa para:
- Header: esconder "Editar" se `!canEdit`
- RouteList: esconder "Nova Rota", editar, excluir se `!canManageRoutes`
- MembersTab: esconder "Adicionar Membro", select de papel, lixeira se `!canEdit`
- CredentialForm: campos disabled se `!canEdit`

- [ ] **Step 4: WhatsApp Cloud — preservar mascara para viewer**

No `credential-form.tsx`, viewer pode VER credenciais mascaradas (****...e6d5) mas NAO pode:
- Clicar no olho para revelar (esconder botao olho se `!canEdit`)
- Editar campos (disabled)
- Salvar (esconder botao)

O comportamento atual de `revealCredentialField` ja exige company_admin no backend — so precisamos esconder o botao no frontend.

- [ ] **Step 5: Commit**

```bash
git add src/app/(protected)/companies/
git commit -m "feat: esconde acoes por role (viewer read-only, manager pode editar rotas)"
```

---

## Task 7: Compactar Informacoes + Slug WhatsApp Cloud

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/overview-tab.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/credential-form.tsx`

- [ ] **Step 1: Compactar card Informacoes em grid horizontal**

Substituir o layout vertical (space-y-3) por grid 3 colunas:

```tsx
<Card className="bg-card border border-border rounded-xl">
  <CardContent className="py-4 px-5">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Slug</p>
        <p className="text-sm text-foreground font-mono">/{company.slug}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Webhook Key</p>
        <p className="text-sm text-foreground font-mono truncate">{company.webhookKey}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Criada em</p>
        <p className="text-sm text-foreground">
          {format(new Date(company.createdAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>
    </div>
  </CardContent>
</Card>
```

Reduzir gap entre grafico+rotas e informacoes de `space-y-6` para `space-y-4`.

- [ ] **Step 2: Adicionar campo Slug editavel no WhatsApp Cloud**

No `credential-form.tsx`, adicionar secao de slug ANTES dos campos de credencial:

```tsx
<Card className="bg-card border border-border rounded-xl">
  <CardContent className="py-4 px-5 space-y-3">
    <div className="flex items-center gap-2">
      <Link2 className="h-4 w-4 text-violet-400" />
      <h3 className="text-sm font-medium text-foreground">Slug do Webhook</h3>
    </div>
    <p className="text-xs text-muted-foreground">
      Define o caminho personalizado do webhook. A URL completa sera: /api/webhook/{"{slug}"}
    </p>
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground font-mono">/</span>
      <Input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!canEdit} className={inputClasses} />
      {canEdit && (
        <Button onClick={handleSaveSlug} disabled={isPending || slug === company.slug} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
          Salvar
        </Button>
      )}
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/companies/[id]/_components/overview-tab.tsx src/app/(protected)/companies/[id]/_components/credential-form.tsx
git commit -m "feat: informacoes compactas + slug editavel no WhatsApp Cloud"
```

---

## Task 8: Membros — Remover Status + Fix CustomSelect z-index

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/members-tab.tsx`
- Modify: `src/components/ui/custom-select.tsx`

- [ ] **Step 1: Remover coluna Status da tabela de membros**

Remover `<TableHead>Status</TableHead>` e a `<TableCell>` correspondente com o Badge Ativo/Inativo.

- [ ] **Step 2: Fix CustomSelect para sobrepor tabela**

O dropdown do CustomSelect usa `position: absolute` que e cortado por containers com `overflow: hidden/auto`. Mudar para `position: fixed` com calculo de posicao via `getBoundingClientRect()`:

```tsx
const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

function handleOpen() {
  if (ref.current) {
    const rect = ref.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 100,
    });
  }
  setOpen(true);
}
```

No JSX do dropdown, aplicar `style={dropdownStyle}` e remover `className="absolute"`.

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/companies/[id]/_components/members-tab.tsx src/components/ui/custom-select.tsx
git commit -m "fix: remove coluna Status de membros + CustomSelect com fixed positioning"
```

---

## Task 9: Editar Empresa — Botao Excluir + Desativar amarelo

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/edit-company-dialog.tsx`

- [ ] **Step 1: Adicionar botao Excluir (vermelho) com AlertDialog**

So visivel para super admin (`canDelete` prop). Botao vermelho com icone Trash2. Ao clicar, abre AlertDialog de confirmacao.

```tsx
{canDelete && (
  <Button type="button" variant="ghost" onClick={() => setDeleteOpen(true)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
    <Trash2 className="h-4 w-4 mr-2" /> Excluir
  </Button>
)}
```

Botao Desativar muda para amarelo:
```tsx
<Button type="button" variant="ghost" onClick={handleToggleActive} className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
  {company.isActive ? "Desativar" : "Reativar"}
</Button>
```

AlertDialog:
```tsx
<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Excluir empresa permanentemente?</AlertDialogTitle>
      <AlertDialogDescription>
        Esta acao e irreversivel. Todos os dados serao removidos: credenciais, rotas, logs, membros e configuracoes.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
        Excluir permanentemente
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 2: Implementar handleDelete**

```typescript
async function handleDelete() {
  startTransition(async () => {
    const result = await deleteCompany(company.id);
    if (result.success) {
      toast.success("Empresa excluida");
      router.push("/companies");
    } else {
      toast.error(result.error || "Erro ao excluir");
    }
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/companies/[id]/_components/edit-company-dialog.tsx
git commit -m "feat: botao excluir empresa (vermelho) + desativar amarelo no dialog editar"
```

---

## Task 10: Usuarios — Selects inline para Nivel e Status

**Files:**
- Modify: `src/app/(protected)/users/users-content.tsx`

**Conforme decisao arquitetural:** A mudanca de nivel em /users e GLOBAL. Ao trocar viewer → gerente, o `updateUser` (corrigido na Task 3) propaga para todas as memberships. O select inline chama a mesma funcao que o dialog de edicao.

- [ ] **Step 1: Substituir badge de Nivel por CustomSelect inline**

Na tabela, a coluna "Nivel" mostra um badge estatico. Substituir por CustomSelect que permite mudar o nivel inline.

Regras:
- **Super admin editando outro usuario:** Mostra CustomSelect com todas as opcoes (super_admin, company_admin, manager, viewer)
- **Admin editando:** Mostra CustomSelect SEM opcao super_admin
- **Editando a si mesmo:** Badge estatico (nao pode mudar o proprio nivel inline)
- **Super admin sendo exibido para nao-super-admin:** Badge estatico (nao pode downgradar)

O `onChange` chama `updateUser(userId, { role })` que propaga globalmente via Task 3.

- [ ] **Step 2: Substituir badge de Status por CustomSelect inline**

A coluna "Status" mostra Ativo/Inativo. Substituir por CustomSelect com 2 opcoes.

Regras:
- **Super admin:** Sempre mostra badge "Ativo" estatico (NUNCA pode ser inativado — protecao backend + frontend)
- **Outros usuarios:** CustomSelect com opcoes "Ativo" / "Inativo"
- **Editando a si mesmo:** Badge estatico (nao pode inativar a si mesmo)

- [ ] **Step 3: Implementar handlers**

```typescript
async function handleInlineRoleChange(userId: string, role: string) {
  const result = await updateUser(userId, { role: role as any });
  if (result.success) {
    toast.success("Nivel atualizado");
    await loadUsers();
  } else {
    toast.error(result.error || "Erro ao atualizar");
  }
}

async function handleInlineStatusChange(userId: string, isActive: boolean) {
  const result = await updateUser(userId, { isActive });
  if (result.success) {
    toast.success(isActive ? "Usuario ativado" : "Usuario inativado");
    await loadUsers();
  } else {
    toast.error(result.error || "Erro ao atualizar");
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(protected)/users/users-content.tsx
git commit -m "feat: selects inline na tabela de usuarios para nivel e status"
```

---

## Task 11: Fix focus ring cortado nos dialogs

**Files:**
- Modify: `src/components/routes/route-form-dialog.tsx`

- [ ] **Step 1: Aumentar padding do ScrollArea**

De `px-3 pr-5` para `px-5 pr-6`:
```tsx
<ScrollArea className="h-[60vh] px-5 pr-6">
```

Remover `overflow-hidden` do DialogContent se existir.

- [ ] **Step 2: Commit**

```bash
git add src/components/routes/route-form-dialog.tsx
git commit -m "fix: aumenta padding no dialog de rotas para focus ring completo"
```

---

## Task 12: Redesenhar Toast com progress bar animada

**Files:**
- Modify: `src/components/ui/sonner.tsx`
- Modify: `src/app/globals.css`

**Criterios de aceite:**
1. A barra de progresso DEVE avancar visualmente da esquerda para a direita ao longo de toda a duracao do toast (4s). Quando chega ao fim, o toast desaparece.
2. O botao X DEVE fechar o toast manualmente antes do tempo, com touch target minimo de 28x28px para funcionar no mobile.
3. Layout minimalista: icone + texto + X. Sem ruido visual excessivo. Bordas arredondadas, sombra sutil.
4. A barra deve ter cor roxa (gradiente violet) e 3px de altura, posicionada no rodape do toast.
5. **Usar skill ui-ux-pro-max** para garantir consistencia visual com o design system.

- [ ] **Step 1: Atualizar CSS da progress bar**

No `globals.css`, substituir o CSS do toast:

```css
/* Toast progress bar animada — barra avanca da esquerda pra direita durante a duracao */
[data-sonner-toast] [data-progress] {
  height: 3px;
  background: linear-gradient(90deg, rgba(124, 58, 237, 0.7), rgba(168, 85, 247, 0.7));
  border-radius: 0 0 var(--border-radius) var(--border-radius);
  transition: width 100ms linear;
}

/* Toast close button — touch target adequado para mobile */
[data-sonner-toast] [data-close-button] {
  min-width: 28px;
  min-height: 28px;
}
```

- [ ] **Step 2: Atualizar sonner.tsx para layout minimalista**

```tsx
toastOptions={{
  classNames: {
    toast: "cn-toast !rounded-xl !shadow-lg",
    closeButton: "!bg-muted !border-border !text-muted-foreground hover:!text-foreground !h-7 !w-7 !rounded-lg",
    title: "!text-sm !font-medium",
    description: "!text-xs !text-muted-foreground",
  },
  duration: 4000,
}}
```

Duration de 4 segundos. A barra de progresso percorre da esquerda para a direita em 4s. O X fecha imediatamente.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/sonner.tsx src/app/globals.css
git commit -m "feat: redesenha toasts com progress bar animada e layout minimalista"
```

---

## Task 13: Documentacao + Build + Deploy

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Atualizar CLAUDE.md**

Adicionar Fase 3C como concluida. Documentar:
- Falhas de seguranca corrigidas (webhook-routes, logs)
- Matriz de permissoes implementada
- deleteCompany adicionado
- Slug editavel no WhatsApp Cloud

- [ ] **Step 2: Build**

```bash
NEXT_LINT_DURING_BUILD=false npx next build
```

- [ ] **Step 3: Push e deploy**

```bash
git push origin main
```

- [ ] **Step 4: Checklist de verificacao em producao**

1. [ ] Login como viewer → dashboard mostra "Nenhuma empresa vinculada"
2. [ ] Viewer nao ve botao "Nova Empresa"
3. [ ] Viewer acessa empresa → nao pode editar, criar rotas, adicionar membros
4. [ ] Viewer ve credenciais mascaradas (****...e6d5) mas NAO pode revelar
5. [ ] Manager pode criar/editar/deletar rotas, mas NAO pode editar empresa ou membros
6. [ ] Super admin consegue mudar nivel de usuario → nivel muda de verdade
7. [ ] Select inline de nivel e status funciona na tabela de usuarios
8. [ ] Excluir empresa funciona (com AlertDialog)
9. [ ] Slug editavel no WhatsApp Cloud
10. [ ] CustomSelect em membros sobrepoe tabela (nao fica cortado)
11. [ ] Membros sem coluna Status
12. [ ] Informacoes compactas na visao geral
13. [ ] Focus ring aparece completo no dialog de rotas
14. [ ] Toast com progress bar animada
15. [ ] Acesso direto por URL de empresa sem permissao → 404

---

## Resumo

| # | Task | Tipo | Prioridade |
|---|------|------|-----------|
| 1 | Proteger webhook-routes.ts (6 funcoes) | SEGURANCA | CRITICA |
| 2 | Proteger logs.ts (4 funcoes) | SEGURANCA | CRITICA |
| 3 | Fix updateUser (propagar role global) + reforcar hierarquia backend | BUG + SEGURANCA | ALTA |
| 4 | deleteCompany + reforcar role checks em company.ts | BACKEND | ALTA |
| 4B | Validar e reforcar permissoes em credential.ts | SEGURANCA | ALTA |
| 5 | Validar acesso por URL + mensagens amigaveis sem empresas | SEGURANCA + UX | ALTA |
| 6 | Esconder acoes por role no frontend (viewer read-only) | PERMISSAO | ALTA |
| 7 | Compactar Informacoes + Slug editavel WhatsApp Cloud | UI | MEDIA |
| 8 | Membros: remover Status + fix CustomSelect z-index | UI | MEDIA |
| 9 | Excluir empresa (vermelho) + desativar (amarelo) | FEATURE | MEDIA |
| 10 | Selects inline na tabela de usuarios (nivel + status) | UX | MEDIA |
| 11 | Fix focus ring cortado nos dialogs | UI | BAIXA |
| 12 | Redesenhar toast com progress bar animada | UX | BAIXA |
| 13 | Docs + Build + Deploy + Checklist verificacao | INFRA | FINAL |
