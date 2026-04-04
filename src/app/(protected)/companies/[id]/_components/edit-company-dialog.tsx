"use client";

import { useState, useTransition } from "react";
import { Settings, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCompany } from "@/lib/actions/company";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://roteadorwebhook.nexusai360.com";

interface EditCompanyDialogProps {
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
    isActive: boolean;
    webhookKey: string;
  };
}

export function EditCompanyDialog({ company }: EditCompanyDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [webhookKeyValue, setWebhookKeyValue] = useState(company.webhookKey);

  const webhookUrlPreview = `${APP_URL}/api/webhook/${webhookKeyValue}`;

  function handleSubmit(formData: FormData) {
    setError(null);

    const name = formData.get("name") as string;
    const logoUrl = formData.get("logoUrl") as string;
    const webhookKey = formData.get("webhookKey") as string;

    startTransition(async () => {
      const result = await updateCompany(company.id, {
        name,
        logoUrl: logoUrl || undefined,
        webhookKey: webhookKey || undefined,
      });

      if (result.success) {
        setOpen(false);
      } else {
        setError(result.error ?? "Erro desconhecido");
      }
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const result = await updateCompany(company.id, {
        isActive: !company.isActive,
      });

      if (!result.success) {
        setError(result.error ?? "Erro desconhecido");
      }
    });
  }

  const inputClasses = "bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" className="gap-2 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer transition-all duration-200" />}
      >
        <Settings className="h-4 w-4" />
        Editar
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border border-zinc-800 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Editar Empresa</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Altere as informacoes da empresa. O slug sera regenerado se o nome mudar.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-zinc-300">
              Nome da Empresa
            </Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={company.name}
              required
              minLength={2}
              maxLength={100}
              className={inputClasses}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-logoUrl" className="text-zinc-300">
              URL do Logo (opcional)
            </Label>
            <Input
              id="edit-logoUrl"
              name="logoUrl"
              type="url"
              defaultValue={company.logoUrl ?? ""}
              placeholder="https://example.com/logo.png"
              className={inputClasses}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-webhookKey" className="text-zinc-300">
              Webhook Key
            </Label>
            <Input
              id="edit-webhookKey"
              name="webhookKey"
              defaultValue={company.webhookKey}
              minLength={4}
              maxLength={50}
              pattern="^[a-zA-Z0-9_-]+$"
              className={inputClasses}
              onChange={(e) => setWebhookKeyValue(e.target.value)}
            />
            <p className="text-xs text-amber-400">
              Cuidado: alterar a key invalida a URL configurada na Meta.
            </p>
            <p className="text-xs text-zinc-500 font-mono break-all">
              {webhookUrlPreview}
            </p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={handleToggleActive}
              disabled={isPending}
              className="sm:mr-auto cursor-pointer transition-all duration-200"
            >
              {company.isActive ? "Desativar Empresa" : "Reativar Empresa"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-zinc-400 hover:text-zinc-200 cursor-pointer transition-all duration-200"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-all duration-200"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
