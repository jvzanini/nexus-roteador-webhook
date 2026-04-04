"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { getDashboardData, type DashboardData } from "@/actions/dashboard";
import { DashboardFilters } from "./dashboard-filters";
import { StatsCards } from "./stats-cards";
import { WebhookChart } from "./webhook-chart";
import { TopErrors } from "./top-errors";
import { RecentDeliveries } from "./recent-deliveries";

interface DashboardContentProps {
  userName: string;
  isSuperAdmin?: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

const POLL_INTERVAL = 60_000; // 60s

export function DashboardContent({ userName }: DashboardContentProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [companyId, setCompanyId] = useState<string | undefined>(undefined);
  const [period, setPeriod] = useState("today");
  const [page, setPage] = useState(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setIsLoading(true);
    try {
      const result = await getDashboardData(companyId, period, page);
      if (result.success && result.data) {
        setData(result.data);
      }
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [companyId, period, page]);

  // Polling
  useEffect(() => {
    fetchData(isInitialLoad);

    timerRef.current = setInterval(() => {
      fetchData(false); // Silencioso
    }, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData, isInitialLoad]);

  function handleRefresh() {
    if (timerRef.current) clearInterval(timerRef.current);
    fetchData(false);
    timerRef.current = setInterval(() => fetchData(false), POLL_INTERVAL);
  }

  function handleCompanyChange(id: string | undefined) {
    setCompanyId(id);
    setPage(1); // Reset página ao mudar empresa
  }

  function handlePeriodChange(p: string) {
    setPeriod(p);
    setPage(1); // Reset página ao mudar período
  }

  function handlePageChange(p: number) {
    setPage(p);
    // Não reinicia timer, busca dados imediatamente via useEffect
  }

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Skeleton loading no primeiro carregamento
  if (isInitialLoad && !data) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 w-48 bg-zinc-800 rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-zinc-900 border border-zinc-800 rounded-xl" />
          ))}
        </div>
        <div className="h-[350px] bg-zinc-900 border border-zinc-800 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Greeting */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Ola, {userName}
        </h1>
        <p className="text-sm text-zinc-500 mt-1 capitalize">{today}</p>
      </motion.div>

      {/* Filters */}
      <motion.div variants={itemVariants}>
        <DashboardFilters
          companies={data.companies}
          selectedCompanyId={companyId}
          selectedPeriod={period}
          isLoading={isLoading}
          onCompanyChange={handleCompanyChange}
          onPeriodChange={handlePeriodChange}
          onRefresh={handleRefresh}
        />
      </motion.div>

      {/* Stats Cards */}
      <StatsCards stats={data.stats} />

      {/* Chart + Top Errors (lado a lado em desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <WebhookChart data={data.chart} period={period} />
        </motion.div>
        <motion.div variants={itemVariants}>
          <TopErrors errors={data.topErrors} />
        </motion.div>
      </div>

      {/* Recent Deliveries */}
      <motion.div variants={itemVariants}>
        <RecentDeliveries
          items={data.recentDeliveries.items}
          currentPage={data.recentDeliveries.currentPage}
          totalPages={data.recentDeliveries.totalPages}
          onPageChange={handlePageChange}
        />
      </motion.div>
    </motion.div>
  );
}
