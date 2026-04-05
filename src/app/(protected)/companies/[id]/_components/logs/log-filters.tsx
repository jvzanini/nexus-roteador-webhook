"use client";

import { useState } from "react";
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
  filters: {
    statuses: DeliveryStatus[];
    eventTypes: string[];
    routeId: string;
    dateFrom: Date | undefined;
    dateTo: Date | undefined;
  };
  onApply: (filters: {
    statuses: DeliveryStatus[];
    eventTypes: string[];
    routeId: string;
    dateFrom: Date | undefined;
    dateTo: Date | undefined;
  }) => void;
  onClear: () => void;
  isPending: boolean;
}

const ALL_STATUSES: { value: DeliveryStatus; label: string }[] = [
  { value: "delivered", label: "Entregue" },
  { value: "failed", label: "Falhou" },
  { value: "pending", label: "Pendente" },
  { value: "retrying", label: "Retentando" },
  { value: "delivering", label: "Enviando" },
];

export function LogFilters({
  eventTypes,
  routes,
  filters,
  onApply,
  onClear,
  isPending,
}: LogFiltersProps) {
  // Estado local do formulario de filtros
  const [selectedStatuses, setSelectedStatuses] = useState<DeliveryStatus[]>(
    filters.statuses
  );
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>(
    filters.eventTypes
  );
  const [selectedRouteId, setSelectedRouteId] = useState<string>(
    filters.routeId
  );
  const [dateFrom, setDateFrom] = useState<Date | undefined>(filters.dateFrom);
  const [dateTo, setDateTo] = useState<Date | undefined>(filters.dateTo);

  function applyFilters() {
    onApply({
      statuses: selectedStatuses,
      eventTypes: selectedEventTypes,
      routeId: selectedRouteId,
      dateFrom,
      dateTo,
    });
  }

  function clearFilters() {
    setSelectedStatuses([]);
    setSelectedEventTypes([]);
    setSelectedRouteId("");
    setDateFrom(undefined);
    setDateTo(undefined);
    onClear();
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
          <PopoverTrigger
            render={<Button variant="outline" size="sm" className="gap-2 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200" />}
          >
            <Filter className="h-4 w-4" />
            Status
            {selectedStatuses.length > 0 && (
              <Badge variant="secondary" className="ml-1 bg-blue-500/15 text-blue-400 border-blue-500/30">
                {selectedStatuses.length}
              </Badge>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2 bg-zinc-900 border-zinc-800" align="start">
            <div className="space-y-1">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => toggleStatus(s.value)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all duration-200 cursor-pointer ${
                    selectedStatuses.includes(s.value)
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
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
          <PopoverTrigger
            render={<Button variant="outline" size="sm" className="gap-2 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200" />}
          >
            <Filter className="h-4 w-4" />
            Evento
            {selectedEventTypes.length > 0 && (
              <Badge variant="secondary" className="ml-1 bg-blue-500/15 text-blue-400 border-blue-500/30">
                {selectedEventTypes.length}
              </Badge>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 bg-zinc-900 border-zinc-800" align="start">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {eventTypes.map((et) => (
                <button
                  key={et}
                  onClick={() => toggleEventType(et)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all duration-200 cursor-pointer ${
                    selectedEventTypes.includes(et)
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  {et}
                </button>
              ))}
              {eventTypes.length === 0 && (
                <p className="text-sm text-zinc-500 px-3 py-1.5">
                  Nenhum evento encontrado
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Route select */}
        <Select value={selectedRouteId} onValueChange={(v) => setSelectedRouteId(v ?? "")}>
          <SelectTrigger className="w-[180px] h-9 bg-zinc-800/50 border-zinc-700 text-zinc-200 cursor-pointer transition-all duration-200 hover:border-zinc-600">
            <SelectValue placeholder="Rota" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700">
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
          <PopoverTrigger
            render={<Button variant="outline" size="sm" className="gap-2 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200" />}
          >
            <CalendarIcon className="h-4 w-4" />
            {dateFrom
              ? format(dateFrom, "dd/MM/yy", { locale: ptBR })
              : "De"}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-800" align="start">
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
          <PopoverTrigger
            render={<Button variant="outline" size="sm" className="gap-2 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200" />}
          >
            <CalendarIcon className="h-4 w-4" />
            {dateTo
              ? format(dateTo, "dd/MM/yy", { locale: ptBR })
              : "Ate"}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-800" align="start">
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
        <Button
          size="sm"
          onClick={applyFilters}
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-all duration-200"
        >
          Filtrar
        </Button>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-1 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-all duration-200"
          >
            <X className="h-4 w-4" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
