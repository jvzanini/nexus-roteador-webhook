"use client";

import { useState, useCallback, useEffect, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Route, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RouteCard } from "@/components/routes/route-card";
import { RouteFormDialog } from "@/components/routes/route-form-dialog";
import { RouteDeleteDialog } from "@/components/routes/route-delete-dialog";
import { listWebhookRoutes, toggleWebhookRouteActive } from "@/lib/actions/webhook-routes";
import { toast } from "sonner";

interface RouteData {
  id: string;
  name: string;
  icon: string;
  url: string;
  events: unknown;
  isActive: boolean;
  headers: unknown;
  timeoutMs: number;
  createdAt: Date;
  updatedAt: Date;
}

interface RouteListProps {
  companyId: string;
}

export function RouteList({ companyId }: RouteListProps) {
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [isLoading, startLoading] = useTransition();

  // Dialog states
  const [formOpen, setFormOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteData | null>(null);
  const [deleteRoute, setDeleteRoute] = useState<RouteData | null>(null);

  const fetchRoutes = useCallback(() => {
    startLoading(async () => {
      const result = await listWebhookRoutes(companyId);
      if (result.success && result.data) {
        setRoutes(result.data as RouteData[]);
      }
    });
  }, [companyId]);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  const handleEdit = useCallback((route: RouteData) => {
    setEditingRoute(route);
    setFormOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditingRoute(null);
    setFormOpen(true);
  }, []);

  const handleFormClose = useCallback((open: boolean) => {
    setFormOpen(open);
    if (!open) setEditingRoute(null);
  }, []);

  const handleToggle = useCallback(async (routeId: string) => {
    const result = await toggleWebhookRouteActive(routeId, companyId);
    if (result.success) {
      fetchRoutes();
    } else {
      toast.error(result.error ?? "Erro ao alterar status da rota");
    }
  }, [companyId, fetchRoutes]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Rotas de Webhook
          </h2>
          <p className="text-sm text-zinc-500">
            Configure para onde os eventos WhatsApp serão encaminhados
          </p>
        </div>
        <Button
          onClick={handleCreate}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-all duration-200 hover:shadow-[0_0_16px_rgba(37,99,235,0.3)]"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nova Rota
        </Button>
      </div>

      {/* Loading */}
      {isLoading && routes.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && routes.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-12 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 mb-4">
            <Route className="h-8 w-8 text-zinc-500" />
          </div>
          <h3 className="text-sm font-medium text-zinc-200 mb-1">
            Nenhuma rota configurada
          </h3>
          <p className="text-sm text-zinc-500 mb-4 max-w-sm">
            Crie sua primeira rota para comecar a receber eventos WhatsApp em
            seus sistemas.
          </p>
          <Button
            onClick={handleCreate}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-all duration-200"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Criar primeira rota
          </Button>
        </motion.div>
      )}

      {/* Lista de rotas */}
      <AnimatePresence mode="popLayout">
        {routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            onEdit={() => handleEdit(route)}
            onDelete={() => setDeleteRoute(route)}
            onToggle={() => handleToggle(route.id)}
          />
        ))}
      </AnimatePresence>

      {/* Form Dialog (criar/editar) */}
      <RouteFormDialog
        key={editingRoute?.id ?? "new"}
        companyId={companyId}
        open={formOpen}
        onOpenChange={handleFormClose}
        route={
          editingRoute
            ? {
                id: editingRoute.id,
                name: editingRoute.name,
                icon: editingRoute.icon,
                url: editingRoute.url,
                events: editingRoute.events as string[],
                headers: editingRoute.headers as
                  | Array<{ key: string; value: string }>
                  | null,
                timeoutMs: editingRoute.timeoutMs,
              }
            : null
        }
        onSuccess={fetchRoutes}
      />

      {/* Delete Dialog */}
      {deleteRoute && (
        <RouteDeleteDialog
          open={!!deleteRoute}
          onOpenChange={(open) => {
            if (!open) setDeleteRoute(null);
          }}
          routeId={deleteRoute.id}
          routeName={deleteRoute.name}
          companyId={companyId}
          onSuccess={fetchRoutes}
        />
      )}
    </div>
  );
}
