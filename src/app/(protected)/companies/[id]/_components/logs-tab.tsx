"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { getWebhookLogs, getAvailableEventTypes, getAvailableRoutes } from "@/lib/actions/logs";
import type { LogsPage, LogFilters as LogFiltersType } from "@/lib/actions/logs";
import type { DeliveryStatus } from "@/generated/prisma/client";
import { LogFilters } from "./logs/log-filters";
import { LogTable } from "./logs/log-table";

interface LogsTabProps {
  companyId: string;
}

export function LogsTab({ companyId }: LogsTabProps) {
  const [page, setPage] = useState<LogsPage | null>(null);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [routes, setRoutes] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Estado dos filtros
  const [filters, setFilters] = useState<{
    statuses: DeliveryStatus[];
    eventTypes: string[];
    routeId: string;
    dateFrom: Date | undefined;
    dateTo: Date | undefined;
    cursor: string | undefined;
  }>({
    statuses: [],
    eventTypes: [],
    routeId: "",
    dateFrom: undefined,
    dateTo: undefined,
    cursor: undefined,
  });

  const fetchLogs = useCallback(async (currentFilters: typeof filters) => {
    const filterPayload: LogFiltersType = {
      companyId,
      statuses: currentFilters.statuses.length > 0 ? currentFilters.statuses : undefined,
      eventTypes: currentFilters.eventTypes.length > 0 ? currentFilters.eventTypes : undefined,
      routeId: currentFilters.routeId || undefined,
      dateFrom: currentFilters.dateFrom,
      dateTo: currentFilters.dateTo,
      cursor: currentFilters.cursor,
      pageSize: 25,
    };
    const result = await getWebhookLogs(filterPayload);
    setPage(result);
  }, [companyId]);

  // Carregamento inicial
  useEffect(() => {
    Promise.all([
      fetchLogs(filters),
      getAvailableEventTypes(companyId).then(setEventTypes),
      getAvailableRoutes(companyId).then(setRoutes),
    ]).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyFilters = useCallback((newFilters: {
    statuses: DeliveryStatus[];
    eventTypes: string[];
    routeId: string;
    dateFrom: Date | undefined;
    dateTo: Date | undefined;
  }) => {
    const updated = { ...newFilters, cursor: undefined };
    setFilters(updated);
    startTransition(() => {
      fetchLogs(updated);
    });
  }, [fetchLogs]);

  const handleClearFilters = useCallback(() => {
    const cleared = {
      statuses: [] as DeliveryStatus[],
      eventTypes: [] as string[],
      routeId: "",
      dateFrom: undefined,
      dateTo: undefined,
      cursor: undefined,
    };
    setFilters(cleared);
    startTransition(() => {
      fetchLogs(cleared);
    });
  }, [fetchLogs]);

  const handleNextPage = useCallback((cursor: string) => {
    const updated = { ...filters, cursor };
    setFilters(updated);
    startTransition(() => {
      fetchLogs(updated);
    });
  }, [filters, fetchLogs]);

  const handleFirstPage = useCallback(() => {
    const updated = { ...filters, cursor: undefined };
    setFilters(updated);
    startTransition(() => {
      fetchLogs(updated);
    });
  }, [filters, fetchLogs]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-zinc-800/50 rounded-lg animate-pulse" />
        <div className="h-64 bg-zinc-800/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <LogFilters
        eventTypes={eventTypes}
        routes={routes}
        filters={filters}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
        isPending={isPending}
      />
      {page && (
        <LogTable
          companyId={companyId}
          page={page}
          onNextPage={handleNextPage}
          onFirstPage={handleFirstPage}
          hasCursor={!!filters.cursor}
          isPending={isPending}
        />
      )}
    </div>
  );
}
