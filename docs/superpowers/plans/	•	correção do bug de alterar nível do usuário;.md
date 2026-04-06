# Fase 3C — Controle de Acesso, Ajustes UI e Melhorias de UX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir controle de acesso por role (viewer/manager/admin), fix bug de alteracao de nivel, melhorar UX em membros/usuarios/overview, adicionar excluir empresa, campo slug no WhatsApp Cloud, e redesenhar toasts.

**Architecture:** O controle de acesso e bifurcado: `User.isSuperAdmin` define super admin global, enquanto `UserCompanyMembership.role` (company_admin/manager/viewer) define o papel por empresa. O bug principal e que `updateUser` so atualiza `isSuperAdmin` mas NAO atualiza memberships. Viewers devem ver dados (read-only) das empresas onde tem membership ativa, sem poder editar nada. O dashboard deve mostrar mensagem amigavel quando nao ha empresas vinculadas.

**Tech Stack:** Next.js 14+ (App Router, Server Actions), Prisma v7, NextAuth v5, Tailwind CSS, Framer Motion, sonner (toasts)

---

## Mapa de Arquivos

### Arquivos a Modificar
- `src/lib/actions/users.ts` — Fix bug updateUser + role handling
- `src/lib/actions/company.ts` — Adicionar deleteCompany action
- `src/lib/actions/credential.ts` — Adicionar campo slug na upsert
- `src/app/(protected)/companies/page.tsx` — Esconder botao Nova Empresa por role
- `src/app/(protected)/companies/_components/company-list.tsx` — Mensagem "sem empresas vinculadas" para viewer
- `src/app/(protected)/companies/[id]/page.tsx` — Passar role do usuario para sub-componentes
- `src/app/(protected)/companies/[id]/_components/company-tabs.tsx` — Condicionar botoes/acoes por role
- `src/app/(protected)/companies/[id]/_components/overview-tab.tsx` — Compactar Informacoes + reduzir gap
- `src/app/(protected)/companies/[id]/_components/credential-form.tsx` — Adicionar campo slug + read-only para viewer
- `src/app/(protected)/companies/[id]/_components/members-tab.tsx` — Remover coluna Status + fix z-index CustomSelect + esconder botoes para viewer
- `src/app/(protected)/companies/[id]/_components/edit-company-dialog.tsx` — Adicionar botao Excluir Empresa
- `src/app/(protected)/users/users-content.tsx` — Selects inline na tabela para Nivel e Status
- `src/components/ui/custom-select.tsx` — Fix z-index para sobrepor tabela
- `src/components/ui/sonner.tsx` — Redesenhar toast com progress bar animada
- `src/app/globals.css` — CSS para toast progress bar
- `src/components/routes/route-form-dialog.tsx` — Fix focus ring cortado
- `src/components/dashboard/dashboard-content.tsx` — Mensagem amigavel sem empresas

---

## Task 1: Fix Bug — updateUser nao altera nivel do usuario

**Files:**
- Modify: `src/lib/actions/users.ts`

**Bug:** `updateUser` recebe `parsed.role` (ex: "manager") mas so atualiza `User.isSuperAdmin`. NAO atualiza `UserCompanyMembership.role`. Resultado: nivel nunca muda.

**Fix:** Quando role muda e NAO e super_admin, atualizar TODAS as memberships do usuario para o novo role.

- [ ] **Step 1: Ler o codigo atual de updateUser**

Em `src/lib/actions/users.ts`, linhas 341-358, o codigo atual e:
```typescript
const updateData: any = {};
if (parsed.name !== undefined) updateData.name = parsed.name.trim();
if (parsed.email !== undefined) updateData.email = parsed.email.trim().toLowerCase();
if (parsed.password) {
  updateData.password = await hash(parsed.password, 10);
}
if (parsed.isActive !== undefined) updateData.isActive = parsed.isActive;
if (parsed.role !== undefined) {
  updateData.isSuperAdmin = parsed.role === "super_admin";
}

await prisma.user.update({ where: { id: userId }, data: updateData });
```

- [ ] **Step 2: Adicionar atualizacao de memberships apos update do user**

Substituir o bloco `await prisma.user.update(...)` por uma transacao que tambem atualiza memberships:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id: userId }, data: updateData });

  // Se role mudou e nao e super_admin, atualizar todas as memberships
  if (parsed.role !== undefined && parsed.role !== "super_admin") {
    const membershipRole = parsed.role as "company_admin" | "manager" | "viewer";
    await tx.userCompanyMembership.updateMany({
      where: { userId },
      data: { role: membershipRole },
    });
  }

  // Se promovido a super_admin, garantir que todas memberships ficam company_admin
  if (parsed.role === "super_admin") {
    await tx.userCompanyMembership.updateMany({
      where: { userId },
      data: { role: "company_admin" },
    });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/users.ts
git commit -m "fix: updateUser agora atualiza role nas memberships (nao so isSuperAdmin)"
```

---

## Task 2: Dashboard e Empresas — Mensagem amigavel para viewer sem empresas

**Files:**
- Modify: `src/components/dashboard/dashboard-content.tsx`
- Modify: `src/app/(protected)/companies/_components/company-list.tsx`

- [ ] **Step 1: Ler dashboard-content.tsx**

Ler o arquivo para encontrar onde o erro "Erro ao carregar dados do dashboard" e exibido e onde o estado vazio e tratado.

- [ ] **Step 2: Adicionar mensagem amigavel no dashboard quando companies esta vazio**

Quando `data.companies` retorna array vazio (viewer sem empresas vinculadas), mostrar mensagem profissional ao inves de erro. Verificar se o problema e que a funcao retorna erro ou dados vazios.

No dashboard-content.tsx, encontrar o bloco de erro e adicionar uma condicao: se `data` retornou com sucesso mas `companies` esta vazio, mostrar:

```tsx
{data && data.companies.length === 0 && (
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
      Voce precisa estar vinculado a pelo menos uma empresa para visualizar os dados do dashboard. Entre em contato com o administrador.
    </p>
  </motion.div>
)}
```

- [ ] **Step 3: Atualizar company-list.tsx para viewer sem empresas**

No `src/app/(protected)/companies/_components/company-list.tsx`, o estado vazio mostra "Nenhuma empresa cadastrada. Crie sua primeira empresa...". Para viewers, mudar a mensagem:

Receber uma prop `canCreate: boolean` e mostrar mensagem diferente:
```tsx
// Se nao pode criar (viewer/manager):
<p className="text-sm text-muted-foreground">
  Voce nao esta vinculado a nenhuma empresa. Entre em contato com o administrador para obter acesso.
</p>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/dashboard-content.tsx src/app/(protected)/companies/_components/company-list.tsx
git commit -m "feat: mensagem amigavel para viewer sem empresas no dashboard e lista"
```

---

## Task 3: Esconder botoes de acao para viewer

**Files:**
- Modify: `src/app/(protected)/companies/page.tsx`
- Modify: `src/app/(protected)/companies/[id]/page.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/company-tabs.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/members-tab.tsx`
- Modify: `src/components/routes/route-list.tsx`

**Regra:** Viewer so pode VER. Nao pode: criar empresa, editar empresa, criar/editar rotas, adicionar membros, mudar papeis.

- [ ] **Step 1: Passar role para componentes**

No `src/app/(protected)/companies/page.tsx`, obter o user da sessao e verificar se e super admin ou admin. Passar `canCreate` como prop para o componente de listagem.

No `src/app/(protected)/companies/[id]/page.tsx`, obter a membership do usuario nesta empresa para saber o role. Passar `userRole` como prop para `CompanyTabs`.

Para determinar o role na empresa: chamar a action que ja existe ou fazer query direta no layout. A forma mais simples: no server component, buscar a membership:

```typescript
import { prisma } from "@/lib/prisma";

// Dentro do page.tsx, apos obter session:
const membership = await prisma.userCompanyMembership.findUnique({
  where: { userId_companyId: { userId: session.user.id, companyId: id } },
  select: { role: true },
});
const userRole = isSuperAdmin ? "super_admin" : (membership?.role ?? "viewer");
const canEdit = userRole === "super_admin" || userRole === "company_admin";
```

- [ ] **Step 2: Esconder "Nova Empresa" para viewer**

No `companies/page.tsx`, so mostrar `<CreateCompanyDialog />` se `canCreate` (super admin apenas, conforme regra existente).

- [ ] **Step 3: Esconder "Editar" empresa e acoes de rota para viewer**

No `company-tabs.tsx` ou no componente header, esconder o botao "Editar" quando `!canEdit`.

No `route-list.tsx`, esconder o botao "Nova Rota" e os botoes de edicao/exclusao quando `!canEdit`.

- [ ] **Step 4: Esconder "Adicionar Membro" e select de papel para viewer**

No `members-tab.tsx`:
- Esconder botao "Adicionar Membro" quando `!canEdit`
- Trocar CustomSelect por texto simples do papel quando `!canEdit`
- Esconder botao de lixeira (remover membro) quando `!canEdit`

- [ ] **Step 5: Commit**

```bash
git add src/app/(protected)/companies/ src/components/routes/route-list.tsx
git commit -m "feat: esconde botoes de acao para viewer (read-only)"
```

---

## Task 4: Compactar Informacoes na Visao Geral + Reduzir gap

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/overview-tab.tsx`

- [ ] **Step 1: Ler overview-tab.tsx e identificar secao Informacoes**

Linhas 95-121: Card "Informacoes" com Slug, Webhook Key, Criada em em formato vertical (space-y-3).

- [ ] **Step 2: Compactar para layout horizontal (grid 3 colunas)**

Substituir o Card de Informacoes por um layout horizontal compacto:

```tsx
<motion.div variants={itemVariants}>
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
            {new Date(company.createdAt).toLocaleDateString("pt-BR", {
              day: "2-digit", month: "long", year: "numeric",
            })}
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
</motion.div>
```

- [ ] **Step 3: Reduzir gap entre Rotas e Informacoes**

No container principal, reduzir `space-y-6` ou `gap-6` para `gap-4` entre o grid de grafico+rotas e o card de informacoes.

- [ ] **Step 4: Commit**

```bash
git add src/app/(protected)/companies/[id]/_components/overview-tab.tsx
git commit -m "feat: compacta Informacoes em grid horizontal + reduz gap"
```

---

## Task 5: Campo Slug no WhatsApp Cloud

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/credential-form.tsx`
- Modify: `src/lib/actions/company.ts` (se necessario — slug ja existe no model Company)

O slug ja existe no modelo `Company` e e exibido na visao geral. O que o usuario quer e poder EDITAR o slug na aba WhatsApp Cloud, pois e la que se configura a integracao.

- [ ] **Step 1: Adicionar campo slug editavel na credential-form.tsx**

Antes dos campos de credencial, adicionar uma secao de slug. O slug pertence a Company (nao a Credential), entao precisamos de uma action separada ou incluir no form.

A abordagem mais simples: adicionar o campo slug no topo do form e chamar `updateCompany` ao salvar, separado das credenciais.

Adicionar acima do bloco de credenciais:

```tsx
{/* Slug do Webhook */}
<Card className="bg-card border border-border rounded-xl">
  <CardContent className="py-4 px-5 space-y-3">
    <div className="flex items-center gap-2 mb-2">
      <Link2 className="h-4 w-4 text-violet-400" />
      <h3 className="text-sm font-medium text-foreground">Slug do Webhook</h3>
    </div>
    <p className="text-xs text-muted-foreground">
      Define o caminho do webhook para esta empresa. A URL final sera: /api/webhook/{slug}
    </p>
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">/</span>
      <Input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder={company.slug}
        className={inputClasses}
        disabled={!canEdit}
      />
      <Button
        onClick={handleSaveSlug}
        disabled={isPending || slug === company.slug}
        size="sm"
        className="bg-violet-600 hover:bg-violet-700 text-white"
      >
        Salvar
      </Button>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 2: Implementar handleSaveSlug**

```typescript
const [slug, setSlug] = useState(company.slug);

async function handleSaveSlug() {
  startTransition(async () => {
    const result = await updateCompany(companyId, { slug });
    if (result.success) {
      toast.success("Slug atualizado");
    } else {
      toast.error(result.error || "Erro ao atualizar slug");
    }
  });
}
```

Nota: Verificar se `updateCompany` aceita `slug` como campo. Se nao, adicionar no schema de validacao.

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/companies/[id]/_components/credential-form.tsx src/lib/actions/company.ts
git commit -m "feat: campo slug editavel na aba WhatsApp Cloud"
```

---

## Task 6: Membros — Remover coluna Status + Fix CustomSelect z-index

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/members-tab.tsx`
- Modify: `src/components/ui/custom-select.tsx`

- [ ] **Step 1: Remover coluna Status da tabela de membros**

No `members-tab.tsx`:
- Remover `<TableHead>Status</TableHead>` (linha ~299)
- Remover `<TableCell>` com o Badge de Ativo/Inativo (linhas ~338-348)

- [ ] **Step 2: Fix CustomSelect z-index para sobrepor a tabela**

No `src/components/ui/custom-select.tsx`, o dropdown usa `z-50`. O problema e que a tabela ou seu container tem `overflow: hidden` que corta o dropdown.

Fix: adicionar `position: fixed` ou usar portal pattern no dropdown. A abordagem mais simples: mudar o dropdown para `fixed` positioning com calculo de posicao:

Na verdade, o fix mais simples e garantir que o container da tabela NAO tem `overflow: hidden`. Verificar no `members-tab.tsx` se a tabela esta dentro de um `<div className="overflow-x-auto">` e se isso esta cortando o dropdown.

Se o container tem `overflow-x-auto`, o dropdown precisa de `position: fixed` para escapar. Atualizar o CustomSelect para usar posicionamento fixo:

```tsx
// No custom-select.tsx, trocar o dropdown de absolute para fixed:
// Calcular posicao com useRef e getBoundingClientRect

const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

function openDropdown() {
  if (ref.current) {
    const rect = ref.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }
  setOpen(true);
}

// No JSX do dropdown:
<motion.div
  style={{
    position: 'fixed',
    top: dropdownPos.top,
    left: dropdownPos.left,
    width: dropdownPos.width,
  }}
  className="z-[100] rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/companies/[id]/_components/members-tab.tsx src/components/ui/custom-select.tsx
git commit -m "fix: remove coluna Status de membros + CustomSelect com fixed positioning"
```

---

## Task 7: Editar Empresa — Adicionar botao Excluir

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/edit-company-dialog.tsx`
- Modify: `src/lib/actions/company.ts`

- [ ] **Step 1: Criar action deleteCompany**

No `src/lib/actions/company.ts`, adicionar funcao `deleteCompany`:

```typescript
export async function deleteCompany(companyId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Nao autenticado" };
    if (!user.isSuperAdmin) {
      return { success: false, error: "Apenas Super Admin pode excluir empresas" };
    }

    // Deletar em cascata: memberships, credenciais, rotas, deliveries, logs
    await prisma.$transaction(async (tx) => {
      // Deletar deliveries e attempts das rotas
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

- [ ] **Step 2: Adicionar botao Excluir no dialog com AlertDialog de confirmacao**

No `edit-company-dialog.tsx`, adicionar um botao vermelho "Excluir Empresa" e um AlertDialog:

```tsx
<Button
  type="button"
  variant="ghost"
  onClick={() => setDeleteConfirmOpen(true)}
  disabled={isPending}
  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
>
  <Trash2 className="h-4 w-4 mr-2" />
  Excluir
</Button>
```

E o botao "Desativar" muda para amarelo:
```tsx
<Button
  type="button"
  variant="ghost"
  onClick={handleToggleActive}
  disabled={isPending}
  className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 cursor-pointer"
>
  {company.isActive ? "Desativar" : "Reativar"}
</Button>
```

AlertDialog de confirmacao:
```tsx
<AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Excluir empresa permanentemente?</AlertDialogTitle>
      <AlertDialogDescription>
        Esta acao nao pode ser desfeita. Todos os dados da empresa serao removidos: credenciais, rotas, logs, membros e configuracoes.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleDelete}
        className="bg-red-600 hover:bg-red-700 text-white"
      >
        Excluir permanentemente
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/company.ts src/app/(protected)/companies/[id]/_components/edit-company-dialog.tsx
git commit -m "feat: adiciona botao excluir empresa (com confirmacao) + desativar em amarelo"
```

---

## Task 8: Usuarios — Selects inline na tabela para Nivel e Status

**Files:**
- Modify: `src/app/(protected)/users/users-content.tsx`

- [ ] **Step 1: Substituir badge de Nivel por CustomSelect inline**

Na tabela de usuarios, substituir o badge estatico de role por um CustomSelect que permite mudar o nivel diretamente:

```tsx
<TableCell className="text-center">
  {user.highestRole === "Super Admin" && !isSuperAdmin ? (
    // Nao pode editar super admin se nao for super admin
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.bg}`}>
      <BadgeIcon className="h-3 w-3" />
      {user.highestRole}
    </span>
  ) : user.id === currentUserId ? (
    // Nao pode editar a si mesmo inline
    <span className={`...`}>{user.highestRole}</span>
  ) : (
    <CustomSelect
      value={mapRoleToValue(user.highestRole)}
      onChange={(val) => handleInlineRoleChange(user.id, val)}
      triggerClassName="h-7 text-xs w-32"
      options={availableRoles.map((r) => ({
        value: r.value,
        label: r.label,
        description: r.description,
      }))}
    />
  )}
</TableCell>
```

- [ ] **Step 2: Substituir badge de Status por toggle inline**

Substituir o badge de Ativo/Inativo por um CustomSelect com 2 opcoes:

```tsx
<TableCell className="text-center">
  {user.highestRole === "Super Admin" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
      <UserCheck className="h-3 w-3" />
      Ativo
    </span>
  ) : (
    <CustomSelect
      value={user.isActive ? "active" : "inactive"}
      onChange={(val) => handleInlineStatusChange(user.id, val === "active")}
      triggerClassName="h-7 text-xs w-24"
      options={[
        { value: "active", label: "Ativo" },
        { value: "inactive", label: "Inativo" },
      ]}
    />
  )}
</TableCell>
```

- [ ] **Step 3: Implementar handlers inline**

```typescript
async function handleInlineRoleChange(userId: string, role: string) {
  const result = await updateUser(userId, { role: role as any });
  if (result.success) {
    toast.success("Nivel atualizado");
    await loadUsers();
  } else {
    toast.error(result.error || "Erro ao atualizar nivel");
  }
}

async function handleInlineStatusChange(userId: string, isActive: boolean) {
  const result = await updateUser(userId, { isActive });
  if (result.success) {
    toast.success(isActive ? "Usuario ativado" : "Usuario inativado");
    await loadUsers();
  } else {
    toast.error(result.error || "Erro ao atualizar status");
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(protected)/users/users-content.tsx
git commit -m "feat: selects inline na tabela de usuarios para nivel e status"
```

---

## Task 9: Fix focus ring cortado nos dialogs

**Files:**
- Modify: `src/components/routes/route-form-dialog.tsx`
- Modify: `src/app/(protected)/companies/[id]/_components/credential-form.tsx`

- [ ] **Step 1: Aumentar padding do ScrollArea no route-form-dialog**

No `route-form-dialog.tsx`, a ScrollArea tem `px-3 pr-5`. O focus ring precisa de mais espaco. Mudar para `px-4 pr-6`:

```tsx
<ScrollArea className="h-[60vh] px-4 pr-6">
```

E no DialogContent, garantir que tem `overflow-visible` ou padding suficiente:

```tsx
<DialogContent className="sm:max-w-2xl max-h-[90vh] bg-card border border-border rounded-2xl">
```

Remover `overflow-hidden` se existir.

- [ ] **Step 2: Verificar credential-form.tsx**

Se o credential-form tem inputs com focus ring cortado, aplicar o mesmo fix de padding.

- [ ] **Step 3: Commit**

```bash
git add src/components/routes/route-form-dialog.tsx src/app/(protected)/companies/[id]/_components/credential-form.tsx
git commit -m "fix: aumenta padding nos dialogs para focus ring nao ser cortado"
```

---

## Task 10: Redesenhar Toast com progress bar animada

**Files:**
- Modify: `src/components/ui/sonner.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Configurar sonner com progress bar visivel**

O sonner ja suporta progress bar nativa. Verificar se precisa de CSS customizado ou se a prop `progress` existe.

Na verdade, sonner tem a prop `duration` e mostra progress automaticamente quando `closeButton` esta habilitado. O CSS em globals.css ja tem:
```css
[data-sonner-toast] [data-progress] {
  height: 3px;
  background: linear-gradient(to right, rgba(124, 58, 237, 0.6), rgba(147, 51, 234, 0.6));
}
```

Se a barra nao esta aparecendo, pode ser que sonner v2 precisa de configuracao adicional. Adicionar `visibleToasts={3}` e garantir que a barra aparece.

Atualizar o CSS para uma barra mais visivel e com animacao:

```css
[data-sonner-toast] [data-progress] {
  height: 3px;
  background: linear-gradient(90deg, rgba(124, 58, 237, 0.7), rgba(168, 85, 247, 0.7));
  border-radius: 2px;
  transition: width 100ms linear;
}
```

- [ ] **Step 2: Melhorar layout do toast**

No `sonner.tsx`, ajustar o styling para ser mais minimalista e profissional:

```tsx
toastOptions={{
  classNames: {
    toast: "cn-toast !rounded-xl !border-border !shadow-lg",
    closeButton: "!bg-muted !border-border !text-muted-foreground hover:!text-foreground !h-7 !w-7 !min-h-[28px] !min-w-[28px] !rounded-lg",
    title: "!text-sm !font-medium",
    description: "!text-xs !text-muted-foreground",
  },
  duration: 4000,
}}
```

Reduzir duration para 4 segundos (mais rapido, menos intrusivo).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/sonner.tsx src/app/globals.css
git commit -m "feat: redesenha toasts com progress bar animada e layout minimalista"
```

---

## Task 11: Build, Deploy, Documentacao

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Build completo**

```bash
cd "/Users/joaovitorzanini/Desktop/Claude Code/Roteador Webhook Meta" && NEXT_LINT_DURING_BUILD=false npx next build
```
Expected: Build bem-sucedido

- [ ] **Step 2: Commit docs**

```bash
git add CLAUDE.md docs/
git commit -m "docs: atualiza com Fase 3C concluida"
```

- [ ] **Step 3: Push e deploy**

```bash
git push origin main
```
GitHub Actions faz build + deploy automatico.

- [ ] **Step 4: Verificar em producao**

Acessar https://roteadorwebhook.nexusai360.com e testar:
1. Login como viewer — dashboard mostra mensagem amigavel
2. Viewer nao pode criar empresa, editar rotas, adicionar membros
3. Super admin consegue mudar nivel de usuario
4. Select inline funciona na tabela de usuarios
5. Membros sem coluna Status
6. Informacoes compactadas na visao geral
7. Excluir empresa funciona
8. Toast com progress bar

---

## Resumo de Entregaveis

| # | Task | Descricao |
|---|------|-----------|
| 1 | Fix updateUser | Atualiza memberships quando role muda |
| 2 | Mensagem viewer | Dashboard e empresas com feedback amigavel |
| 3 | Read-only viewer | Esconde botoes de acao para viewer |
| 4 | Informacoes compactas | Grid horizontal + menos gap |
| 5 | Campo slug | Editavel na aba WhatsApp Cloud |
| 6 | Membros fix | Remove Status + fix z-index CustomSelect |
| 7 | Excluir empresa | Botao vermelho com AlertDialog |
| 8 | Selects inline | Nivel e Status na tabela de usuarios |
| 9 | Focus ring | Padding corrigido nos dialogs |
| 10 | Toast redesign | Progress bar + minimalista |
| 11 | Deploy | Build, push, verificacao |
