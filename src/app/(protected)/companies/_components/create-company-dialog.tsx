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

    startTransition(async () => {
      const result = await createCompany({
        name,
        logoUrl: logoUrl || undefined,
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
        render={<Button className="gap-2 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200 hover:shadow-[0_0_16px_rgba(124,58,237,0.3)]" />}
      >
        <Plus className="h-4 w-4" />
        Nova Empresa
      </DialogTrigger>
      <DialogContent className="bg-card border border-border rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Criar Empresa</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Adicione uma nova empresa para configurar o roteamento de webhooks.
            O slug sera gerado automaticamente a partir do nome.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-foreground/80">
              Nome da Empresa
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="Ex: Empresa ABC"
              required
              minLength={2}
              maxLength={100}
              className="bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all duration-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logoUrl" className="text-foreground/80">
              URL do Logo (opcional)
            </Label>
            <Input
              id="logoUrl"
              name="logoUrl"
              type="url"
              placeholder="https://example.com/logo.png"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all duration-200"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-200"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
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
