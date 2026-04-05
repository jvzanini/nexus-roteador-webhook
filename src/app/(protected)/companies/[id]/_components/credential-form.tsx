"use client";

import { useState, useTransition, useRef } from "react";
import { Save, Loader2, Eye, EyeOff, Globe, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { upsertCredential, revealCredentialField } from "@/lib/actions/credential";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://roteadorwebhook.nexusai360.com";

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
}

function SensitiveInput({ id, name, label, description, placeholder, defaultValue, required = true, visible, revealing, onToggle, inputRef, className }: SensitiveInputProps) {
  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor={id} className="text-sm font-medium text-zinc-300">
          {label} {required && <span className="text-red-400">*</span>}
        </Label>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          defaultValue={defaultValue}
          required={required}
          className={`${className} pr-10`}
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={revealing}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
        >
          {revealing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

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

  // Toggle visibility per field — revela valor descriptografado do servidor
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<Record<string, boolean>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function toggleField(field: string) {
    if (visible[field]) {
      // Esconder — restaurar valor mascarado original
      setVisible((prev) => ({ ...prev, [field]: false }));
      const input = inputRefs.current[field];
      if (input && existingCredential) {
        const maskedValue = existingCredential[field as keyof typeof existingCredential] as string;
        if (maskedValue && revealedValues[field]) {
          input.value = maskedValue;
        }
      }
      return;
    }

    // Se ja revelou antes, reutiliza
    if (revealedValues[field]) {
      setVisible((prev) => ({ ...prev, [field]: true }));
      const input = inputRefs.current[field];
      if (input) input.value = revealedValues[field];
      return;
    }

    // Revelar — buscar valor do servidor (apenas campos criptografados)
    const encryptedFields = ["metaAppSecret", "verifyToken", "accessToken"];
    if (existingCredential && encryptedFields.includes(field)) {
      setRevealing((prev) => ({ ...prev, [field]: true }));
      const result = await revealCredentialField(
        companyId,
        field as "metaAppSecret" | "verifyToken" | "accessToken"
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

    // Fallback — apenas toggle tipo do input (campo novo sem dados salvos)
    setVisible((prev) => ({ ...prev, [field]: true }));
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
        phoneNumberId: formData.get("phoneNumberId") as string,
        wabaId: formData.get("wabaId") as string,
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
          <div>
            <Label htmlFor="metaAppId" className="text-sm font-medium text-zinc-300">
              Meta App ID <span className="text-red-400">*</span>
            </Label>
            <p className="text-xs text-zinc-500 mt-0.5">Identificador do aplicativo no painel Meta for Developers</p>
          </div>
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
          description="Chave secreta do aplicativo — não compartilhe"
          placeholder="Seu app secret"
          defaultValue={existingCredential?.metaAppSecret}
          visible={!!visible["metaAppSecret"]}
          revealing={!!revealing["metaAppSecret"]}
          onToggle={() => toggleField("metaAppSecret")}
          inputRef={(el) => { inputRefs.current["metaAppSecret"] = el; }}
          className={inputClasses}
        />

        <SensitiveInput
          id="verifyToken"
          name="verifyToken"
          label="Token de Verificação"
          description="Token usado pela Meta para validar o endpoint do webhook"
          placeholder="Token de verificação para webhook"
          defaultValue={existingCredential?.verifyToken}
          visible={!!visible["verifyToken"]}
          revealing={!!revealing["verifyToken"]}
          onToggle={() => toggleField("verifyToken")}
          inputRef={(el) => { inputRefs.current["verifyToken"] = el; }}
          className={inputClasses}
        />

        <SensitiveInput
          id="accessToken"
          name="accessToken"
          label="Token de Acesso"
          description="Token de autorização para enviar mensagens via WhatsApp API"
          placeholder="EAAxxxxxxxx"
          defaultValue={existingCredential?.accessToken}
          visible={!!visible["accessToken"]}
          revealing={!!revealing["accessToken"]}
          onToggle={() => toggleField("accessToken")}
          inputRef={(el) => { inputRefs.current["accessToken"] = el; }}
          className={inputClasses}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div>
              <Label htmlFor="phoneNumberId" className="text-sm font-medium text-zinc-300">
                Phone Number ID <span className="text-red-400">*</span>
              </Label>
              <p className="text-xs text-zinc-500 mt-0.5">ID do número de telefone na API do WhatsApp Business</p>
            </div>
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
            <div>
              <Label htmlFor="wabaId" className="text-sm font-medium text-zinc-300">
                WABA ID <span className="text-red-400">*</span>
              </Label>
              <p className="text-xs text-zinc-500 mt-0.5">ID da conta comercial do WhatsApp (WhatsApp Business Account)</p>
            </div>
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
