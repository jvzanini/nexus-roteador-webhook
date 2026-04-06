"use client";

import { motion } from "framer-motion";
import { Inbox, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CompanyOverviewData } from "@/lib/actions/dashboard";

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

interface OverviewStatsProps {
  stats: CompanyOverviewData["stats"];
}

const cards = [
  { key: "webhooksReceived", label: "Webhooks Recebidos", sublabel: "últimas 24h", icon: Inbox, color: "violet" },
  { key: "deliveriesCompleted", label: "Entregas Concluídas", sublabel: "últimas 24h", icon: CheckCircle2, color: "emerald" },
  { key: "deliveriesFailed", label: "Entregas com Falha", sublabel: "últimas 24h", icon: XCircle, color: "red" },
  { key: "successRate", label: "Taxa de Sucesso", sublabel: "últimas 24h", icon: TrendingUp, color: "violet" },
] as const;

const colorMap: Record<string, { bg: string; text: string }> = {
  violet: { bg: "bg-violet-500/10", text: "text-violet-400" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  red: { bg: "bg-red-500/10", text: "text-red-400" },
};

export function OverviewStats({ stats }: OverviewStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const colors = colorMap[card.color];
        const Icon = card.icon;
        const value =
          card.key === "successRate"
            ? stats.successRate !== null
              ? `${stats.successRate}%`
              : "-"
            : stats[card.key];

        return (
          <motion.div key={card.key} variants={itemVariants}>
            <Card className="bg-card border border-border rounded-xl hover:border-muted-foreground/30 transition-all duration-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${colors.bg}`}>
                    <Icon className={`h-5 w-5 ${colors.text}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
