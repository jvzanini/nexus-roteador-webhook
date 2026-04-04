"use client";

import { Badge } from "@/components/ui/badge";
import type { DeliveryStatus } from "@/generated/prisma";

const statusConfig: Record<
  DeliveryStatus,
  { label: string; className: string }
> = {
  delivered: {
    label: "Entregue",
    className:
      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25",
  },
  failed: {
    label: "Falhou",
    className:
      "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25",
  },
  pending: {
    label: "Pendente",
    className:
      "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/25",
  },
  retrying: {
    label: "Retentando",
    className:
      "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/25",
  },
  delivering: {
    label: "Enviando",
    className:
      "bg-zinc-500/15 text-zinc-400 border-zinc-500/30 hover:bg-zinc-500/25",
  },
};

interface LogStatusBadgeProps {
  status: DeliveryStatus;
}

export function LogStatusBadge({ status }: LogStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
