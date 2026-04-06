"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { getDashboardData, type DashboardData } from "@/lib/actions/dashboard";
import { useRealtime } from "@/hooks/use-realtime";
import { Building2, LayoutDashboard } from "lucide-react";
import { NotificationBell } from "@/components/layout/notification-bell";
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
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [companyId, setCompanyId] = useState<string | undefined>(undefined);
  const [period, setPeriod] = useState("today");
  const [page, setPage] = useState(1);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (showSkeleton = false) => {
    if (showSkeleton) setIsLoading(true);
    try {
      const result = await getDashboardData(companyId, period, page);
      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error || "Erro ao carregar dados");
      }
    } catch {
      setError("Erro de conexão com o servidor");
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [companyId, period, page]);

  // Real-time: atualiza dashboard ao receber eventos de delivery/webhook
  useRealtime(useCallback((event) => {
    if (
      event.type === "delivery:completed" ||
      event.type === "delivery:failed" ||
      event.type === "webhook:received"
    ) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchData(false);
      }, 2000);
    }
  }, [fetchData]));

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
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-card border border-border rounded-xl" />
          ))}
        </div>
        <div className="h-[350px] bg-card border border-border rounded-xl" />
      </div>
    );
  }

  if (!data) {
    // Se o erro indica ausência de empresas, mostra mensagem amigável
    if (error && (error.includes("empresa") || error.includes("company") || error.includes("acesso"))) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
            <LayoutDashboard className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Sem dados para exibir
          </h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Você precisa estar vinculado a pelo menos uma empresa para visualizar o dashboard. Solicite ao administrador que adicione você como membro.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-muted-foreground text-sm">{error || "Erro ao carregar dashboard"}</p>
        <button
          onClick={() => fetchData(true)}
          className="px-4 py-2 text-sm bg-muted text-foreground/80 rounded-lg hover:bg-accent transition-colors cursor-pointer"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // Usuário sem empresas vinculadas
  if (data.companies && data.companies.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
          <Building2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Nenhuma empresa vinculada
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Para visualizar os dados do dashboard, você precisa estar vinculado a pelo menos uma empresa. Entre em contato com o administrador do sistema.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Greeting + Bell */}
      <motion.div variants={itemVariants} className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Olá, {userName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{today}</p>
        </div>
        <NotificationBell />
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
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
