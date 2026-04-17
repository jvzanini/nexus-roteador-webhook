"use client";

import { useState, useTransition, useRef } from "react";
import { Save, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  upsertCredential,
  revealCredentialField,
} from "@/lib/actions/credential";
import { toast } from "sonner";

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
  plaintextMasking?: boolean;
}

function SensitiveInput({
  id,
  name,
  label,
  description,
  placeholder,
  defaultValue,
  required = true,
  visible,
  revealing,
  onToggle,
  inputRef,
  className,
  disabled = false,
  hideToggle = false,
  plaintextMasking = false,
}: SensitiveInputProps) {
  const displayValue =
    plaintextMasking && !visible && defaultValue
      ? defaultValue.length > 5
        ? "••••••••" + defaultValue.slice(-5)
        : defaultValue
      : defaultValue;

  return (
    <div className="space-y-2">
      <div>
        <Label
          htmlFor={id}
          className="text-sm font-medium text-foreground/80"
        >
          {label} {required && <span className="text-red-400">*</span>}
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="relative">
        {visible && displayValue && displayValue.length > 40 ? (
          <textarea
            ref={(el: HTMLTextAreaElement | null) => {
              inputRef(el as unknown as HTMLInputElement);
              if (el) {
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
              }
            }}
            id={id}
            name={name}
            defaultValue={displayValue}
            required={required}
            disabled={disabled}
            rows={1}
            style={{ height: "auto", minHeight: "44px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = target.scrollHeight + "px";
            }}
            className={`${className} ${hideToggle ? "" : "pr-10"} resize-none w-full overflow-hidden`}
          />
        ) : (
          <Input
            ref={inputRef}
            id={id}
            name={name}
            type="text"
            placeholder={placeholder}
            defaultValue={displayValue}
            required={required}
            disabled={disabled}
            readOnly={!visible && !!defaultValue}
            className={`${className} ${hideToggle ? "" : "pr-10"} ${!visible && defaultValue ? "font-mono tracking-wider" : ""}`}
          />
        )}
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

const inputClasses =
  "h-11 bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200 rounded-lg";

export function CredentialForm({
  companyId,
  canEdit = true,
  existingCredential,
  onSuccess,
}: CredentialFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {},
  );
  const [revealing, setRevealing] = useState<Record<string, boolean>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const plaintextFields = ["metaAppId", "phoneNumberId", "wabaId"];

  async function toggleField(field: string) {
    if (visible[field]) {
      setVisible((prev) => ({ ...prev, [field]: false }));
      const input = inputRefs.current[field];
      if (input && existingCredential) {
        const rawValue = existingCredential[
          field as keyof typeof existingCredential
        ] as string;
        if (plaintextFields.includes(field) && rawValue) {
          input.value =
            rawValue.length > 5
              ? "••••••••" + rawValue.slice(-5)
              : rawValue;
        } else if (rawValue && revealedValues[field]) {
          input.value = rawValue;
        }
      }
      return;
    }

    if (plaintextFields.includes(field) && existingCredential) {
      const rawValue = existingCredential[
        field as keyof typeof existingCredential
      ] as string;
      if (rawValue) {
        setVisible((prev) => ({ ...prev, [field]: true }));
        const input = inputRefs.current[field];
        if (input) input.value = rawValue;
        return;
      }
    }

    if (revealedValues[field]) {
      setVisible((prev) => ({ ...prev, [field]: true }));
      const input = inputRefs.current[field];
      if (input) input.value = revealedValues[field];
      return;
    }

    const encryptedFields = ["metaAppSecret", "accessToken"];
    if (existingCredential && encryptedFields.includes(field)) {
      setRevealing((prev) => ({ ...prev, [field]: true }));
      const result = await revealCredentialField(
        companyId,
        field as "metaAppSecret" | "accessToken",
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

    setVisible((prev) => ({ ...prev, [field]: true }));
  }

  function getPlaintextValue(formData: FormData, fieldName: string): string {
    const formValue = formData.get(fieldName) as string;
    if (formValue && formValue.startsWith("••••••••") && existingCredential) {
      const original = existingCredential[
        fieldName as keyof typeof existingCredential
      ] as string;
      if (original) return original;
    }
    return formValue;
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await upsertCredential(companyId, {
        metaAppId: getPlaintextValue(formData, "metaAppId"),
        metaAppSecret: formData.get("metaAppSecret") as string,
        verifyToken: (existingCredential?.verifyToken ?? ""),
        accessToken: formData.get("accessToken") as string,
        phoneNumberId: getPlaintextValue(formData, "phoneNumberId"),
        wabaId: getPlaintextValue(formData, "wabaId"),
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        toast.success("Credenciais salvas");
        onSuccess?.();
      } else {
        setError(result.error ?? "Erro desconhecido");
        toast.error(result.error ?? "Erro desconhecido");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <SensitiveInput
        id="metaAppId"
        name="metaAppId"
        label="Meta App ID"
        description="Identificador do aplicativo no painel Meta for Developers"
        placeholder="123456789"
        defaultValue={existingCredential?.metaAppId}
        visible={!!visible["metaAppId"]}
        revealing={!!revealing["metaAppId"]}
        onToggle={() => toggleField("metaAppId")}
        inputRef={(el) => {
          inputRefs.current["metaAppId"] = el;
        }}
        className={inputClasses}
        disabled={!canEdit}
        hideToggle={!canEdit}
        plaintextMasking={!!existingCredential?.metaAppId}
      />

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
        inputRef={(el) => {
          inputRefs.current["metaAppSecret"] = el;
        }}
        className={inputClasses}
        disabled={!canEdit}
        hideToggle={!canEdit}
      />

      <SensitiveInput
        id="accessToken"
        name="accessToken"
        label="Token de Acesso"
        description="Token do portfólio empresarial da Meta com escopos whatsapp_business_management e whatsapp_business_messaging. O Embedded Signup cuida disso automaticamente."
        placeholder="EAAxxxxxxxx"
        defaultValue={existingCredential?.accessToken}
        visible={!!visible["accessToken"]}
        revealing={!!revealing["accessToken"]}
        onToggle={() => toggleField("accessToken")}
        inputRef={(el) => {
          inputRefs.current["accessToken"] = el;
        }}
        className={inputClasses}
        disabled={!canEdit}
        hideToggle={!canEdit}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SensitiveInput
          id="phoneNumberId"
          name="phoneNumberId"
          label="Phone Number ID"
          description="ID do número de telefone na API do WhatsApp Cloud"
          placeholder="109876543"
          defaultValue={existingCredential?.phoneNumberId ?? ""}
          visible={!!visible["phoneNumberId"]}
          revealing={!!revealing["phoneNumberId"]}
          onToggle={() => toggleField("phoneNumberId")}
          inputRef={(el) => {
            inputRefs.current["phoneNumberId"] = el;
          }}
          className={inputClasses}
          disabled={!canEdit}
          hideToggle={!canEdit}
          plaintextMasking={!!existingCredential?.phoneNumberId}
        />

        <SensitiveInput
          id="wabaId"
          name="wabaId"
          label="WABA ID"
          description="ID da conta comercial do WhatsApp (WhatsApp Business Account)"
          placeholder="112233445566"
          defaultValue={existingCredential?.wabaId ?? ""}
          visible={!!visible["wabaId"]}
          revealing={!!revealing["wabaId"]}
          onToggle={() => toggleField("wabaId")}
          inputRef={(el) => {
            inputRefs.current["wabaId"] = el;
          }}
          className={inputClasses}
          disabled={!canEdit}
          hideToggle={!canEdit}
          plaintextMasking={!!existingCredential?.wabaId}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && (
        <p className="text-sm text-emerald-400">Credenciais salvas com sucesso!</p>
      )}

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
