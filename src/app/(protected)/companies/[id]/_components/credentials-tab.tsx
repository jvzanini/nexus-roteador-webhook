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
