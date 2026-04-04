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
import { deleteWebhookRoute } from "@/lib/actions/webhook-routes";
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
      const result = await deleteWebhookRoute(routeId, companyId);

      if (result.success) {
        toast.success(`Rota "${routeName}" desativada com sucesso`);
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(result.error ?? "Erro ao desativar rota");
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Desativar rota
          </AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja desativar a rota{" "}
            <strong>&quot;{routeName}&quot;</strong>? Ela deixara de receber
            webhooks, mas podera ser reativada futuramente. Entregas pendentes
            nao serao afetadas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Desativar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
