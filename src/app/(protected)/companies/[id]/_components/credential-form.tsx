"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertCredential } from "@/lib/actions/credential";

interface CredentialFormProps {
  companyId: string;
  onSuccess?: () => void;
}

export function CredentialForm({ companyId, onSuccess }: CredentialFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="metaAppId" className="text-zinc-300">
            Meta App ID *
          </Label>
          <Input
            id="metaAppId"
            name="metaAppId"
            placeholder="123456789"
            required
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="metaAppSecret" className="text-zinc-300">
            Meta App Secret *
          </Label>
          <Input
            id="metaAppSecret"
            name="metaAppSecret"
            type="password"
            placeholder="Seu app secret"
            required
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="verifyToken" className="text-zinc-300">
            Verify Token *
          </Label>
          <Input
            id="verifyToken"
            name="verifyToken"
            type="password"
            placeholder="Token de verificacao"
            required
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="accessToken" className="text-zinc-300">
            Access Token *
          </Label>
          <Input
            id="accessToken"
            name="accessToken"
            type="password"
            placeholder="EAAxxxxxxxx"
            required
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phoneNumberId" className="text-zinc-300">
            Phone Number ID (opcional)
          </Label>
          <Input
            id="phoneNumberId"
            name="phoneNumberId"
            placeholder="109876543"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="wabaId" className="text-zinc-300">
            WABA ID (opcional)
          </Label>
          <Input
            id="wabaId"
            name="wabaId"
            placeholder="112233445566"
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && (
        <p className="text-sm text-emerald-400">
          Credenciais salvas com sucesso!
        </p>
      )}

      <Button type="submit" disabled={isPending} className="gap-2">
        <Save className="h-4 w-4" />
        {isPending ? "Salvando..." : "Salvar Credenciais"}
      </Button>
    </form>
  );
}
