"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Filter, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DeliveryStatus } from "@/generated/prisma/client";

interface LogFiltersProps {
  eventTypes: string[];
  routes: { id: string; name: string }[];
}

const ALL_STATUSES: { value: DeliveryStatus; label: string }[] = [
  { value: "delivered", label: "Entregue" },
  { value: "failed", label: "Falhou" },
  { value: "pending", label: "Pendente" },
  { value: "retrying", label: "Retentando" },
  { value: "delivering", label: "Enviando" },
];

export function LogFilters({ eventTypes, routes }: LogFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [selectedStatuses, setSelectedStatuses] = useState<DeliveryStatus[]>(
    () => {
      const param = searchParams.get("statuses");
      return param ? (param.split(",") as DeliveryStatus[]) : [];
    }
  );

  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>(() => {
    const param = searchParams.get("eventTypes");
    return param ? param.split(",") : [];
  });

  const [selectedRouteId, setSelectedRouteId] = useState<string>(
    () => searchParams.get("routeId") || ""
  );

  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => {
    const param = searchParams.get("dateFrom");
    return param ? new Date(param) : undefined;
  });

  const [dateTo, setDateTo] = useState<Date | undefined>(() => {
    const param = searchParams.get("dateTo");
    return param ? new Date(param) : undefined;
  });

  function applyFilters() {
    const params = new URLSearchParams();
    if (selectedStatuses.length > 0) {
      params.set("statuses", selectedStatuses.join(","));
    }
    if (selectedEventTypes.length > 0) {
      params.set("eventTypes", selectedEventTypes.join(","));
    }
    if (selectedRouteId) {
      params.set("routeId", selectedRouteId);
    }
    if (dateFrom) {
      params.set("dateFrom", dateFrom.toISOString());
    }
    if (dateTo) {
      params.set("dateTo", dateTo.toISOString());
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function clearFilters() {
    setSelectedStatuses([]);
    setSelectedEventTypes([]);
    setSelectedRouteId("");
    setDateFrom(undefined);
    setDateTo(undefined);

    startTransition(() => {
      router.push(pathname);
    });
  }

  function toggleStatus(status: DeliveryStatus) {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  }

  function toggleEventType(eventType: string) {
    setSelectedEventTypes((prev) =>
      prev.includes(eventType)
        ? prev.filter((e) => e !== eventType)
        : [...prev, eventType]
    );
  }

  const hasActiveFilters =
    selectedStatuses.length > 0 ||
    selectedEventTypes.length > 0 ||
    selectedRouteId ||
    dateFrom ||
    dateTo;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Status multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Status
              {selectedStatuses.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {selectedStatuses.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="space-y-1">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => toggleStatus(s.value)}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                    selectedStatuses.includes(s.value)
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Event type multi-select */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Evento
              {selectedEventTypes.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {selectedEventTypes.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {eventTypes.map((et) => (
                <button
                  key={et}
                  onClick={() => toggleEventType(et)}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                    selectedEventTypes.includes(et)
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {et}
                </button>
              ))}
              {eventTypes.length === 0 && (
                <p className="text-sm text-muted-foreground px-3 py-1.5">
                  Nenhum evento encontrado
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Route select */}
        <Select value={selectedRouteId} onValueChange={setSelectedRouteId}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Rota" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todas as rotas</SelectItem>
            {routes.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date range */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {dateFrom
                ? format(dateFrom, "dd/MM/yy", { locale: ptBR })
                : "De"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFrom}
              onSelect={setDateFrom}
              locale={ptBR}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {dateTo
                ? format(dateTo, "dd/MM/yy", { locale: ptBR })
                : "Ate"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateTo}
              onSelect={setDateTo}
              locale={ptBR}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Apply / Clear */}
        <Button size="sm" onClick={applyFilters} disabled={isPending}>
          Filtrar
        </Button>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-1"
          >
            <X className="h-4 w-4" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
