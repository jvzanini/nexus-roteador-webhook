import { Key, ShieldCheck, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCredential } from "@/lib/actions/credential";
import { SensitiveField } from "./sensitive-field";
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
}

export async function CredentialsTab({ companyId }: CredentialsTabProps) {
  const result = await getCredential(companyId);
  const credential = result.success ? (result.data as MaskedCredential | null) : null;

  return (
    <div className="space-y-6">
      {/* Aviso de seguranca */}
      <Card className="bg-amber-500/5 border-amber-500/20">
        <CardContent className="flex items-start gap-3 pt-4">
          <ShieldCheck className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">
              Dados sensiveis criptografados
            </p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Todos os campos sensiveis sao armazenados com criptografia AES-256-GCM.
              Use o botao de olho para revelar valores temporariamente.
            </p>
          </div>
        </CardContent>
      </Card>

      {credential ? (
        <>
          {/* Credenciais existentes — exibir mascaradas */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Key className="h-4 w-4" />
                Credenciais Meta Configuradas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Campo nao-sensivel */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">
                  Meta App ID
                </label>
                <div className="p-2.5 rounded-md bg-zinc-800/50 border border-zinc-700/50">
                  <code className="text-sm text-zinc-300 font-mono">
                    {credential.metaAppId}
                  </code>
                </div>
              </div>

              {/* Campos sensiveis com toggle */}
              <SensitiveField
                label="Meta App Secret"
                maskedValue={credential.metaAppSecret}
                companyId={companyId}
                fieldName="metaAppSecret"
              />

              <SensitiveField
                label="Verify Token"
                maskedValue={credential.verifyToken}
                companyId={companyId}
                fieldName="verifyToken"
              />

              <SensitiveField
                label="Access Token"
                maskedValue={credential.accessToken}
                companyId={companyId}
                fieldName="accessToken"
              />

              {/* Campos opcionais nao-sensiveis */}
              {credential.phoneNumberId && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">
                    Phone Number ID
                  </label>
                  <div className="p-2.5 rounded-md bg-zinc-800/50 border border-zinc-700/50">
                    <code className="text-sm text-zinc-300 font-mono">
                      {credential.phoneNumberId}
                    </code>
                  </div>
                </div>
              )}

              {credential.wabaId && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">
                    WABA ID
                  </label>
                  <div className="p-2.5 rounded-md bg-zinc-800/50 border border-zinc-700/50">
                    <code className="text-sm text-zinc-300 font-mono">
                      {credential.wabaId}
                    </code>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Formulario para atualizar */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-300">
                Atualizar Credenciais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-zinc-500 mb-4">
                Preencha todos os campos para atualizar as credenciais.
                Os valores antigos serao substituidos.
              </p>
              <CredentialForm companyId={companyId} />
            </CardContent>
          </Card>
        </>
      ) : (
        /* Sem credenciais — exibir formulario de criacao */
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Nenhuma credencial configurada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-500 mb-6">
              Configure as credenciais do Meta App para que o sistema possa
              receber e validar webhooks desta empresa.
            </p>
            <CredentialForm companyId={companyId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
