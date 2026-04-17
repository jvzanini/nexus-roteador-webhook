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
import { revealCredentialField } from "@/lib/actions/credential";
import {
  testMetaConnection,
  subscribeWebhook,
  unsubscribeWebhook,
  verifyMetaSubscription,
  generateVerifyToken,
  updateVerifyToken,
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
        const r = await updateVerifyToken(companyId, verifyValue);
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
