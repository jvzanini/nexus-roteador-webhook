import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getCredential } from "@/lib/actions/credential";
import { CredentialForm } from "./credential-form";

interface MaskedCredential {
  id: string;
  companyId: string;
  metaAppId: string;
  metaAppSecret: string;
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CredentialsTabProps {
  companyId: string;
  webhookKey: string;
  canEdit?: boolean;
}

export async function CredentialsTab({ companyId, webhookKey, canEdit = true }: CredentialsTabProps) {
  const result = await getCredential(companyId);
  const credential = result.success ? (result.data as MaskedCredential | null) : null;

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

      {/* Formulario unificado — visualizacao + edicao no mesmo lugar */}
      <CredentialForm
        companyId={companyId}
        webhookKey={webhookKey}
        canEdit={canEdit}
        existingCredential={credential ? {
          metaAppId: credential.metaAppId,
          metaAppSecret: credential.metaAppSecret,
          verifyToken: credential.verifyToken,
          accessToken: credential.accessToken,
          phoneNumberId: credential.phoneNumberId,
          wabaId: credential.wabaId,
        } : null}
      />
    </div>
  );
}
