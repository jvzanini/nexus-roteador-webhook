"use client";

import { useCallback, useEffect, useState } from "react";
import type { EstimateResult, ReportType } from "@/lib/reports/types";

interface UseReportEstimateReturn {
  estimate: EstimateResult | null;
  loading: boolean;
  error: string | null;
}

export function useReportEstimate(
  type: ReportType,
  searchParams: URLSearchParams,
  enabled: boolean = true
): UseReportEstimateReturn {
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = searchParams.toString();

  const fetchEstimate = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = `/api/reports/${type}/count${key ? "?" + key : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Falha ao estimar");
      }
      const data = (await res.json()) as EstimateResult;
      setEstimate(data);
    } catch (err) {
      setEstimate(null);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [type, key, enabled]);

  useEffect(() => {
    const t = setTimeout(fetchEstimate, 300);
    return () => clearTimeout(t);
  }, [fetchEstimate]);

  return { estimate, loading, error };
}
