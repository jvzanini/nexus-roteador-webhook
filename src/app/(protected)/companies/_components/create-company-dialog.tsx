"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
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
import { createCompany } from "@/lib/actions/company";

export function CreateCompanyDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);

    const name = formData.get("name") as string;
    const logoUrl = formData.get("logoUrl") as string;
    const webhookKey = formData.get("webhookKey") as string;

    startTransition(async () => {
      const result = await createCompany({
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-all duration-200 hover:shadow-[0_0_16px_rgba(37,99,235,0.3)]" />}
      >
        <Plus className="h-4 w-4" />
        Nova Empresa
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border border-zinc-800 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Criar Empresa</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Adicione uma nova empresa para configurar o roteamento de webhooks.
            O slug e a webhook key serao gerados automaticamente se nao informados.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-zinc-300">
              Nome da Empresa
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="Ex: Empresa ABC"
              required
              minLength={2}
              maxLength={100}
              className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logoUrl" className="text-zinc-300">
              URL do Logo (opcional)
            </Label>
            <Input
              id="logoUrl"
              name="logoUrl"
              type="url"
              placeholder="https://example.com/logo.png"
              className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhookKey" className="text-zinc-300">
              Webhook Key (opcional)
            </Label>
            <Input
              id="webhookKey"
              name="webhookKey"
              placeholder="Deixe vazio para gerar automaticamente"
              minLength={4}
              maxLength={50}
              pattern="^[a-zA-Z0-9_-]+$"
              className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all duration-200"
            />
            <p className="text-xs text-zinc-500">
              Identificador unico na URL do webhook. Ex: minha-empresa
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <DialogFooter>
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
                  Criando...
                </>
              ) : (
                "Criar Empresa"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
