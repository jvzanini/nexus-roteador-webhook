"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  CircleAlert,
  Circle,
  Webhook,
  Plug,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRealtime } from "@/hooks/use-realtime";
import {
  testMetaConnection,
  subscribeWebhook,
  unsubscribeWebhook,
  verifyMetaSubscription,
} from "@/lib/actions/meta-subscription";

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
  initial: MetaSubscriptionSnapshot;
  canManage: boolean;
  prereqsMissing: string[];
}

type ActionKey = "test" | "subscribe" | "verify" | "unsubscribe" | null;

function StatusBadge({ status }: { status: MetaSubscriptionStatus }) {
  const config = {
    not_configured: {
      label: "Não configurado",
      icon: Circle,
      classes:
        "text-slate-600 dark:text-slate-400 bg-slate-500/10 border-slate-500/20",
      spin: false,
    },
    pending: {
      label: "Inscrevendo...",
      icon: Loader2,
      classes:
        "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
      spin: true,
    },
    active: {
      label: "Ativo",
      icon: CheckCircle2,
      classes:
        "text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20",
      spin: false,
    },
    stale: {
      label: "Divergente",
      icon: AlertTriangle,
      classes:
        "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
      spin: false,
    },
    error: {
      label: "Erro",
      icon: CircleAlert,
      classes:
        "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20",
      spin: false,
    },
  }[status];

  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${config.classes}`}
    >
      <Icon className={`h-3.5 w-3.5 ${config.spin ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Nunca inscrito";
  try {
    const d = new Date(iso);
    return `Última inscrição: ${format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`;
  } catch {
    return "Última inscrição: data inválida";
  }
}

export function MetaSubscriptionPanel({
  companyId,
  initial,
  canManage,
  prereqsMissing,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<ActionKey>(null);

  useRealtime((event) => {
    if (event.type === "credential:updated" && event.companyId === companyId) {
      router.refresh();
    }
  });

  async function runAction(
    key: Exclude<ActionKey, null>,
    fn: () => Promise<{ success: boolean; error?: string; data?: unknown }>,
    successMessage: string
  ) {
    setBusy(key);
    try {
      const result = await fn();
      if (result.success) {
        toast.success(successMessage);
      } else {
        toast.error(result.error ?? "Erro desconhecido");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  const hasPrereqs = prereqsMissing.length === 0;
  const isDisabled = busy !== null;

  const subscribeTitle = hasPrereqs
    ? "Inscrever webhook na Meta"
    : `Campos faltando: ${prereqsMissing.join(", ")}`;

  const showPostConfigButtons = initial.status !== "not_configured";

  return (
    <Card className="bg-card border border-border rounded-xl">
      <CardContent className="py-5 px-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-violet-500 dark:text-violet-400" />
            <h3 className="text-sm font-semibold text-foreground">
              Webhook na Meta
            </h3>
          </div>
          <StatusBadge status={initial.status} />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {formatTimestamp(initial.subscribedAt)}
          </p>
          {initial.callbackUrl && (
            <p className="text-xs text-muted-foreground">
              Callback: <code className="font-mono">{initial.callbackUrl}</code>
            </p>
          )}
          {initial.fields.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Fields: <code className="font-mono">{initial.fields.join(", ")}</code>
            </p>
          )}
        </div>

        {initial.status === "stale" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Detectamos divergência com a Meta — clique em Revalidar ou Reinscrever.
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

        {canManage && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isDisabled}
              onClick={() =>
                runAction(
                  "test",
                  () => testMetaConnection(companyId),
                  "Conexão OK"
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
              title={subscribeTitle}
              onClick={() =>
                runAction(
                  "subscribe",
                  () => subscribeWebhook(companyId),
                  "Webhook inscrito"
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
                      "Revalidação concluída"
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
                    if (!window.confirm("Desinscrever webhook da Meta?")) return;
                    runAction(
                      "unsubscribe",
                      () => unsubscribeWebhook(companyId),
                      "Webhook desinscrito"
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
      </CardContent>
    </Card>
  );
}
