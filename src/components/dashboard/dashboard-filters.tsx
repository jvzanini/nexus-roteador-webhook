"use client";

import { RefreshCw, Building2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardFiltersProps {
  companies: { id: string; name: string }[];
  selectedCompanyId: string | undefined;
  selectedPeriod: string;
  isLoading: boolean;
  onCompanyChange: (companyId: string | undefined) => void;
  onPeriodChange: (period: string) => void;
  onRefresh: () => void;
}

const periods = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

export function DashboardFilters({
  companies,
  selectedCompanyId,
  selectedPeriod,
  isLoading,
  onCompanyChange,
  onPeriodChange,
  onRefresh,
}: DashboardFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>

      <div className="flex items-center gap-2.5 ml-auto">
        {/* Filtro de empresa */}
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <select
            value={selectedCompanyId ?? ""}
            onChange={(e) => onCompanyChange(e.target.value || undefined)}
            className="h-9 pl-8 pr-8 rounded-lg border border-zinc-800 bg-zinc-900/80 text-sm text-zinc-300 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/50 transition-all duration-200 cursor-pointer appearance-none"
          >
            <option value="">Todas as empresas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        </div>

        {/* Filtro de periodo */}
        <div className="flex rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/80">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => onPeriodChange(p.value)}
              className={`px-3.5 py-1.5 text-xs font-medium transition-all duration-200 cursor-pointer ${
                selectedPeriod === p.value
                  ? "bg-blue-600 text-white shadow-[0_0_8px_rgba(37,99,235,0.3)]"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Botao refresh */}
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-9 w-9 rounded-lg border-zinc-800 bg-zinc-900/80 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}
