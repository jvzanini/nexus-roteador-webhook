"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import * as LucideIcons from "lucide-react";
import { Pencil, Trash2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TOTAL_EVENTS } from "@/lib/constants/whatsapp-events";
import type { LucideIcon } from "lucide-react";

interface RouteCardProps {
  route: {
    id: string;
    name: string;
    icon: string;
    url: string;
    events: unknown; // JSON
    isActive: boolean;
    timeoutMs: number;
    headers: unknown; // JSON
  };
  onEdit: () => void;
  onDelete: () => void;
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname;
    // Exibir host completo + path truncado
    const truncatedPath =
      path.length > 20 ? path.substring(0, 20) + "..." : path;
    return `${host}${truncatedPath}`;
  } catch {
    return "***";
  }
}

export function RouteCard({ route, onEdit, onDelete }: RouteCardProps) {
  const Icon = useMemo(() => {
    const icon = (LucideIcons as unknown as Record<string, LucideIcon>)[route.icon];
    return icon ?? LucideIcons.Webhook;
  }, [route.icon]);

  const eventCount = Array.isArray(route.events) ? route.events.length : 0;
  const headerCount =
    route.headers && Array.isArray(route.headers)
      ? (route.headers as Array<unknown>).length
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      layout
    >
      <Card className="group border-border/50 hover:border-border transition-colors">
        <CardContent className="flex items-center gap-4 p-4">
          {/* Icone */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground truncate">
                {route.name}
              </h3>
              <Badge
                variant={route.isActive ? "default" : "secondary"}
                className="text-xs shrink-0"
              >
                {route.isActive ? "Ativa" : "Inativa"}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{maskUrl(route.url)}</span>
            </div>
          </div>

          {/* Badges */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-xs tabular-nums">
              {eventCount}/{TOTAL_EVENTS} eventos
            </Badge>
            {headerCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {headerCount} headers
              </Badge>
            )}
            <Badge variant="outline" className="text-xs tabular-nums">
              {route.timeoutMs / 1000}s timeout
            </Badge>
          </div>

          {/* Acoes */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              className="h-8 w-8"
              title="Editar rota"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              title="Desativar rota"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
