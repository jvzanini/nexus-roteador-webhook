"use client";

import { RefreshCw } from "lucide-react";
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

      <div className="flex items-center gap-2 ml-auto">
        {/* Filtro de empresa */}
        <select
          value={selectedCompanyId ?? ""}
          onChange={(e) => onCompanyChange(e.target.value || undefined)}
          className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 outline-none focus:border-zinc-600 transition-colors duration-200 cursor-pointer"
        >
          <option value="">Todas as empresas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Filtro de período */}
        <div className="flex rounded-lg border border-zinc-800 overflow-hidden">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => onPeriodChange(p.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 cursor-pointer ${
                selectedPeriod === p.value
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Botão refresh */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}
