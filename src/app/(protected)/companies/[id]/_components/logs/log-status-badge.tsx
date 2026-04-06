"use client";

import { Badge } from "@/components/ui/badge";
import type { DeliveryStatus } from "@/generated/prisma/client";

const statusConfig: Record<
  DeliveryStatus,
  { label: string; className: string }
> = {
  delivered: {
    label: "Entregue",
    className:
      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20",
  },
  failed: {
    label: "Falhou",
    className:
      "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/20",
  },
  pending: {
    label: "Pendente",
    className:
      "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20",
  },
  retrying: {
    label: "Retentando",
    className:
      "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20",
  },
  delivering: {
    label: "Enviando",
    className:
      "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
  },
};

interface LogStatusBadgeProps {
  status: DeliveryStatus;
}

export function LogStatusBadge({ status }: LogStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant="outline" className={`text-xs ${config.className}`}>
      {config.label}
    </Badge>
  );
}
