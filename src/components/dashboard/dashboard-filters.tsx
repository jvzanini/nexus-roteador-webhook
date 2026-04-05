"use client";

import { RefreshCw, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
        <Select
          value={selectedCompanyId ?? "all"}
          onValueChange={(val) => onCompanyChange(!val || val === "all" ? undefined : val)}
        >
          <SelectTrigger className="h-9 min-w-[180px] border-zinc-800 bg-zinc-900/80 text-sm text-zinc-300 cursor-pointer transition-all duration-200 hover:border-zinc-600">
            <Building2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700">
            <SelectItem value="all" className="text-zinc-300 cursor-pointer">
              Todas as empresas
            </SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-zinc-300 cursor-pointer">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
