"use client";

import { useTransition } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
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
import { hardDeleteWebhookRoute } from "@/lib/actions/webhook-routes";
import { toast } from "sonner";

interface RouteDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routeId: string;
  routeName: string;
  companyId: string;
  onSuccess?: () => void;
}

export function RouteDeleteDialog({
  open,
  onOpenChange,
  routeId,
  routeName,
  companyId,
  onSuccess,
}: RouteDeleteDialogProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await hardDeleteWebhookRoute(routeId, companyId);

      if (result.success) {
        toast.success(`Rota "${routeName}" excluida com sucesso`);
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error ?? "Erro ao excluir rota");
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border border-border rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-foreground">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Excluir rota
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            Tem certeza que deseja excluir a rota{" "}
            <strong className="text-foreground">&quot;{routeName}&quot;</strong>? Esta ação não pode ser
            desfeita. Entregas pendentes não serão afetadas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isPending}
            className="border-border text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-all duration-200"
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-red-600 text-white hover:bg-red-700 cursor-pointer transition-all duration-200"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
