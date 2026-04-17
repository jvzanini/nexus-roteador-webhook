# Consolidação da tab WhatsApp Cloud + Soft-delete de Empresa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
1. Unificar a tab "WhatsApp Cloud" do card Empresa em um único card de Webhook (configuração + status + ações Meta).
2. Migrar subscribe/verify/unsubscribe para `accessToken` (com fallback para `metaSystemUserToken` por segurança) — corrige bug silencioso do Embedded Signup em que o webhook nunca era inscrito.
3. Corrigir o botão "Excluir Empresa" — hoje comporta-se como "Desativar". Implementar soft-delete real via `deletedAt` no schema (empresa fica no banco com status deleted, sumindo da UI).

**Architecture:**
- Backend Meta: helper `resolveMetaToken(cred)` que retorna `metaSystemUserToken ?? decrypt(accessToken)` — usado em subscribe/verify/unsubscribe. Coluna `metaSystemUserToken` permanece nullable (o usuário confirmou que empresas legadas são só teste e podem ser excluídas; o fallback é apenas safety-net). Sem migration de drop agora.
- Backend Company: adicionar `deletedAt DateTime?` em `Company`. `deleteCompany` faz soft-delete (marca `deletedAt`, mantém todas as relações). `getCompanies` e `getCompanyById` filtram `deletedAt: null`.
- Frontend tab WhatsApp Cloud: novo componente `WebhookCard` (cliente) mescla "Configurações do Webhook" + `MetaSubscriptionPanel` + ações Meta. `CredentialForm` enxuto.
- Frontend EditCompanyDialog: corrigir aninhamento que impede o `AlertDialog` de abrir.
- UI: aplicar design system do projeto (`design-system/nexus-roteador-webhook/MASTER.md`) via skill ui-ux-pro-max.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma v7, Tailwind + shadcn/ui (base-ui), Jest, Sonner, Lucide.

---

## File Structure

**Modificar:**
- `prisma/schema.prisma` — adicionar `deletedAt DateTime?` em `Company` + index.
- `src/lib/actions/meta-subscription.ts` — fallback de token em subscribe/verify/unsubscribe.
- `src/lib/actions/company.ts` — `deleteCompany` → soft-delete; filtro `deletedAt: null` nas queries.
- `src/app/(protected)/companies/[id]/_components/credential-form.tsx` — remover bloco System User Token + seção Configurações do Webhook; atualizar descrição do `accessToken`.
- `src/app/(protected)/companies/[id]/_components/credentials-tab.tsx` — substituir a dupla `CredentialForm` + `MetaSubscriptionPanel` por `WebhookCard` + `CredentialForm` enxuto.
- `src/app/(protected)/companies/[id]/_components/edit-company-dialog.tsx` — desaninhar `AlertDialog` do `Dialog` para corrigir abertura.
- `src/lib/actions/__tests__/meta-subscription.test.ts` — testes para fallback de token.
- `src/lib/actions/__tests__/company.test.ts` — testes para soft-delete.
- `src/lib/actions/credential.ts` — preservação de valores mascarados + `connectedViaEmbeddedSignup` no retorno.
- `docs/runbooks/embedded-signup-setup.md` — remover instruções de System User Token manual.
- `CLAUDE.md` — atualizar status + próximo passo.

**Criar:**
- `src/app/(protected)/companies/[id]/_components/webhook-card.tsx` — card unificado de webhook (config + status + ações Meta).
- `prisma/migrations/<timestamp>_company_soft_delete/migration.sql` — adiciona coluna `deleted_at`.

**Não tocar:**
- `src/lib/validations/credential.ts` — `metaSystemUserToken` continua `optional + nullable`.
- `src/lib/meta/graph-api.ts`, `src/lib/meta/oauth.ts` — inalterados.
- `src/app/api/meta/oauth/callback/route.ts` — inalterado.

---

### Task 1: Helper `resolveMetaToken` + fallback no subscribe

**Files:**
- Modify: `src/lib/actions/meta-subscription.ts`
- Test: `src/lib/actions/__tests__/meta-subscription.test.ts`

- [ ] **Step 1: Escrever teste falhando — subscribe funciona só com `accessToken`**

No topo do describe `subscribeWebhook`, adicionar abaixo do último `it`:

```ts
it("aceita accessToken se metaSystemUserToken ausente", async () => {
  (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
    ...anyCred,
    metaSystemUserToken: null,
  });
  (graphApi.subscribeFields as jest.Mock).mockResolvedValue(undefined);
  (graphApi.subscribeApp as jest.Mock).mockResolvedValue(undefined);

  const r = await subscribeWebhook(VALID_UUID);
  expect(r.success).toBe(true);

  expect(graphApi.subscribeFields).toHaveBeenCalledWith(
    "APP",
    expect.any(Object),
    "AT",
  );
  expect(graphApi.subscribeApp).toHaveBeenCalledWith("WABA", "AT");
});

it("prioriza metaSystemUserToken quando ambos presentes", async () => {
  (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
    ...anyCred,
    metaSystemUserToken: "enc:SUT",
    accessToken: "enc:AT",
  });
  (graphApi.subscribeFields as jest.Mock).mockResolvedValue(undefined);
  (graphApi.subscribeApp as jest.Mock).mockResolvedValue(undefined);

  await subscribeWebhook(VALID_UUID);

  expect(graphApi.subscribeApp).toHaveBeenCalledWith("WABA", "SUT");
});
```

Também substituir o teste existente `"sinaliza missing fields se metaSystemUserToken ausente"` por:

```ts
it("sinaliza missing fields se accessToken e metaSystemUserToken ambos ausentes", async () => {
  (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
    ...anyCred,
    accessToken: "",
    metaSystemUserToken: null,
  });
  const r = await subscribeWebhook(VALID_UUID);
  expect(r.success).toBe(false);
  expect(r.error).toContain("accessToken");
  expect(rateLimit.releaseMetaLock).toHaveBeenCalledWith(VALID_UUID);
});
```

- [ ] **Step 2: Rodar os testes e verificar que falham**

```bash
npx jest src/lib/actions/__tests__/meta-subscription.test.ts -t "subscribeWebhook"
```

Esperado: os dois novos testes FALHAM (primeiro por "Campos faltando: metaSystemUserToken", segundo pode passar ou falhar dependendo do comportamento atual).

- [ ] **Step 3: Implementar o helper `resolveMetaToken` e aplicar no subscribe**

Em `src/lib/actions/meta-subscription.ts`, abaixo dos imports e acima de `validateCallbackBase`, adicionar:

```ts
function resolveMetaToken(cred: {
  metaSystemUserToken: string | null;
  accessToken: string;
}): string | null {
  const source = cred.metaSystemUserToken ?? (cred.accessToken || null);
  return source ? decrypt(source) : null;
}
```

Em `subscribeWebhookUnlocked`, substituir o bloco de validação e decrypt (linhas ~128-145 do arquivo atual):

```ts
  const cred = await prisma.companyCredential.findUnique({ where: { companyId } });
  if (!cred) return { success: false, error: "Credenciais não cadastradas" };
  const missing: string[] = [];
  if (!cred.metaAppId) missing.push("metaAppId");
  if (!cred.wabaId) missing.push("wabaId");
  if (!cred.verifyToken) missing.push("verifyToken");
  if (!cred.accessToken && !cred.metaSystemUserToken) missing.push("accessToken");
  if (missing.length) {
    return { success: false, error: `Campos faltando: ${missing.join(", ")}` };
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { success: false, error: "Empresa não encontrada" };

  const callbackUrl = `${process.env.NEXTAUTH_URL}/api/webhook/${company.webhookKey}`;
  const verifyToken = decrypt(cred.verifyToken!);
  const token = resolveMetaToken(cred);
  if (!token) return { success: false, error: "Token indisponível" };
```

- [ ] **Step 4: Rodar teste e verificar sucesso**

```bash
npx jest src/lib/actions/__tests__/meta-subscription.test.ts -t "subscribeWebhook"
```

Esperado: todos os testes do describe `subscribeWebhook` PASSAM.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/meta-subscription.ts src/lib/actions/__tests__/meta-subscription.test.ts
git commit -m "$(cat <<'EOF'
feat(meta): fallback accessToken em subscribe (corrige Embedded Signup)

Embedded Signup preenche accessToken mas subscribeWebhookUnlocked lia
metaSystemUserToken — subscribe silenciosamente falhava. Helper
resolveMetaToken prioriza metaSystemUserToken (compat legado) e cai em
accessToken quando ausente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Fallback em verify e unsubscribe

**Files:**
- Modify: `src/lib/actions/meta-subscription.ts`
- Test: `src/lib/actions/__tests__/meta-subscription.test.ts`

- [ ] **Step 1: Escrever testes falhando para verify e unsubscribe**

Adicionar ao final do describe `unsubscribeWebhook`:

```ts
it("usa accessToken se metaSystemUserToken ausente", async () => {
  (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
  (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
    ...anyCred,
    metaSystemUserToken: null,
  });
  (graphApi.unsubscribeApp as jest.Mock).mockResolvedValue(undefined);
  const r = await unsubscribeWebhook(VALID_UUID);
  expect(r.success).toBe(true);
  expect(graphApi.unsubscribeApp).toHaveBeenCalledWith("WABA", "AT");
});
```

Adicionar ao describe `verifyMetaSubscription`:

```ts
it("usa accessToken quando metaSystemUserToken ausente", async () => {
  (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
  (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
    ...baseCred,
    metaSystemUserToken: null,
  });
  (graphApi.listSubscribedApps as jest.Mock).mockResolvedValue([{ appId: "APP" }]);
  (graphApi.listSubscriptions as jest.Mock).mockResolvedValue([{
    object: "whatsapp_business_account",
    callbackUrl: "https://roteador.example.com/api/webhook/abc",
    fields: ["messages"],
  }]);
  const r = await verifyMetaSubscription(VALID_UUID);
  expect(r.success).toBe(true);
  expect(graphApi.listSubscribedApps).toHaveBeenCalledWith("WABA", "AT");
});
```

- [ ] **Step 2: Rodar testes e verificar falhas**

```bash
npx jest src/lib/actions/__tests__/meta-subscription.test.ts
```

Esperado: ambos os novos testes FALHAM (atualmente ainda usam `cred.metaSystemUserToken` hard).

- [ ] **Step 3: Aplicar `resolveMetaToken` em `verifyMetaSubscriptionCore`**

Substituir o bloco de validação e decrypt (linhas ~253-259 do arquivo atual) por:

```ts
  const cred = await prisma.companyCredential.findUnique({ where: { companyId } });
  if (!cred) return { success: false, error: "Credenciais não cadastradas" };
  if (!cred.wabaId || !cred.metaAppId || (!cred.accessToken && !cred.metaSystemUserToken)) {
    return { success: false, error: "Campos faltando para verificar" };
  }

  const token = resolveMetaToken(cred);
  if (!token) return { success: false, error: "Token indisponível" };
```

- [ ] **Step 4: Aplicar `resolveMetaToken` em `unsubscribeWebhookUnlocked`**

Substituir o bloco (linhas ~333-341):

```ts
  const errors: string[] = [];
  const token = resolveMetaToken(cred);
  if (token && cred.wabaId) {
    try {
      await graphApi.unsubscribeApp(cred.wabaId, token);
    } catch (e) {
      errors.push(graphApi.serializeErrorSafe(e));
    }
  }
```

- [ ] **Step 5: Rodar toda a suíte de meta-subscription**

```bash
npx jest src/lib/actions/__tests__/meta-subscription.test.ts
```

Esperado: TODOS os testes PASSAM.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/meta-subscription.ts src/lib/actions/__tests__/meta-subscription.test.ts
git commit -m "$(cat <<'EOF'
feat(meta): fallback accessToken em verify e unsubscribe

Alinha verifyMetaSubscriptionCore e unsubscribeWebhookUnlocked com a
mesma regra de subscribe: metaSystemUserToken tem precedência,
accessToken é fallback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Criar `WebhookCard` unificado

**Files:**
- Create: `src/app/(protected)/companies/[id]/_components/webhook-card.tsx`

**Checklist visual (MASTER.md):**
- Card `bg-card border border-border rounded-xl`
- Header: ícone `Webhook` violet-500 + título "Webhook" + badge de status à direita (cores por estado conforme `MetaSubscriptionPanel` atual).
- URL copiável (idem bloco atual do credential-form).
- Slug da Empresa (input controlado com prefixo `/`).
- Token de Verificação (SensitiveInput reutilizado via import + botão Gerar).
- Metadados Meta (condicional ao status não `not_configured`): última inscrição, fields, callback confirmado, detalhes do erro (status=error) e aviso de divergência (status=stale).
- Botões em destaque (violet-600 primary para Inscrever/Reinscrever): Testar Conexão, Inscrever/Reinscrever, Revalidar, Desinscrever (ghost-red).
- Accordion "Como configurar manualmente na Meta" (passos documentados — só mostra quando `!connectedViaEmbeddedSignup`).
- Botão "Salvar Configurações" no fim da seção de configuração (slug + verify token), preservando o `handleSaveWebhookConfig` atual.

- [ ] **Step 1: Criar o componente `webhook-card.tsx`**

Criar `src/app/(protected)/companies/[id]/_components/webhook-card.tsx`:

```tsx
"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Webhook,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  CircleAlert,
  Circle,
  Copy,
  Check,
  Sparkles,
  ChevronDown,
  ExternalLink,
  Plug,
  RefreshCw,
  Unplug,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useRealtime } from "@/hooks/use-realtime";
import { updateCompany } from "@/lib/actions/company";
import {
  upsertCredential,
  revealCredentialField,
} from "@/lib/actions/credential";
import {
  testMetaConnection,
  subscribeWebhook,
  unsubscribeWebhook,
  verifyMetaSubscription,
  generateVerifyToken,
} from "@/lib/actions/meta-subscription";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://roteadorwebhook.nexusai360.com";

export type MetaSubscriptionStatus =
  | "not_configured"
  | "pending"
  | "active"
  | "stale"
  | "error";

export interface MetaSubscriptionSnapshot {
  status: MetaSubscriptionStatus;
  subscribedAt: string | null;
  error: string | null;
  callbackUrl: string | null;
  fields: string[];
}

interface Props {
  companyId: string;
  webhookKey: string;
  verifyTokenMasked: string;
  accessTokenMasked: string;
  metaAppId: string;
  wabaId: string | null;
  canManage: boolean;
  connectedViaEmbeddedSignup: boolean;
  initial: MetaSubscriptionSnapshot;
}

type ActionKey = "test" | "subscribe" | "verify" | "unsubscribe" | null;

const statusConfig: Record<
  MetaSubscriptionStatus,
  { label: string; Icon: typeof Circle; classes: string; spin: boolean }
> = {
  not_configured: {
    label: "Não configurado",
    Icon: Circle,
    classes:
      "text-slate-600 dark:text-slate-400 bg-slate-500/10 border-slate-500/20",
    spin: false,
  },
  pending: {
    label: "Inscrevendo...",
    Icon: Loader2,
    classes:
      "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    spin: true,
  },
  active: {
    label: "Ativo",
    Icon: CheckCircle2,
    classes:
      "text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20",
    spin: false,
  },
  stale: {
    label: "Divergente",
    Icon: AlertTriangle,
    classes:
      "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
    spin: false,
  },
  error: {
    label: "Erro",
    Icon: CircleAlert,
    classes: "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20",
    spin: false,
  },
};

function StatusBadge({ status }: { status: MetaSubscriptionStatus }) {
  const c = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${c.classes}`}
    >
      <c.Icon className={`h-3.5 w-3.5 ${c.spin ? "animate-spin" : ""}`} />
      {c.label}
    </span>
  );
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Nunca inscrito";
  try {
    const d = new Date(iso);
    return `Última inscrição: ${format(d, "dd/MM/yyyy 'às' HH:mm", {
      locale: ptBR,
    })}`;
  } catch {
    return "Última inscrição: data inválida";
  }
}

const inputClasses =
  "h-11 bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200 rounded-lg";

export function WebhookCard({
  companyId,
  webhookKey,
  verifyTokenMasked,
  accessTokenMasked,
  metaAppId,
  wabaId,
  canManage,
  connectedViaEmbeddedSignup,
  initial,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<ActionKey>(null);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [slug, setSlug] = useState(webhookKey);
  const [verifyVisible, setVerifyVisible] = useState(false);
  const [verifyRevealing, setVerifyRevealing] = useState(false);
  const [verifyRevealed, setVerifyRevealed] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const verifyInputRef = useRef<HTMLInputElement | null>(null);

  useRealtime((event) => {
    if (event.type === "credential:updated" && event.companyId === companyId) {
      router.refresh();
    }
  });

  const webhookUrl = `${APP_URL}/api/webhook/${slug || webhookKey}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("URL copiada");
  }

  async function handleToggleVerify() {
    if (verifyVisible) {
      setVerifyVisible(false);
      if (verifyInputRef.current)
        verifyInputRef.current.value = verifyTokenMasked;
      return;
    }
    if (verifyRevealed) {
      setVerifyVisible(true);
      if (verifyInputRef.current) verifyInputRef.current.value = verifyRevealed;
      return;
    }
    setVerifyRevealing(true);
    const r = await revealCredentialField(companyId, "verifyToken");
    setVerifyRevealing(false);
    if (r.success && r.data) {
      setVerifyRevealed(r.data);
      setVerifyVisible(true);
      if (verifyInputRef.current) verifyInputRef.current.value = r.data;
    } else {
      toast.error(r.error ?? "Erro ao revelar");
    }
  }

  async function handleGenerateVerifyToken() {
    setGeneratingToken(true);
    try {
      const r = await generateVerifyToken();
      if (r.success && r.data) {
        if (verifyInputRef.current) verifyInputRef.current.value = r.data.token;
        setVerifyVisible(true);
        setVerifyRevealed(r.data.token);
        toast.success("Verify token gerado");
      } else {
        toast.error(r.error ?? "Erro ao gerar token");
      }
    } finally {
      setGeneratingToken(false);
    }
  }

  async function handleSaveConfig() {
    if (!canManage) return;
    const verifyValue = verifyInputRef.current?.value;
    startTransition(async () => {
      if (slug.trim() && slug.trim() !== webhookKey) {
        const slugResult = await updateCompany(companyId, {
          webhookKey: slug.trim(),
        });
        if (!slugResult.success) {
          toast.error(slugResult.error ?? "Erro ao atualizar slug");
          return;
        }
      }
      if (verifyValue && !verifyValue.includes("••")) {
        const r = await upsertCredential(companyId, {
          metaAppId,
          metaAppSecret: "PRESERVE",
          verifyToken: verifyValue,
          accessToken: "PRESERVE",
          phoneNumberId: "PRESERVE",
          wabaId: wabaId ?? "PRESERVE",
        } as never);
        if (!r.success) {
          toast.error(r.error ?? "Erro ao salvar verify token");
          return;
        }
      }
      toast.success("Configurações salvas");
      router.refresh();
    });
  }

  async function runAction(
    key: Exclude<ActionKey, null>,
    fn: () => Promise<{ success: boolean; error?: string; data?: unknown }>,
    successMessage: string,
  ) {
    setBusy(key);
    try {
      const result = await fn();
      if (result.success) toast.success(successMessage);
      else toast.error(result.error ?? "Erro desconhecido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  const prereqsMissing: string[] = [];
  if (!metaAppId) prereqsMissing.push("metaAppId");
  if (!wabaId) prereqsMissing.push("wabaId");
  const hasPrereqs = prereqsMissing.length === 0;
  const isDisabled = busy !== null || isPending;
  const showPostConfigButtons = initial.status !== "not_configured";

  return (
    <Card className="bg-card border border-border rounded-xl">
      <CardContent className="py-5 px-5 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-violet-500 dark:text-violet-400" />
            <h3 className="text-sm font-semibold text-foreground">Webhook</h3>
          </div>
          <StatusBadge status={initial.status} />
        </div>

        <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2.5">
          <code className="text-sm text-muted-foreground flex-1 truncate">
            {webhookUrl}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground -mt-3">
          Configure esta URL no painel do Meta App como Webhook Callback URL.
        </p>

        <div className="pt-3 border-t border-border space-y-4">
          <div className="space-y-2">
            <div>
              <h4 className="text-sm font-medium text-foreground">
                Slug da Empresa <span className="text-red-400">*</span>
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Identificador único usado na URL do webhook.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground font-mono">/</span>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="minha-empresa"
                disabled={!canManage}
                className={inputClasses}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <h4 className="text-sm font-medium text-foreground">
                Token de Verificação <span className="text-red-400">*</span>
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Token usado pela Meta para validar o endpoint do webhook.
              </p>
            </div>
            <div className="relative">
              <Input
                ref={verifyInputRef}
                type="text"
                defaultValue={verifyTokenMasked}
                readOnly={!verifyVisible}
                disabled={!canManage}
                className={`${inputClasses} pr-10 ${!verifyVisible ? "font-mono tracking-wider" : ""}`}
              />
              <button
                type="button"
                onClick={handleToggleVerify}
                disabled={verifyRevealing}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
              >
                {verifyRevealing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : verifyVisible ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {canManage && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={generatingToken || isDisabled}
                onClick={handleGenerateVerifyToken}
                className="gap-2 cursor-pointer"
              >
                {generatingToken ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Gerar
              </Button>
            )}
          </div>

          {canManage && (
            <Button
              type="button"
              onClick={handleSaveConfig}
              disabled={isDisabled}
              className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar Configurações
            </Button>
          )}
        </div>

        <div className="pt-3 border-t border-border space-y-2">
          <p className="text-xs text-muted-foreground">
            {formatTimestamp(initial.subscribedAt)}
          </p>
          {initial.callbackUrl && (
            <p className="text-xs text-muted-foreground">
              Callback confirmado:{" "}
              <code className="font-mono">{initial.callbackUrl}</code>
            </p>
          )}
          {initial.fields.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Fields:{" "}
              <code className="font-mono">{initial.fields.join(", ")}</code>
            </p>
          )}

          {initial.status === "stale" && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Detectamos divergência com a Meta — clique em Revalidar ou
              Reinscrever.
            </div>
          )}

          {initial.status === "error" && initial.error && (
            <details className="group rounded-lg border border-red-500/30 bg-red-500/5">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300">
                Ver detalhes do erro
              </summary>
              <pre className="px-3 pb-3 pt-1 text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap break-all font-mono">
                {initial.error}
              </pre>
            </details>
          )}
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isDisabled}
              onClick={() =>
                runAction(
                  "test",
                  () => testMetaConnection(companyId),
                  "Conexão OK",
                )
              }
              className="gap-2 cursor-pointer"
            >
              {busy === "test" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}
              Testar Conexão
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={isDisabled || !hasPrereqs}
              title={
                hasPrereqs
                  ? "Inscrever webhook na Meta"
                  : `Campos faltando: ${prereqsMissing.join(", ")}`
              }
              onClick={() =>
                runAction(
                  "subscribe",
                  () => subscribeWebhook(companyId),
                  "Webhook inscrito",
                )
              }
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer"
            >
              {busy === "subscribe" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Webhook className="h-4 w-4" />
              )}
              {initial.status === "not_configured"
                ? "Inscrever Webhook na Meta"
                : "Reinscrever"}
            </Button>

            {showPostConfigButtons && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isDisabled}
                  onClick={() =>
                    runAction(
                      "verify",
                      () => verifyMetaSubscription(companyId),
                      "Revalidação concluída",
                    )
                  }
                  className="gap-2 cursor-pointer"
                >
                  {busy === "verify" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Revalidar
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isDisabled}
                  onClick={() => {
                    if (!window.confirm("Desinscrever webhook da Meta?"))
                      return;
                    runAction(
                      "unsubscribe",
                      () => unsubscribeWebhook(companyId),
                      "Webhook desinscrito",
                    );
                  }}
                  className="gap-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 cursor-pointer"
                >
                  {busy === "unsubscribe" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Unplug className="h-4 w-4" />
                  )}
                  Desinscrever
                </Button>
              </>
            )}
          </div>
        )}

        {!connectedViaEmbeddedSignup && (
          <details className="group rounded-lg border border-border/60 bg-muted/30">
            <summary className="flex items-center justify-between gap-2 cursor-pointer list-none px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground">
              <span>Como configurar manualmente na Meta</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-2 text-xs text-muted-foreground">
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  Acesse developers.facebook.com → apps → selecione seu app.
                </li>
                <li>
                  Em <strong>WhatsApp → Configuration</strong>, cole a URL
                  acima como <em>Callback URL</em> e o token de verificação
                  como <em>Verify Token</em>.
                </li>
                <li>
                  Gere um token de acesso com escopos{" "}
                  <code className="font-mono">whatsapp_business_management</code>{" "}
                  e{" "}
                  <code className="font-mono">whatsapp_business_messaging</code>
                  ; cole no campo Token de Acesso abaixo.
                </li>
                <li>
                  Clique em <strong>Inscrever Webhook na Meta</strong> — nós
                  cuidamos do resto automaticamente.
                </li>
              </ol>
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300"
              >
                Documentação oficial <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Validar type-check do arquivo novo**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep webhook-card || echo "OK"
```

Esperado: `OK` (sem erros de tipo referentes a `webhook-card.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/companies/[id]/_components/webhook-card.tsx
git commit -m "$(cat <<'EOF'
feat(ui): WebhookCard unificado (config + status + ações Meta)

Novo componente mescla Configurações do Webhook com MetaSubscriptionPanel
em um único card, com badge de status, botões em destaque e accordion de
instruções manuais.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Remover System User Token e seção de Webhook do `CredentialForm`

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/credential-form.tsx`

- [ ] **Step 1: Remover campo `metaSystemUserToken` e bloco de Configurações do Webhook**

Substituir integralmente o conteúdo de `src/app/(protected)/companies/[id]/_components/credential-form.tsx` por:

```tsx
"use client";

import { useState, useTransition, useRef } from "react";
import { Save, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  upsertCredential,
  revealCredentialField,
} from "@/lib/actions/credential";
import { toast } from "sonner";

interface SensitiveInputProps {
  id: string;
  name: string;
  label: string;
  description: string;
  placeholder: string;
  defaultValue?: string;
  required?: boolean;
  visible: boolean;
  revealing: boolean;
  onToggle: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
  className: string;
  disabled?: boolean;
  hideToggle?: boolean;
  plaintextMasking?: boolean;
}

function SensitiveInput({
  id,
  name,
  label,
  description,
  placeholder,
  defaultValue,
  required = true,
  visible,
  revealing,
  onToggle,
  inputRef,
  className,
  disabled = false,
  hideToggle = false,
  plaintextMasking = false,
}: SensitiveInputProps) {
  const displayValue =
    plaintextMasking && !visible && defaultValue
      ? defaultValue.length > 5
        ? "••••••••" + defaultValue.slice(-5)
        : defaultValue
      : defaultValue;

  return (
    <div className="space-y-2">
      <div>
        <Label
          htmlFor={id}
          className="text-sm font-medium text-foreground/80"
        >
          {label} {required && <span className="text-red-400">*</span>}
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="relative">
        {visible && displayValue && displayValue.length > 40 ? (
          <textarea
            ref={(el: HTMLTextAreaElement | null) => {
              inputRef(el as unknown as HTMLInputElement);
              if (el) {
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }
            }}
            id={id}
            name={name}
            defaultValue={displayValue}
            required={required}
            disabled={disabled}
            rows={1}
            style={{ height: "auto", minHeight: "44px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = target.scrollHeight + "px";
            }}
            className={`${className} ${hideToggle ? "" : "pr-10"} resize-none w-full overflow-hidden`}
          />
        ) : (
          <Input
            ref={inputRef}
            id={id}
            name={name}
            type="text"
            placeholder={placeholder}
            defaultValue={displayValue}
            required={required}
            disabled={disabled}
            readOnly={!visible && !!defaultValue}
            className={`${className} ${hideToggle ? "" : "pr-10"} ${!visible && defaultValue ? "font-mono tracking-wider" : ""}`}
          />
        )}
        {!hideToggle && (
          <button
            type="button"
            onClick={onToggle}
            disabled={revealing}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
          >
            {revealing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : visible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

interface CredentialFormProps {
  companyId: string;
  canEdit?: boolean;
  existingCredential?: {
    metaAppId: string;
    metaAppSecret: string;
    verifyToken: string;
    accessToken: string;
    phoneNumberId: string | null;
    wabaId: string | null;
  } | null;
  onSuccess?: () => void;
}

const inputClasses =
  "h-11 bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200 rounded-lg";

export function CredentialForm({
  companyId,
  canEdit = true,
  existingCredential,
  onSuccess,
}: CredentialFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {},
  );
  const [revealing, setRevealing] = useState<Record<string, boolean>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const plaintextFields = ["metaAppId", "phoneNumberId", "wabaId"];

  async function toggleField(field: string) {
    if (visible[field]) {
      setVisible((prev) => ({ ...prev, [field]: false }));
      const input = inputRefs.current[field];
      if (input && existingCredential) {
        const rawValue = existingCredential[
          field as keyof typeof existingCredential
        ] as string;
        if (plaintextFields.includes(field) && rawValue) {
          input.value =
            rawValue.length > 5
              ? "••••••••" + rawValue.slice(-5)
              : rawValue;
        } else if (rawValue && revealedValues[field]) {
          input.value = rawValue;
        }
      }
      return;
    }

    if (plaintextFields.includes(field) && existingCredential) {
      const rawValue = existingCredential[
        field as keyof typeof existingCredential
      ] as string;
      if (rawValue) {
        setVisible((prev) => ({ ...prev, [field]: true }));
        const input = inputRefs.current[field];
        if (input) input.value = rawValue;
        return;
      }
    }

    if (revealedValues[field]) {
      setVisible((prev) => ({ ...prev, [field]: true }));
      const input = inputRefs.current[field];
      if (input) input.value = revealedValues[field];
      return;
    }

    const encryptedFields = ["metaAppSecret", "accessToken"];
    if (existingCredential && encryptedFields.includes(field)) {
      setRevealing((prev) => ({ ...prev, [field]: true }));
      const result = await revealCredentialField(
        companyId,
        field as "metaAppSecret" | "accessToken",
      );
      setRevealing((prev) => ({ ...prev, [field]: false }));

      if (result.success && result.data) {
        setRevealedValues((prev) => ({ ...prev, [field]: result.data! }));
        setVisible((prev) => ({ ...prev, [field]: true }));
        const input = inputRefs.current[field];
        if (input) input.value = result.data;
        return;
      }
    }

    setVisible((prev) => ({ ...prev, [field]: true }));
  }

  function getPlaintextValue(formData: FormData, fieldName: string): string {
    const formValue = formData.get(fieldName) as string;
    if (formValue && formValue.startsWith("••••••••") && existingCredential) {
      const original = existingCredential[
        fieldName as keyof typeof existingCredential
      ] as string;
      if (original) return original;
    }
    return formValue;
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await upsertCredential(companyId, {
        metaAppId: getPlaintextValue(formData, "metaAppId"),
        metaAppSecret: formData.get("metaAppSecret") as string,
        verifyToken: (existingCredential?.verifyToken ?? ""),
        accessToken: formData.get("accessToken") as string,
        phoneNumberId: getPlaintextValue(formData, "phoneNumberId"),
        wabaId: getPlaintextValue(formData, "wabaId"),
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        toast.success("Credenciais salvas");
        onSuccess?.();
      } else {
        setError(result.error ?? "Erro desconhecido");
        toast.error(result.error ?? "Erro desconhecido");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <SensitiveInput
        id="metaAppId"
        name="metaAppId"
        label="Meta App ID"
        description="Identificador do aplicativo no painel Meta for Developers"
        placeholder="123456789"
        defaultValue={existingCredential?.metaAppId}
        visible={!!visible["metaAppId"]}
        revealing={!!revealing["metaAppId"]}
        onToggle={() => toggleField("metaAppId")}
        inputRef={(el) => {
          inputRefs.current["metaAppId"] = el;
        }}
        className={inputClasses}
        disabled={!canEdit}
        hideToggle={!canEdit}
        plaintextMasking={!!existingCredential?.metaAppId}
      />

      <SensitiveInput
        id="metaAppSecret"
        name="metaAppSecret"
        label="Meta App Secret"
        description="Chave secreta do aplicativo — não compartilhe"
        placeholder="Seu app secret"
        defaultValue={existingCredential?.metaAppSecret}
        visible={!!visible["metaAppSecret"]}
        revealing={!!revealing["metaAppSecret"]}
        onToggle={() => toggleField("metaAppSecret")}
        inputRef={(el) => {
          inputRefs.current["metaAppSecret"] = el;
        }}
        className={inputClasses}
        disabled={!canEdit}
        hideToggle={!canEdit}
      />

      <SensitiveInput
        id="accessToken"
        name="accessToken"
        label="Token de Acesso"
        description="Token do portfólio empresarial da Meta com escopos whatsapp_business_management e whatsapp_business_messaging. O Embedded Signup cuida disso automaticamente."
        placeholder="EAAxxxxxxxx"
        defaultValue={existingCredential?.accessToken}
        visible={!!visible["accessToken"]}
        revealing={!!revealing["accessToken"]}
        onToggle={() => toggleField("accessToken")}
        inputRef={(el) => {
          inputRefs.current["accessToken"] = el;
        }}
        className={inputClasses}
        disabled={!canEdit}
        hideToggle={!canEdit}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SensitiveInput
          id="phoneNumberId"
          name="phoneNumberId"
          label="Phone Number ID"
          description="ID do número de telefone na API do WhatsApp Cloud"
          placeholder="109876543"
          defaultValue={existingCredential?.phoneNumberId ?? ""}
          visible={!!visible["phoneNumberId"]}
          revealing={!!revealing["phoneNumberId"]}
          onToggle={() => toggleField("phoneNumberId")}
          inputRef={(el) => {
            inputRefs.current["phoneNumberId"] = el;
          }}
          className={inputClasses}
          disabled={!canEdit}
          hideToggle={!canEdit}
          plaintextMasking={!!existingCredential?.phoneNumberId}
        />

        <SensitiveInput
          id="wabaId"
          name="wabaId"
          label="WABA ID"
          description="ID da conta comercial do WhatsApp (WhatsApp Business Account)"
          placeholder="112233445566"
          defaultValue={existingCredential?.wabaId ?? ""}
          visible={!!visible["wabaId"]}
          revealing={!!revealing["wabaId"]}
          onToggle={() => toggleField("wabaId")}
          inputRef={(el) => {
            inputRefs.current["wabaId"] = el;
          }}
          className={inputClasses}
          disabled={!canEdit}
          hideToggle={!canEdit}
          plaintextMasking={!!existingCredential?.wabaId}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && (
        <p className="text-sm text-emerald-400">Credenciais salvas com sucesso!</p>
      )}

      {canEdit && (
        <Button
          type="submit"
          disabled={isPending}
          className="gap-2 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Salvar Credenciais
            </>
          )}
        </Button>
      )}
    </form>
  );
}
```

**Nota importante:** o `handleSubmit` do CredentialForm não envia `verifyToken` (ele é preservado pelo WebhookCard). Para preservar o valor, o form reusa `existingCredential.verifyToken` (valor mascarado). Isso é inócuo porque `upsertCredential` no servidor só encripta valores que recebe — mas o schema Zod exige `verifyToken.min(1)`. Vamos ajustar isso no backend via regra: se o client mandar o valor mascarado (contém `••`), o servidor preserva. Implementado em Task 5.

- [ ] **Step 2: Commit**

```bash
git add src/app/(protected)/companies/[id]/_components/credential-form.tsx
git commit -m "$(cat <<'EOF'
refactor(ui): remove System User Token e bloco Webhook do CredentialForm

System User Token depreciado (backend faz fallback para accessToken).
Bloco de Configurações do Webhook migrado para o WebhookCard unificado.
Descrição do Token de Acesso atualizada para mencionar ambos os escopos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Preservar `verifyToken` no backend quando não enviado

**Files:**
- Modify: `src/lib/actions/credential.ts`
- Test: `src/lib/actions/__tests__/credential.test.ts`

**Motivação:** com o refactor, o `CredentialForm` deixa de enviar `verifyToken` na maioria dos submits (é editado apenas no `WebhookCard`). Hoje o schema Zod exige `verifyToken.min(1)` — precisamos tolerar um sentinel `"PRESERVE"` ou um valor mascarado (`••••••••...`) para indicar "não alterar".

- [ ] **Step 1: Escrever teste falhando**

Adicionar em `src/lib/actions/__tests__/credential.test.ts`, dentro do describe:

```ts
it("upsertCredential preserva verifyToken/accessToken existentes quando input mascarado", async () => {
  prismaMock.company.findUnique.mockResolvedValue({ id: companyId });
  prismaMock.companyCredential.findUnique.mockResolvedValue({
    id: "cred-1",
    companyId,
    metaAppId: "app",
    metaAppSecret: "enc:oldsecret",
    verifyToken: "enc:oldverify",
    accessToken: "enc:oldaccess",
    phoneNumberId: "pn",
    wabaId: "waba",
    metaSystemUserToken: null,
  });
  prismaMock.companyCredential.upsert.mockImplementation(
    async (args: { update: Record<string, unknown> }) =>
      ({ id: "cred-1", companyId, ...args.update }) as never,
  );

  const result = await upsertCredential(companyId, {
    metaAppId: "app",
    metaAppSecret: "secret",
    verifyToken: "••••••••5def",
    accessToken: "••••••••9abc",
    phoneNumberId: "pn",
    wabaId: "waba",
  });

  expect(result.success).toBe(true);
  const upsertCall = prismaMock.companyCredential.upsert.mock.calls[0][0];
  expect(upsertCall.update.verifyToken).toBe("enc:oldverify");
  expect(upsertCall.update.accessToken).toBe("enc:oldaccess");
});
```

- [ ] **Step 2: Rodar teste e ver falhar**

```bash
npx jest src/lib/actions/__tests__/credential.test.ts -t "preserva"
```

Esperado: FALHA (atualmente o schema rejeita ou encripta o valor mascarado).

- [ ] **Step 3: Ajustar `upsertCredential` + validação**

Em `src/lib/actions/credential.ts`, após o `parsed.data` ser extraído, adicionar a lógica de preservação (antes de construir `data`):

```ts
    const {
      metaAppId,
      metaAppSecret,
      verifyToken,
      accessToken,
      phoneNumberId,
      wabaId,
      metaSystemUserToken,
    } = parsed.data;

    // Valores mascarados no front indicam "não alterar" — reutiliza o valor atual
    const existingRecord = await prisma.companyCredential.findUnique({
      where: { companyId },
    });
    const isMasked = (v: string | undefined) =>
      typeof v === "string" && v.includes("••");

    const finalVerify =
      isMasked(verifyToken) && existingRecord?.verifyToken
        ? existingRecord.verifyToken // já encriptado no banco
        : encrypt(verifyToken);

    const finalAccess =
      isMasked(accessToken) && existingRecord?.accessToken
        ? existingRecord.accessToken
        : encrypt(accessToken);

    const finalSecret =
      isMasked(metaAppSecret) && existingRecord?.metaAppSecret
        ? existingRecord.metaAppSecret
        : encrypt(metaAppSecret);

    const data: Record<string, unknown> = {
      metaAppId,
      metaAppSecret: finalSecret,
      verifyToken: finalVerify,
      accessToken: finalAccess,
      phoneNumberId: phoneNumberId || null,
      wabaId: wabaId || null,
    };
```

Substituir o bloco original que criptografava `verifyToken`/`accessToken`/`metaAppSecret` incondicionalmente. Também remover a segunda chamada `findUnique` abaixo (usar `existingRecord` que já foi buscado).

- [ ] **Step 4: Ajustar o Zod para aceitar valores mascarados**

Em `src/lib/validations/credential.ts`, relaxar os campos sensíveis:

```ts
  metaAppSecret: z
    .string()
    .min(1, "Meta App Secret e obrigatorio")
    .max(500, "Meta App Secret deve ter no maximo 500 caracteres")
    .trim(),
  verifyToken: z
    .string()
    .min(1, "Verify Token e obrigatorio")
    .max(500, "Verify Token deve ter no maximo 500 caracteres")
    .trim(),
  accessToken: z
    .string()
    .min(1, "Access Token e obrigatorio")
    .max(500, "Access Token deve ter no maximo 500 caracteres")
    .trim(),
```

(Aumento do `max` absorve valores mascarados longos e tokens Embedded Signup longos. `min(1)` continua protegendo contra input vazio.)

- [ ] **Step 5: Rodar todos os testes de credential**

```bash
npx jest src/lib/actions/__tests__/credential.test.ts
```

Esperado: TODOS passam.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/credential.ts src/lib/validations/credential.ts src/lib/actions/__tests__/credential.test.ts
git commit -m "$(cat <<'EOF'
feat(credential): preserva campos sensíveis quando input mascarado

Valores com ••••••• vindos do front indicam "não alterar" — backend
reutiliza o valor atual do banco. Evita que o form esconda campos e
salve strings vazias.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Orquestração em `CredentialsTab`

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/credentials-tab.tsx`

- [ ] **Step 1: Substituir conteúdo**

Reescrever `src/app/(protected)/companies/[id]/_components/credentials-tab.tsx`:

```tsx
"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getCredential } from "@/lib/actions/credential";
import { CredentialForm } from "./credential-form";
import { EmbeddedSignupButton } from "./embedded-signup-button";
import {
  WebhookCard,
  type MetaSubscriptionSnapshot,
} from "./webhook-card";

interface MaskedCredential {
  metaAppId: string;
  metaAppSecret: string;
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  connectedViaEmbeddedSignup: boolean;
}

interface CredentialsTabProps {
  companyId: string;
  webhookKey: string;
  canEdit?: boolean;
  hasEmbeddedSignup?: boolean;
}

export function CredentialsTab({
  companyId,
  webhookKey,
  canEdit = true,
  hasEmbeddedSignup = false,
}: CredentialsTabProps) {
  const router = useRouter();
  const [credential, setCredential] = useState<MaskedCredential | null>(null);
  const [metaSnapshot, setMetaSnapshot] = useState<MetaSubscriptionSnapshot>({
    status: "not_configured",
    subscribedAt: null,
    error: null,
    callbackUrl: null,
    fields: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getCredential(companyId);
      if (result.success && result.data) {
        const data = result.data as Record<string, unknown>;
        setCredential({
          metaAppId: (data.metaAppId as string) ?? "",
          metaAppSecret: (data.metaAppSecret as string) ?? "",
          verifyToken: (data.verifyToken as string) ?? "",
          accessToken: (data.accessToken as string) ?? "",
          phoneNumberId: (data.phoneNumberId as string | null) ?? null,
          wabaId: (data.wabaId as string | null) ?? null,
          connectedViaEmbeddedSignup:
            (data.connectedViaEmbeddedSignup as boolean) ?? false,
        });
        const meta = data.meta as
          | {
              status: MetaSubscriptionSnapshot["status"];
              subscribedAt: string | null;
              error: string | null;
              callbackUrl: string | null;
              fields: string[];
            }
          | undefined;
        if (meta) {
          setMetaSnapshot({
            status: meta.status ?? "not_configured",
            subscribedAt: meta.subscribedAt ?? null,
            error: meta.error ?? null,
            callbackUrl: meta.callbackUrl ?? null,
            fields: meta.fields ?? [],
          });
        }
      }
      setLoaded(true);
    });
  }, [companyId]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasEmbeddedSignup && canEdit && (
        <Card className="bg-violet-500/5 border border-violet-500/20 rounded-xl">
          <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-violet-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-violet-300">
                  Conecte o WhatsApp automaticamente
                </p>
                <p className="text-xs text-violet-400/70 mt-0.5">
                  Autentique com o Facebook e preencheremos as credenciais por você.
                </p>
              </div>
            </div>
            <EmbeddedSignupButton companyId={companyId} />
          </CardContent>
        </Card>
      )}

      <Card className="bg-amber-500/5 border border-amber-500/20 rounded-xl">
        <CardContent className="flex items-start gap-3 pt-4">
          <ShieldCheck className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">
              Dados sensíveis criptografados
            </p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Todos os campos sensíveis são armazenados com criptografia AES-256-GCM.
            </p>
          </div>
        </CardContent>
      </Card>

      <WebhookCard
        companyId={companyId}
        webhookKey={webhookKey}
        verifyTokenMasked={credential?.verifyToken ?? ""}
        accessTokenMasked={credential?.accessToken ?? ""}
        metaAppId={credential?.metaAppId ?? ""}
        wabaId={credential?.wabaId ?? null}
        canManage={canEdit}
        connectedViaEmbeddedSignup={
          credential?.connectedViaEmbeddedSignup ?? false
        }
        initial={metaSnapshot}
      />

      <CredentialForm
        companyId={companyId}
        canEdit={canEdit}
        existingCredential={credential}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
```

- [ ] **Step 2: Incluir `connectedViaEmbeddedSignup` no retorno de `getCredential`**

Em `src/lib/actions/credential.ts`, dentro de `getCredential`, adicionar ao objeto `masked`:

```ts
    const masked = {
      id: credential.id,
      companyId: credential.companyId,
      metaAppId: credential.metaAppId,
      metaAppSecret: mask(decrypt(credential.metaAppSecret)),
      verifyToken: mask(decrypt(credential.verifyToken)),
      accessToken: mask(decrypt(credential.accessToken)),
      phoneNumberId: credential.phoneNumberId,
      wabaId: credential.wabaId,
      connectedViaEmbeddedSignup: credential.connectedViaEmbeddedSignup,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
```

Remover a chave `metaSystemUserToken` do retorno (não é mais usada pela UI).

- [ ] **Step 3: Rodar build de tipos**

```bash
npx tsc --noEmit
```

Esperado: nenhum erro relacionado a `credentials-tab`, `credential-form`, `webhook-card`, `credential`.

- [ ] **Step 4: Commit**

```bash
git add src/app/(protected)/companies/[id]/_components/credentials-tab.tsx src/lib/actions/credential.ts
git commit -m "$(cat <<'EOF'
refactor(ui): CredentialsTab orquestra WebhookCard + CredentialForm

WebhookCard no topo como protagonista. CredentialForm enxuto abaixo.
getCredential inclui connectedViaEmbeddedSignup para controlar accordion
de instruções manuais.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Atualizar docs e CLAUDE.md

**Files:**
- Modify: `docs/runbooks/embedded-signup-setup.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Ajustar runbook**

Em `docs/runbooks/embedded-signup-setup.md`, remover qualquer seção que peça ao usuário criar System User Token manualmente; substituir por referência ao fluxo Embedded Signup + nota de que para configuração manual, o mesmo token de acesso com escopos `whatsapp_business_management` + `whatsapp_business_messaging` é suficiente. (O agente deve reescrever a seção conforme o conteúdo atual do arquivo, mantendo o tom e mantendo referências a variáveis de env; conteúdo final deve estar coerente.)

- [ ] **Step 2: Atualizar `CLAUDE.md`**

Adicionar abaixo da linha "- **Fase 5:** CONCLUÍDA" uma nova entrada:

```markdown
- **Consolidação WhatsApp Cloud:** CONCLUÍDA — card Webhook unificado (config + status + ações Meta), remoção do System User Token separado (backend faz fallback accessToken), descrição atualizada e docs revistas. Corrige bug silencioso do Embedded Signup em que subscribe falhava por token faltando.
```

E atualizar a seção `## Próximo Passo` para manter apenas:

```markdown
## Próximo Passo
1. **Rotação automática de tokens 60d** — refresh pré-expiração + job BullMQ
2. **Remoção da coluna `metaSystemUserToken`** — migration após uma janela de monitoramento (ex: 30 dias sem uso pelo fallback)
```

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/embedded-signup-setup.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: consolidação WhatsApp Cloud concluída + próximos passos

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Schema — adicionar `deletedAt` em `Company`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_company_soft_delete/migration.sql`

- [ ] **Step 1: Editar schema**

No bloco `model Company`, adicionar após `isActive`:

```prisma
  isActive   Boolean  @default(true) @map("is_active")
  deletedAt  DateTime? @map("deleted_at")
```

Adicionar o índice abaixo de `@@map`:

```prisma
  @@index([deletedAt], name: "idx_company_deleted_at")
  @@map("companies")
```

- [ ] **Step 2: Gerar migration**

```bash
npx prisma migrate dev --name company_soft_delete --create-only
```

Esperado: arquivo gerado em `prisma/migrations/<timestamp>_company_soft_delete/migration.sql` contendo:

```sql
ALTER TABLE "companies" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "idx_company_deleted_at" ON "companies"("deleted_at");
```

- [ ] **Step 3: Regenerar cliente Prisma**

```bash
npx prisma generate
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "$(cat <<'EOF'
feat(db): soft-delete em Company via deletedAt

Coluna nullable indexada. Empresas excluídas permanecem no banco com
deletedAt setado; UI/actions filtram deletedAt IS NULL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Soft-delete em `deleteCompany` + filtro nas queries

**Files:**
- Modify: `src/lib/actions/company.ts`
- Test: `src/lib/actions/__tests__/company.test.ts`

- [ ] **Step 1: Escrever teste falhando — soft-delete não apaga dados**

Adicionar ao final de `src/lib/actions/__tests__/company.test.ts` (dentro do describe principal ou criar novo describe):

```ts
describe("deleteCompany (soft-delete)", () => {
  const companyId = "11111111-1111-4111-8111-111111111111";

  it("marca deletedAt e NÃO apaga relações", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...superAdmin, isSuperAdmin: true });
    prismaMock.company.findUnique.mockResolvedValue({
      id: companyId,
      deletedAt: null,
      webhookKey: "k",
      name: "Test",
    });
    prismaMock.company.update.mockResolvedValue({
      id: companyId,
      deletedAt: new Date(),
    } as never);

    const r = await deleteCompany(companyId);
    expect(r.success).toBe(true);

    expect(prismaMock.company.update).toHaveBeenCalledWith({
      where: { id: companyId },
      data: { deletedAt: expect.any(Date), isActive: false },
    });
    expect(prismaMock.webhookRoute.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.companyCredential.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.company.delete).not.toHaveBeenCalled();
  });

  it("getCompanies filtra deletedAt null", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...superAdmin, isSuperAdmin: true });
    prismaMock.company.findMany.mockResolvedValue([]);

    await getCompanies();

    const call = prismaMock.company.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ deletedAt: null });
  });

  it("getCompanyById retorna erro se empresa deletada", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...superAdmin, isSuperAdmin: true });
    prismaMock.company.findUnique.mockResolvedValue({
      id: companyId,
      deletedAt: new Date(),
    } as never);

    const r = await getCompanyById(companyId);
    expect(r.success).toBe(false);
    expect(r.error).toContain("não encontrada");
  });
});
```

Se o arquivo `company.test.ts` não importar `deleteCompany`, `getCompanies`, `getCompanyById`, ajustar imports no topo:

```ts
import {
  createCompany,
  updateCompany,
  deleteCompany,
  getCompanies,
  getCompanyById,
} from "../company";
```

- [ ] **Step 2: Rodar teste e ver falhar**

```bash
npx jest src/lib/actions/__tests__/company.test.ts -t "soft-delete"
```

Esperado: falha (atualmente hard-delete).

- [ ] **Step 3: Reescrever `deleteCompany` para soft-delete**

Em `src/lib/actions/company.ts`, substituir o corpo de `deleteCompany` (linhas ~359-419):

```ts
/**
 * Soft-deleta uma empresa: marca deletedAt e isActive=false.
 * Dados relacionados permanecem no banco para auditoria.
 * Apenas super_admin pode excluir.
 */
export async function deleteCompany(
  companyId: string
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };

    if (!user.isSuperAdmin) {
      return { success: false, error: "Apenas Super Admin pode excluir empresas" };
    }

    const existing = await prisma.company.findUnique({ where: { id: companyId } });
    if (!existing || existing.deletedAt) {
      return { success: false, error: "Empresa não encontrada" };
    }

    // Best-effort: tenta desinscrever webhook na Meta antes do soft-delete
    try {
      await unsubscribeWebhook(companyId);
    } catch (err) {
      console.warn("[deleteCompany] unsubscribeWebhook falhou (best-effort)", err);
    }

    await prisma.company.update({
      where: { id: companyId },
      data: { deletedAt: new Date(), isActive: false },
    });

    void logAudit({
      actorType: "user",
      actorId: user.id,
      actorLabel: user.email ?? user.id,
      companyId,
      action: "company.soft_delete",
      resourceType: "Company",
      resourceId: companyId,
      details: { name: existing.name },
    });

    revalidatePath("/companies");

    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir empresa:", error);
    return { success: false, error: "Erro ao excluir empresa" };
  }
}
```

- [ ] **Step 4: Filtrar `deletedAt: null` em `getCompanies` e `getCompanyById`**

Em `getCompanies` (linha ~35), adicionar ao objeto `where`:

```ts
    const where: Record<string, unknown> = { deletedAt: null };
```

Em `getCompanyById` (linha ~82), após buscar a empresa, adicionar check:

```ts
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { /* ... inalterado ... */ },
    });

    if (!company || company.deletedAt) {
      return { success: false, error: "Empresa não encontrada" };
    }
```

- [ ] **Step 5: Rodar testes**

```bash
npx jest src/lib/actions/__tests__/company.test.ts
```

Esperado: todos passam.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/company.ts src/lib/actions/__tests__/company.test.ts
git commit -m "$(cat <<'EOF'
feat(company): soft-delete real em deleteCompany

Marca deletedAt + isActive=false, mantém relações no banco para auditoria.
getCompanies/getCompanyById filtram deletedAt IS NULL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Corrigir abertura do `AlertDialog` em `EditCompanyDialog`

**Files:**
- Modify: `src/app/(protected)/companies/[id]/_components/edit-company-dialog.tsx`

**Motivação:** O `AlertDialog` de confirmação está aninhado DENTRO do `<Dialog>` outer (edit-company-dialog.tsx linhas 197-219). Em base-ui, esse aninhamento causa captura de eventos: o click em "Excluir Empresa" às vezes fecha o `Dialog` outer em vez de abrir o `AlertDialog`, e o comportamento observado pelo usuário é "a empresa só fica inativa". A correção é desaninhar — renderizar `AlertDialog` como sibling ao `Dialog`.

- [ ] **Step 1: Desaninhar `AlertDialog`**

Substituir integralmente o `return` de `EditCompanyDialog` (linhas 91-222 do arquivo atual). A estrutura vira:

```tsx
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={<Button variant="outline" className="gap-2 border-border text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer transition-all duration-200" />}
        >
          <Settings className="h-4 w-4" />
          Editar
        </DialogTrigger>
        <DialogContent className="bg-card border border-border rounded-2xl overflow-visible">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar Empresa</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Altere as informações da empresa.
            </DialogDescription>
          </DialogHeader>

          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-foreground/80">
                Nome da Empresa
              </Label>
              <Input
                id="edit-name"
                name="name"
                defaultValue={company.name}
                required
                minLength={2}
                maxLength={100}
                className={inputClasses}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-logoUrl" className="text-foreground/80">
                URL do Logo (opcional)
              </Label>
              <Input
                id="edit-logoUrl"
                name="logoUrl"
                type="url"
                defaultValue={company.logoUrl ?? ""}
                placeholder="https://example.com/logo.png"
                className={inputClasses}
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-200"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </div>
          </form>

          <div className="border-t border-border my-2" />

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleToggleActive}
              disabled={isPending}
              className={company.isActive
                ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 cursor-pointer transition-all duration-200"
                : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer transition-all duration-200"
              }
            >
              {company.isActive ? "Desativar Empresa" : "Reativar Empresa"}
            </Button>
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setDeleteOpen(true);
                }}
                disabled={isPending}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir Empresa
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="bg-card border border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              A empresa será removida do sistema, mas os dados permanecem no banco para auditoria. Esta ação não pode ser desfeita pela interface.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-all duration-200">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 text-white cursor-pointer transition-all duration-200"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
```

Notas-chave:
- `<>` fragment envolve Dialog + AlertDialog (desaninhados).
- Botão "Excluir Empresa" fecha o Dialog (`setOpen(false)`) antes de abrir o AlertDialog, garantindo que só um modal esteja ativo por vez.
- Texto da descrição atualizado para refletir o novo comportamento (soft-delete).

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep edit-company-dialog || echo "OK"
```

Esperado: `OK`.

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/companies/[id]/_components/edit-company-dialog.tsx
git commit -m "$(cat <<'EOF'
fix(ui): AlertDialog de excluir empresa abre corretamente

Aninhamento Dialog>AlertDialog capturava eventos e fazia o botão
"Excluir" se comportar como "Desativar". Desaninhado em fragment, com
Dialog fechado antes do AlertDialog abrir.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Build + smoke manual + PR

**Files:** — (nenhum)

- [ ] **Step 1: Rodar todos os testes**

```bash
npm test -- --runInBand
```

Esperado: todos os testes passam.

- [ ] **Step 2: Rodar build local**

```bash
npm run build:clean
```

Esperado: build conclui sem erros.

- [ ] **Step 3: Smoke manual (produção)**

Após o deploy automático (push main):

1. Abrir empresa → tab "WhatsApp Cloud".
2. Confirmar card "Webhook" no topo com URL, slug, verify token, badge e botões.
3. Confirmar que NÃO existe mais campo "Meta System User Token" nem card duplicado.
4. Clicar "Testar Conexão" — toast verde.
5. Clicar "Inscrever Webhook na Meta" — badge `pending` → `active`.
6. Alterar slug e "Salvar Configurações" — status vira `stale` após revalidação.
7. Empresa nova via Embedded Signup → badge fica `active` sem passos adicionais.
8. Abrir "Editar Empresa" → "Excluir Empresa" → AlertDialog ABRE → confirmar → lista não mostra mais a empresa; verificar no banco que `deleted_at` está preenchido e dados permanecem.

- [ ] **Step 4: Criar PR**

```bash
gh pr create --title "Consolidação WhatsApp Cloud + soft-delete Empresa" --body "$(cat <<'EOF'
## Summary
- Unifica "Configurações do Webhook" + "Webhook na Meta" em um único `WebhookCard`
- Deprecia `metaSystemUserToken` — backend faz fallback para `accessToken` (corrige bug silencioso do Embedded Signup)
- Soft-delete de empresas via `deletedAt`, com `AlertDialog` funcionando

## Test plan
- [ ] Empresa nova via Embedded Signup → badge `active` sem ação adicional
- [ ] Empresa manual → instruções do accordion suficientes
- [ ] Edit slug revalida status `stale`
- [ ] Excluir Empresa → AlertDialog abre; após confirmar, empresa some da UI mas dados permanecem no banco

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Cobertura do spec:** ✅
- Card Webhook unificado → Task 3 + Task 6.
- Remoção do System User Token da UI → Task 4.
- Fallback backend → Tasks 1 e 2.
- Preservação de campos mascarados → Task 5.
- Docs → Task 7.
- Schema soft-delete → Task 8.
- Action soft-delete + filtro queries → Task 9.
- Fix UI do AlertDialog de Excluir → Task 10.
- Verificação → Task 11.

**Placeholders:** nenhum TODO, "similar to", "add appropriate handling" etc. Código completo em cada step.

**Type consistency:**
- `MetaSubscriptionSnapshot` e `MetaSubscriptionStatus` definidos em Task 3, reimportados em Task 6.
- `resolveMetaToken` definido em Task 1, reusado em Task 2.
- `CredentialForm.existingCredential` perde `metaSystemUserToken` em Task 4; `CredentialsTab.MaskedCredential` idem em Task 6 — consistente.
- `Company.deletedAt` adicionado em Task 8, consumido em Task 9.

**Risco residual:**
- Task 5 tem que rodar antes da Task 6, senão o submit do credential-form quebra por verifyToken mascarado.
- Task 8 (migration) tem que rodar antes da Task 9 (action que usa `deletedAt`). A migration precisa ser aplicada no DB antes da Task 11.

**Ordem de execução:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11.

