"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import type { ChartPoint } from "@/lib/actions/dashboard";

interface WebhookChartProps {
  data: ChartPoint[];
  period: string;
}

function formatLabel(date: Date, period: string): string {
  const d = new Date(date);
  if (period === "today") {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function CustomTooltip(props: TooltipContentProps<any, any>) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-lg">
      <p className="text-xs text-zinc-400 mb-2">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: <span className="font-bold">{entry.value?.toLocaleString("pt-BR")}</span>
        </p>
      ))}
    </div>
  );
}

export function WebhookChart({ data, period }: WebhookChartProps) {
  const title = period === "today" ? "Entregas por Hora" : "Entregas por Dia";

  const chartData = data.map((point) => ({
    label: formatLabel(point.bucketStart, period),
    Total: point.total,
    "Concluídas": point.delivered,
    Falhas: point.failed,
  }));

  const isEmpty = data.every((p) => p.total === 0);

  return (
    <Card className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex items-center justify-center h-[300px] text-sm text-zinc-500">
            Nenhuma entrega no período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={CustomTooltip} cursor={{ stroke: "rgba(63, 63, 70, 0.5)" }} />
              <Line type="monotone" dataKey="Total" stroke="#a1a1aa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Concluídas" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Falhas" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
