import { Suspense } from "react";
import {
  getWebhookLogs,
  getAvailableEventTypes,
  getAvailableRoutes,
} from "@/lib/actions/logs";
import { LogTable } from "./log-table";
import { LogFilters } from "./log-filters";
import type { DeliveryStatus } from "@/generated/prisma/client";

interface LogsPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    statuses?: string;
    eventTypes?: string;
    routeId?: string;
    dateFrom?: string;
    dateTo?: string;
    cursor?: string;
  }>;
}

export default async function LogsPage({
  params,
  searchParams,
}: LogsPageProps) {
  const { id: companyId } = await params;
  const sp = await searchParams;

  const filters = {
    companyId,
    statuses: sp.statuses
      ? (sp.statuses.split(",") as DeliveryStatus[])
      : undefined,
    eventTypes: sp.eventTypes
      ? sp.eventTypes.split(",")
      : undefined,
    routeId: sp.routeId || undefined,
    dateFrom: sp.dateFrom
      ? new Date(sp.dateFrom)
      : undefined,
    dateTo: sp.dateTo ? new Date(sp.dateTo) : undefined,
    cursor: sp.cursor || undefined,
    pageSize: 25,
  };

  const [page, eventTypes, routes] = await Promise.all([
    getWebhookLogs(filters),
    getAvailableEventTypes(companyId),
    getAvailableRoutes(companyId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Logs de Webhooks</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Historico de recebimento e entrega de webhooks.
        </p>
      </div>

      <Suspense fallback={<div className="animate-pulse text-zinc-500 text-sm">Carregando filtros...</div>}>
        <LogFilters eventTypes={eventTypes} routes={routes} />
      </Suspense>

      <LogTable companyId={companyId} page={page} />
    </div>
  );
}
