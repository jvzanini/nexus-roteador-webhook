"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getCredential } from "@/lib/actions/credential";
import { CredentialForm } from "./credential-form";

interface MaskedCredential {
  metaAppId: string;
  metaAppSecret: string;
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string | null;
  wabaId: string | null;
}

interface CredentialsTabProps {
  companyId: string;
  webhookKey: string;
  canEdit?: boolean;
}

export function CredentialsTab({ companyId, webhookKey, canEdit = true }: CredentialsTabProps) {
  const router = useRouter();
  const [credential, setCredential] = useState<MaskedCredential | null>(null);
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
        });
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

      {/* Formulario unificado */}
      <CredentialForm
        companyId={companyId}
        webhookKey={webhookKey}
        canEdit={canEdit}
        existingCredential={credential}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
