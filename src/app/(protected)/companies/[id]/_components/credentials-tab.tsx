"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getCredential } from "@/lib/actions/credential";
import { CredentialForm } from "./credential-form";
import { EmbeddedSignupButton } from "./embedded-signup-button";
import {
  MetaSubscriptionPanel,
  type MetaSubscriptionSnapshot,
} from "./meta-subscription-panel";

interface MaskedCredential {
  metaAppId: string;
  metaAppSecret: string;
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  metaSystemUserToken: string | null;
}

interface CredentialsTabProps {
  companyId: string;
  webhookKey: string;
  canEdit?: boolean;
  hasEmbeddedSignup?: boolean;
}

export function CredentialsTab({ companyId, webhookKey, canEdit = true, hasEmbeddedSignup = false }: CredentialsTabProps) {
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
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getCredential(companyId);
      if (result.success && result.data) {
        const data = result.data as any;
        setCredential({
          metaAppId: data.metaAppId,
          metaAppSecret: data.metaAppSecret,
          verifyToken: data.verifyToken,
          accessToken: data.accessToken,
          phoneNumberId: data.phoneNumberId,
          wabaId: data.wabaId,
          metaSystemUserToken: data.metaSystemUserToken ?? null,
        });
        if (data.meta) {
          setMetaSnapshot({
            status: data.meta.status ?? "not_configured",
            subscribedAt: data.meta.subscribedAt ?? null,
            error: data.meta.error ?? null,
            callbackUrl: data.meta.callbackUrl ?? null,
            fields: data.meta.fields ?? [],
          });
        }
      }
      setLoaded(true);
    });
  }, [companyId]);

  // Prereqs p/ subscribe: metaAppId, wabaId, verifyToken (sempre presente se form preenchido), metaSystemUserToken
  const prereqsMissing: string[] = [];
  if (!credential?.metaAppId) prereqsMissing.push("metaAppId");
  if (!credential?.wabaId) prereqsMissing.push("wabaId");
  if (!credential?.verifyToken) prereqsMissing.push("verifyToken");
  if (!credential?.metaSystemUserToken) prereqsMissing.push("metaSystemUserToken");

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Embedded Signup — fluxo automático */}
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

      {/* Aviso de seguranca */}
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

      {hasEmbeddedSignup && canEdit && (
        <p className="text-xs text-muted-foreground px-1">
          Prefira o fluxo automático acima — os campos abaixo serão preenchidos automaticamente após a conexão.
        </p>
      )}

      {/* Formulario unificado */}
      <CredentialForm
        companyId={companyId}
        webhookKey={webhookKey}
        canEdit={canEdit}
        existingCredential={credential}
        onSuccess={() => router.refresh()}
      />

      {/* Painel de inscrição Meta */}
      <MetaSubscriptionPanel
        companyId={companyId}
        initial={metaSnapshot}
        canManage={canEdit}
        prereqsMissing={prereqsMissing}
      />
    </div>
  );
}
