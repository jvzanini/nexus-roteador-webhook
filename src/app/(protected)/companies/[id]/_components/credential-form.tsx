"use client";

import { useState, useTransition } from "react";
import { Save, Loader2, Eye, EyeOff, Globe, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { upsertCredential } from "@/lib/actions/credential";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://roteadorwebhook.nexusai360.com";

interface CredentialFormProps {
  companyId: string;
  webhookKey: string;
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

export function CredentialForm({ companyId, webhookKey, existingCredential, onSuccess }: CredentialFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  // Toggle visibility per field
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  function toggleField(field: string) {
    setVisible((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  const webhookUrl = `${APP_URL}/api/webhook/${webhookKey}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await upsertCredential(companyId, {
        metaAppId: formData.get("metaAppId") as string,
        metaAppSecret: formData.get("metaAppSecret") as string,
        verifyToken: formData.get("verifyToken") as string,
        accessToken: formData.get("accessToken") as string,
        phoneNumberId: (formData.get("phoneNumberId") as string) || undefined,
        wabaId: (formData.get("wabaId") as string) || undefined,
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        onSuccess?.();
      } else {
        setError(result.error ?? "Erro desconhecido");
      }
    });
  }

  const inputClasses = "h-11 bg-zinc-800/50 border-zinc-700/50 text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all duration-200 rounded-lg";

  function SensitiveInput({ id, name, label, placeholder, defaultValue, required = true }: {
    id: string; name: string; label: string; placeholder: string; defaultValue?: string; required?: boolean;
  }) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id} className="text-sm font-medium text-zinc-300">
          {label} {required && <span className="text-red-400">*</span>}
        </Label>
        <div className="relative">
          <Input
            id={id}
            name={name}
            type={visible[id] ? "text" : "password"}
            placeholder={placeholder}
            defaultValue={defaultValue}
            required={required}
            className={`${inputClasses} pr-10`}
          />
          <button
            type="button"
            onClick={() => toggleField(id)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            {visible[id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Webhook URL card */}
      <Card className="bg-zinc-800/30 border border-zinc-700/40 rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium text-zinc-300">URL do Webhook</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-700/30">
            <code className="text-xs text-zinc-400 truncate flex-1 font-mono">{webhookUrl}</code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 p-1 rounded hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-zinc-500" />}
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-2">Configure esta URL no painel do Meta App como Webhook Callback URL.</p>
        </CardContent>
      </Card>

      {/* Credenciais */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="metaAppId" className="text-sm font-medium text-zinc-300">
            Meta App ID <span className="text-red-400">*</span>
          </Label>
          <Input
            id="metaAppId"
            name="metaAppId"
            placeholder="123456789"
            defaultValue={existingCredential?.metaAppId}
            required
            className={inputClasses}
          />
        </div>

        <SensitiveInput
          id="metaAppSecret"
          name="metaAppSecret"
          label="Meta App Secret"
          placeholder="Seu app secret"
          defaultValue={existingCredential?.metaAppSecret}
        />

        <SensitiveInput
          id="verifyToken"
          name="verifyToken"
          label="Verify Token"
          placeholder="Token de verificacao para webhook"
          defaultValue={existingCredential?.verifyToken}
        />

        <SensitiveInput
          id="accessToken"
          name="accessToken"
          label="Access Token"
          placeholder="EAAxxxxxxxx"
          defaultValue={existingCredential?.accessToken}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phoneNumberId" className="text-sm font-medium text-zinc-300">
              Phone Number ID <span className="text-red-400">*</span>
            </Label>
            <Input
              id="phoneNumberId"
              name="phoneNumberId"
              placeholder="109876543"
              defaultValue={existingCredential?.phoneNumberId ?? ""}
              required
              className={inputClasses}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wabaId" className="text-sm font-medium text-zinc-300">
              WABA ID <span className="text-red-400">*</span>
            </Label>
            <Input
              id="wabaId"
              name="wabaId"
              placeholder="112233445566"
              defaultValue={existingCredential?.wabaId ?? ""}
              required
              className={inputClasses}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">Credenciais salvas com sucesso!</p>}

      <Button
        type="submit"
        disabled={isPending}
        className="gap-2 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-all duration-200"
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
    </form>
  );
}
