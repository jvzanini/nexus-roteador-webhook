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

interface EditCompanyDialogProps {
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
    isActive: boolean;
  };
}

export function EditCompanyDialog({ company }: EditCompanyDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);

    const name = formData.get("name") as string;
    const logoUrl = formData.get("logoUrl") as string;

    startTransition(async () => {
      const result = await updateCompany(company.id, {
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

  const inputClasses = "bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all duration-200";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" className="gap-2 border-border text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer transition-all duration-200" />}
      >
        <Settings className="h-4 w-4" />
        Editar
      </DialogTrigger>
      <DialogContent className="bg-card border border-border rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Editar Empresa</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Altere as informacoes da empresa. O slug sera regenerado se o nome mudar.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-foreground/80">
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
            <Label htmlFor="edit-logoUrl" className="text-foreground/80">
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
