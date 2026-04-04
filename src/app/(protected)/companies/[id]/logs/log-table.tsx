"use client";

import { useState, useTransition, Fragment } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  RefreshCw,
} from "lucide-react";
import { LogStatusBadge } from "./log-status-badge";
import { LogRowDetail } from "./log-row-detail";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { resendDelivery, resendDeliveries } from "@/actions/resend";
import type { LogEntry, LogsPage } from "@/lib/actions/logs";
import type { DeliveryStatus } from "@/generated/prisma/client";

interface LogTableProps {
  companyId: string;
  page: LogsPage;
}

export function LogTable({ companyId, page }: LogTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [batchResending, setBatchResending] = useState(false);

  // Coletar todos os delivery IDs com status failed na página
  const failedDeliveryIds = page.entries.flatMap((e) =>
    e.deliveries.filter((d) => d.status === "failed").map((d) => d.id)
  );

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(deliveryId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(deliveryId)) next.delete(deliveryId);
      else next.add(deliveryId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === failedDeliveryIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(failedDeliveryIds));
    }
  }

  function loadNextPage() {
    if (!page.nextCursor) return;
    setSelectedIds(new Set()); // Limpar seleção ao navegar
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", page.nextCursor);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function loadFirstPage() {
    setSelectedIds(new Set()); // Limpar seleção ao navegar
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  async function handleResendSingle(deliveryId: string) {
    setResendingId(deliveryId);
    try {
      const result = await resendDelivery(deliveryId);
      if (result.created && result.enqueued) {
        toast.success("Reenvio criado e enfileirado");
      } else if (result.created && !result.enqueued) {
        toast.success("Reenvio criado. Será processado automaticamente");
      } else {
        toast.error(result.error || "Erro ao reenviar");
      }
    } catch {
      toast.error("Erro ao reenviar");
    } finally {
      setResendingId(null);
    }
  }

  async function handleResendBatch() {
    if (selectedIds.size === 0) return;
    if (selectedIds.size > 50) {
      toast.error("Máximo 50 por vez");
      return;
    }

    const confirmed = window.confirm(
      `Tem certeza que deseja reenviar ${selectedIds.size} entrega${selectedIds.size > 1 ? "s" : ""}? Novas entregas serão criadas e enfileiradas.`
    );
    if (!confirmed) return;

    setBatchResending(true);
    try {
      const result = await resendDeliveries([...selectedIds]);
      if (result.error) {
        toast.error(result.error);
      } else if (result.created > 0) {
        let msg = `${result.created} reenvio${result.created > 1 ? "s" : ""} criado${result.created > 1 ? "s" : ""}`;
        if (result.enqueueFailed > 0) {
          msg += `. ${result.enqueueFailed} será${result.enqueueFailed > 1 ? "ão" : ""} processado${result.enqueueFailed > 1 ? "s" : ""} automaticamente`;
        }
        if (result.skipped > 0) {
          msg += `. ${result.skipped} ignorado${result.skipped > 1 ? "s" : ""}`;
        }
        toast.success(msg);
      } else {
        toast.error("Nenhuma entrega pôde ser reenviada");
      }
      setSelectedIds(new Set());
    } catch {
      toast.error("Erro ao reenviar");
    } finally {
      setBatchResending(false);
    }
  }

  function getPrimaryStatus(entry: LogEntry): DeliveryStatus {
    if (entry.deliveries.length === 0) return "pending";
    const statuses = entry.deliveries.map((d) => d.status);
    if (statuses.includes("failed")) return "failed";
    if (statuses.includes("retrying")) return "retrying";
    if (statuses.includes("delivering")) return "delivering";
    if (statuses.includes("pending")) return "pending";
    return "delivered";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-500">
          {page.totalCount} registro{page.totalCount !== 1 ? "s" : ""} encontrado
          {page.totalCount !== 1 ? "s" : ""}
        </div>

        {/* Barra de ações de lote */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">
              {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResendBatch}
              disabled={batchResending || selectedIds.size > 50}
              className="gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer transition-all duration-200"
              title={selectedIds.size > 50 ? "Máximo 50 por vez" : undefined}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${batchResending ? "animate-spin" : ""}`} />
              Reenviar selecionados
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="w-8 text-zinc-500 text-xs">
                {failedDeliveryIds.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selectedIds.size === failedDeliveryIds.length && failedDeliveryIds.length > 0}
                    onChange={toggleSelectAll}
                    className="cursor-pointer accent-blue-600"
                  />
                )}
              </TableHead>
              <TableHead className="w-8 text-zinc-500 text-xs" />
              <TableHead className="w-[180px] text-zinc-500 text-xs">Timestamp</TableHead>
              <TableHead className="text-zinc-500 text-xs">Evento</TableHead>
              <TableHead className="text-zinc-500 text-xs">Rota(s)</TableHead>
              <TableHead className="w-[120px] text-zinc-500 text-xs">Status</TableHead>
              <TableHead className="w-[100px] text-right text-zinc-500 text-xs">Duração</TableHead>
              <TableHead className="w-[80px] text-right text-zinc-500 text-xs">Tentativas</TableHead>
              <TableHead className="w-[50px] text-zinc-500 text-xs" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-zinc-500 py-8">
                  Nenhum log encontrado para os filtros selecionados.
                </TableCell>
              </TableRow>
            )}
            {page.entries.map((entry) => {
              const isExpanded = expandedRows.has(entry.id);
              const primaryStatus = getPrimaryStatus(entry);
              const totalAttempts = entry.deliveries.reduce((acc, d) => acc + d.totalAttempts, 0);
              const maxDuration = entry.deliveries.reduce(
                (max, d) => (d.durationMs !== null && d.durationMs > max ? d.durationMs : max),
                0
              );

              // Checkbox: mostra se alguma delivery é failed
              const failedInEntry = entry.deliveries.filter((d) => d.status === "failed");
              const hasFailedDelivery = failedInEntry.length > 0;
              const entryFailedIds = failedInEntry.map((d) => d.id);
              const allSelected = entryFailedIds.every((id) => selectedIds.has(id));

              return (
                <Fragment key={entry.id}>
                  <TableRow className="cursor-pointer hover:bg-zinc-800/30 transition-colors duration-200 border-zinc-800/50">
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {hasFailedDelivery && (
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => {
                            const next = new Set(selectedIds);
                            if (allSelected) {
                              entryFailedIds.forEach((id) => next.delete(id));
                            } else {
                              entryFailedIds.forEach((id) => next.add(id));
                            }
                            setSelectedIds(next);
                          }}
                          className="cursor-pointer accent-blue-600"
                        />
                      )}
                    </TableCell>
                    <TableCell onClick={() => toggleRow(entry.id)}>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-zinc-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-zinc-500" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400" onClick={() => toggleRow(entry.id)}>
                      {format(new Date(entry.receivedAt), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                    </TableCell>
                    <TableCell onClick={() => toggleRow(entry.id)}>
                      <Badge variant="outline" className="font-mono text-xs border-zinc-700 text-zinc-300">
                        {entry.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={() => toggleRow(entry.id)}>
                      <div className="flex flex-wrap gap-1">
                        {entry.deliveries.map((d) => (
                          <span key={d.id} className="text-xs text-zinc-400">{d.routeName}</span>
                        ))}
                        {entry.deliveries.length === 0 && (
                          <span className="text-xs text-zinc-500">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={() => toggleRow(entry.id)}>
                      <LogStatusBadge status={primaryStatus} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-zinc-500" onClick={() => toggleRow(entry.id)}>
                      {maxDuration > 0 ? `${maxDuration}ms` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-zinc-500" onClick={() => toggleRow(entry.id)}>
                      {totalAttempts}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {hasFailedDelivery && (
                        <button
                          onClick={() => handleResendSingle(entryFailedIds[0])}
                          disabled={resendingId !== null}
                          className="p-1 rounded hover:bg-zinc-700 transition-colors duration-200 cursor-pointer text-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                          title="Reenviar"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${resendingId === entryFailedIds[0] ? "animate-spin" : ""}`} />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={9} className="p-0">
                        <LogRowDetail companyId={companyId} inboundWebhookId={entry.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={loadFirstPage}
          disabled={!searchParams.get("cursor") || isPending}
          className="gap-1 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
        >
          <ChevronLeft className="h-4 w-4" />
          Início
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={loadNextPage}
          disabled={!page.nextCursor || isPending}
          className="gap-1 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
        >
          Próxima
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
