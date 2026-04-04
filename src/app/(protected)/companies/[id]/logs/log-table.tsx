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
} from "lucide-react";
import { LogStatusBadge } from "./log-status-badge";
import { LogRowDetail } from "./log-row-detail";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function loadNextPage() {
    if (!page.nextCursor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", page.nextCursor);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function loadFirstPage() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("cursor");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  // Derivar o status "principal" de cada entrada (pior status entre deliveries)
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
      <div className="text-sm text-muted-foreground">
        {page.totalCount} registro{page.totalCount !== 1 ? "s" : ""} encontrado
        {page.totalCount !== 1 ? "s" : ""}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Rota(s)</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[100px] text-right">
                Duracao
              </TableHead>
              <TableHead className="w-[80px] text-right">
                Tentativas
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.entries.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  Nenhum log encontrado para os filtros selecionados.
                </TableCell>
              </TableRow>
            )}
            {page.entries.map((entry) => {
              const isExpanded = expandedRows.has(entry.id);
              const primaryStatus = getPrimaryStatus(entry);
              const totalAttempts = entry.deliveries.reduce(
                (acc, d) => acc + d.totalAttempts,
                0
              );
              const maxDuration = entry.deliveries.reduce(
                (max, d) =>
                  d.durationMs !== null && d.durationMs > max
                    ? d.durationMs
                    : max,
                0
              );

              return (
                <Fragment key={entry.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleRow(entry.id)}
                  >
                    <TableCell>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(entry.receivedAt), "dd/MM/yy HH:mm:ss", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {entry.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {entry.deliveries.map((d) => (
                          <span
                            key={d.id}
                            className="text-xs text-muted-foreground"
                          >
                            {d.routeName}
                          </span>
                        ))}
                        {entry.deliveries.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <LogStatusBadge status={primaryStatus} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {maxDuration > 0 ? `${maxDuration}ms` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {totalAttempts}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <LogRowDetail
                          companyId={companyId}
                          inboundWebhookId={entry.id}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Paginacao */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={loadFirstPage}
          disabled={!searchParams.get("cursor") || isPending}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Inicio
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={loadNextPage}
          disabled={!page.nextCursor || isPending}
          className="gap-1"
        >
          Proxima
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
