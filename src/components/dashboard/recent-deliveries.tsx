"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { RecentDeliveryItem } from "@/actions/dashboard";

interface RecentDeliveriesProps {
  items: RecentDeliveryItem[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  delivered: { label: "Entregue", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  failed: { label: "Falhou", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  pending: { label: "Pendente", className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  retrying: { label: "Retentando", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  delivering: { label: "Entregando", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

export function RecentDeliveries({ items, currentPage, totalPages, onPageChange }: RecentDeliveriesProps) {
  return (
    <Card className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-400" />
          Entregas Recentes
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-b-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-500 text-xs font-medium h-9">Quando</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9">Evento</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9">Empresa</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9">Rota</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9">Status</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9 text-right">Duração</TableHead>
                <TableHead className="text-zinc-500 text-xs font-medium h-9 text-right">Tentativas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                    Nenhuma entrega no período
                  </TableCell>
                </TableRow>
              )}
              {items.map((item) => {
                const status = statusConfig[item.status] ?? statusConfig.pending;
                return (
                  <TableRow key={item.id} className="border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <TableCell className="text-xs text-zinc-500 py-2.5">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="outline" className="font-mono text-xs border-zinc-700 text-zinc-300">
                        {item.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-400 py-2.5">{item.companyName}</TableCell>
                    <TableCell className="text-sm text-zinc-400 py-2.5">{item.routeName}</TableCell>
                    <TableCell className="py-2.5">
                      <span className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-xs ${status.className}`}>
                          {status.label}
                        </Badge>
                        {item.isResend && (
                          <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-500">
                            Reenvio
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-zinc-500 py-2.5">
                      {item.durationMs !== null ? `${item.durationMs}ms` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-zinc-500 py-2.5">
                      {item.totalAttempts}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="gap-1 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="text-xs text-zinc-500">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="gap-1 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
