"use client";

import { useState, useTransition, useRef } from "react";
import { Save, Loader2, Eye, EyeOff, Globe, Copy, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { upsertCredential, revealCredentialField } from "@/lib/actions/credential";
import { updateCompany } from "@/lib/actions/company";
import { toast } from "sonner";

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
  disabled?: boolean;
  hideToggle?: boolean;
}

function SensitiveInput({ id, name, label, description, placeholder, defaultValue, required = true, visible, revealing, onToggle, inputRef, className, disabled = false, hideToggle = false }: SensitiveInputProps) {
  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor={id} className="text-sm font-medium text-foreground/80">
          {label} {required && <span className="text-red-400">*</span>}
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
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
          disabled={disabled}
          className={`${className} ${hideToggle ? "" : "pr-10"}`}
        />
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
  webhookKey: string;
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

export function CredentialForm({ companyId, webhookKey, canEdit = true, existingCredential, onSuccess }: CredentialFormProps) {
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
    toast.success("URL copiada");
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

  // Slug state
  const [slug, setSlug] = useState("");
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugSaving, setSlugSaving] = useState(false);

  async function handleSaveSlug() {
    if (!slug.trim()) return;
    setSlugSaving(true);
    const result = await updateCompany(companyId, { slug: slug.trim() });
    setSlugSaving(false);
    if (result.success) {
      toast.success("Slug atualizado");
      setEditingSlug(false);
    } else {
      toast.error(result.error || "Erro ao atualizar slug");
    }
  }

  const inputClasses = "h-11 bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200 rounded-lg";

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* URL do Webhook + Slug unificado */}
      <Card className="bg-card border border-border rounded-xl">
        <CardContent className="py-4 px-5 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-medium text-foreground">URL do Webhook</h3>
          </div>

          {/* URL display com botao de copiar */}
          <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2.5">
            <code className="text-sm text-muted-foreground flex-1 truncate">
              {webhookUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure esta URL no painel do Meta App como Webhook Callback URL.
          </p>

          {/* Slug da empresa */}
          <div className="pt-3 border-t border-border space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-foreground">Slug da Empresa</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Identificador unico usado na URL do webhook. Ex: /api/webhook/<span className="font-mono">minha-empresa</span>
                </p>
              </div>
              {canEdit && !editingSlug && (
                <button
                  type="button"
                  onClick={() => { setSlug(webhookKey); setEditingSlug(true); }}
                  className="text-violet-400 hover:text-violet-300 cursor-pointer transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>

            {editingSlug && canEdit ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-mono">/</span>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="minha-empresa"
                  className="h-9 text-sm flex-1 min-w-[120px]"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveSlug}
                  disabled={slugSaving || !slug.trim()}
                  className="h-9 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
                >
                  Salvar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => { setEditingSlug(false); setSlug(webhookKey); }}
                  className="h-9 text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-200"
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                <code className="text-sm text-foreground font-mono">/{webhookKey}</code>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Credenciais */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div>
            <Label htmlFor="metaAppId" className="text-sm font-medium text-foreground/80">
              Meta App ID <span className="text-red-400">*</span>
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">Identificador do aplicativo no painel Meta for Developers</p>
          </div>
          <Input
            id="metaAppId"
            name="metaAppId"
            placeholder="123456789"
            defaultValue={existingCredential?.metaAppId}
            required
            disabled={!canEdit}
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
          disabled={!canEdit}
          hideToggle={!canEdit}
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
          disabled={!canEdit}
          hideToggle={!canEdit}
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
          disabled={!canEdit}
          hideToggle={!canEdit}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div>
              <Label htmlFor="phoneNumberId" className="text-sm font-medium text-foreground/80">
                Phone Number ID <span className="text-red-400">*</span>
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">ID do número de telefone na API do WhatsApp Business</p>
            </div>
            <Input
              id="phoneNumberId"
              name="phoneNumberId"
              placeholder="109876543"
              defaultValue={existingCredential?.phoneNumberId ?? ""}
              required
              disabled={!canEdit}
              className={inputClasses}
            />
          </div>

          <div className="space-y-2">
            <div>
              <Label htmlFor="wabaId" className="text-sm font-medium text-foreground/80">
                WABA ID <span className="text-red-400">*</span>
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">ID da conta comercial do WhatsApp (WhatsApp Business Account)</p>
            </div>
            <Input
              id="wabaId"
              name="wabaId"
              placeholder="112233445566"
              defaultValue={existingCredential?.wabaId ?? ""}
              required
              disabled={!canEdit}
              className={inputClasses}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">Credenciais salvas com sucesso!</p>}

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
