"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useReportEstimate } from "./use-report-estimate";
import { MAX_ROWS_PER_EXPORT, type ReportType } from "@/lib/reports/types";

interface ReportBlockProps {
  type: ReportType;
  title: string;
  description: string;
  icon: ReactNode;
  searchParams: URLSearchParams;
  filters?: ReactNode;
  estimateEnabled?: boolean;
  disabledReason?: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ReportBlock({
  type,
  title,
  description,
  icon,
  searchParams,
  filters,
  estimateEnabled = true,
  disabledReason,
}: ReportBlockProps) {
  const { estimate, loading, error } = useReportEstimate(
    type,
    searchParams,
    estimateEnabled
  );
  const [downloading, setDownloading] = useState(false);

  const tooLarge = !!estimate && estimate.count > MAX_ROWS_PER_EXPORT;
  const empty = !!estimate && estimate.count === 0;
  const disabled =
    loading || downloading || tooLarge || empty || !!disabledReason;

  async function handleDownload() {
    setDownloading(true);
    try {
      const key = searchParams.toString();
      const url = `/api/reports/${type}${key ? "?" + key : ""}`;

      // Validação prévia via HEAD — garante que não vamos navegar
      // para uma página de erro do browser (429 / 400 / 403).
      const head = await fetch(url, { method: "HEAD" });
      if (!head.ok) {
        if (head.status === 429) {
          toast.error("Já existe um export em andamento. Aguarde.");
        } else if (head.status === 403) {
          toast.error("Sem permissão para este relatório.");
        } else if (head.status === 400) {
          toast.error("Filtros inválidos.");
        } else {
          toast.error(`Erro ${head.status} ao iniciar download.`);
        }
        return;
      }

      // HEAD ok → dispara o download real via navegação
      window.location.href = url;
      toast.success("Download iniciado");
    } catch {
      toast.error("Erro de rede ao iniciar download");
    } finally {
      setTimeout(() => setDownloading(false), 2000);
    }
  }

  return (
    <Card className="border-border bg-card/50">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-foreground text-base">
          {icon}
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {filters}
        <div className="flex items-center justify-between gap-4 pt-2">
          <div className="text-sm text-muted-foreground">
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Calculando...
              </span>
            ) : error ? (
              <span className="text-destructive">{error}</span>
            ) : estimate ? (
              <span>
                ~{estimate.count.toLocaleString("pt-BR")} registros ·{" "}
                {formatBytes(estimate.estimatedBytes)}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            {tooLarge && (
              <p className="text-xs text-amber-500 mt-1">
                Refine os filtros — limite de{" "}
                {MAX_ROWS_PER_EXPORT.toLocaleString("pt-BR")} registros
              </p>
            )}
            {empty && (
              <p className="text-xs text-muted-foreground mt-1">
                Nenhum registro para exportar
              </p>
            )}
            {disabledReason && (
              <p className="text-xs text-muted-foreground mt-1">
                {disabledReason}
              </p>
            )}
          </div>
          <Button
            onClick={handleDownload}
            disabled={disabled}
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer"
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Baixar CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
