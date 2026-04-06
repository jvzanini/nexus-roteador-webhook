"use client";

import { useState, useTransition } from "react";
import { Settings, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCompany, deleteCompany } from "@/lib/actions/company";
import { toast } from "sonner";

interface EditCompanyDialogProps {
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
    isActive: boolean;
  };
  canDelete?: boolean;
}

export function EditCompanyDialog({ company, canDelete = false }: EditCompanyDialogProps) {
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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

  async function handleDelete() {
    startTransition(async () => {
      const result = await deleteCompany(company.id);
      if (result.success) {
        toast.success("Empresa excluída");
        window.location.href = "/companies";
      } else {
        toast.error(result.error || "Erro ao excluir");
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
      <DialogContent className="bg-card border border-border rounded-2xl overflow-visible">
        <DialogHeader>
          <DialogTitle className="text-foreground">Editar Empresa</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Altere as informações da empresa.
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

          <div className="flex justify-end gap-2 pt-2">
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
          </div>
        </form>

        {/* Separator */}
        <div className="border-t border-border my-2" />

        {/* Empresa management actions — separate section */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={handleToggleActive}
            disabled={isPending}
            className={company.isActive
              ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 cursor-pointer transition-all duration-200"
              : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer transition-all duration-200"
            }
          >
            {company.isActive ? "Desativar Empresa" : "Reativar Empresa"}
          </Button>
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              disabled={isPending}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir Empresa
            </Button>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="bg-card border border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Excluir empresa permanentemente?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Esta ação não pode ser desfeita. Todos os dados serão removidos: credenciais, rotas, logs, membros e configurações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-all duration-200">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 text-white cursor-pointer transition-all duration-200"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
