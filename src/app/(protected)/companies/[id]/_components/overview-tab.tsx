"use client";

import { useEffect, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { OverviewStats } from "./overview/overview-stats";
import { OverviewChart } from "./overview/overview-chart";
import { OverviewRoutes } from "./overview/overview-routes";
import { getCompanyOverviewData } from "@/lib/actions/dashboard";
import type { CompanyOverviewData } from "@/lib/actions/dashboard";

interface OverviewTabProps {
  company: {
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    isActive: boolean;
    createdAt: Date;
    credential: { id: string } | null;
    _count: {
      memberships: number;
      routes: number;
    };
  };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

export function OverviewTab({ company }: OverviewTabProps) {
  const [overviewData, setOverviewData] = useState<CompanyOverviewData | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const data = await getCompanyOverviewData(company.id);
        setOverviewData(data);
      } catch (error) {
        console.error("[overview] Erro ao buscar dados:", error);
      }
    });
  }, [company.id]);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      {/* Mini Dashboard — Métricas e gráfico */}
      {isPending && !overviewData ? (
        <motion.div variants={itemVariants} className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        </motion.div>
      ) : overviewData ? (
        <>
          {/* Bloco 1 — Cards de métricas 2x2 */}
          <OverviewStats stats={overviewData.stats} />

          {/* Bloco 2 — Gráfico + Rotas ativas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <div className="lg:col-span-2 h-full">
              <OverviewChart chart={overviewData.chart} />
            </div>
            <div className="lg:col-span-1 h-full">
              <OverviewRoutes
                routes={overviewData.routes}
                activeRoutes={overviewData.activeRoutes}
                totalRoutes={overviewData.totalRoutes}
              />
            </div>
          </div>
        </>
      ) : null}

      {/* Info */}
      <motion.div variants={itemVariants}>
        <Card className="bg-card border border-border rounded-xl">
          <CardContent className="py-4 px-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Slug</p>
                <p className="text-sm text-foreground font-mono">/{company.slug}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Webhook Key</p>
                <p className="text-sm text-foreground font-mono truncate">{company.webhookKey}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Criada em</p>
                <p className="text-sm text-foreground">
                  {new Date(company.createdAt).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
