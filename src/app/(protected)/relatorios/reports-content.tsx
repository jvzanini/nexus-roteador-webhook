"use client";

import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  FileBarChart2,
  FileText,
  Route,
  Users,
} from "lucide-react";
import { CustomSelect, type SelectOption } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { ReportBlock } from "@/components/reports/report-block";
import {
  getAvailableEventTypes,
  getAvailableRoutes,
} from "@/lib/actions/logs";
import type { ReportType } from "@/lib/reports/types";

interface Company {
  id: string;
  name: string;
}

interface Props {
  companies: Company[];
  availableReports: ReportType[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

const DELIVERY_STATUSES = [
  { value: "delivered", label: "Entregue" },
  { value: "failed", label: "Falhou" },
  { value: "pending", label: "Pendente" },
  { value: "delivering", label: "Entregando" },
  { value: "retrying", label: "Retry" },
] as const;

function buildCompanyOptions(companies: Company[], includeAll = true): SelectOption[] {
  const opts: SelectOption[] = includeAll
    ? [{ value: "", label: "Todas as empresas" }]
    : [];
  for (const c of companies) {
    opts.push({ value: c.id, label: c.name });
  }
  return opts;
}

export function ReportsContent({ companies, availableReports }: Props) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <FileBarChart2 className="h-6 w-6 text-violet-500" />
          Relatórios
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Exporte dados do sistema em CSV para análise externa.
        </p>
      </motion.div>

      {availableReports.includes("logs") && (
        <motion.div variants={itemVariants}>
          <LogsBlock companies={companies} />
        </motion.div>
      )}

      {availableReports.includes("companies") && (
        <motion.div variants={itemVariants}>
          <CompaniesBlock />
        </motion.div>
      )}

      {availableReports.includes("routes") && (
        <motion.div variants={itemVariants}>
          <RoutesBlock companies={companies} />
        </motion.div>
      )}

      {availableReports.includes("users") && (
        <motion.div variants={itemVariants}>
          <UsersBlock />
        </motion.div>
      )}
    </motion.div>
  );
}

/* -------- Bloco: Empresas -------- */

function CompaniesBlock() {
  const searchParams = useMemo(() => new URLSearchParams(), []);
  return (
    <ReportBlock
      type="companies"
      title="Empresas"
      description="Lista completa de empresas cadastradas com totais de rotas e membros."
      icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
      searchParams={searchParams}
    />
  );
}

/* -------- Bloco: Rotas -------- */

function RoutesBlock({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState("");

  const searchParams = useMemo(() => {
    const p = new URLSearchParams();
    if (companyId) p.set("companyId", companyId);
    return p;
  }, [companyId]);

  return (
    <ReportBlock
      type="routes"
      title="Rotas de Webhook"
      description="Lista de rotas cadastradas com URL destino, eventos inscritos e status."
      icon={<Route className="h-4 w-4 text-muted-foreground" />}
      searchParams={searchParams}
      filters={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Empresa
            </label>
            <CustomSelect
              value={companyId}
              onChange={setCompanyId}
              options={buildCompanyOptions(companies)}
              placeholder="Todas as empresas"
            />
          </div>
        </div>
      }
    />
  );
}

/* -------- Bloco: Usuários -------- */

function UsersBlock() {
  const [platformRole, setPlatformRole] = useState("");

  const searchParams = useMemo(() => {
    const p = new URLSearchParams();
    if (platformRole) p.set("platformRole", platformRole);
    return p;
  }, [platformRole]);

  const roleOptions: SelectOption[] = [
    { value: "", label: "Todos os papéis" },
    { value: "super_admin", label: "Super Admin" },
    { value: "admin", label: "Admin" },
    { value: "manager", label: "Gerente" },
    { value: "viewer", label: "Visualizador" },
  ];

  return (
    <ReportBlock
      type="users"
      title="Usuários"
      description="Lista de usuários do sistema com platform role, status e empresas vinculadas."
      icon={<Users className="h-4 w-4 text-muted-foreground" />}
      searchParams={searchParams}
      filters={
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Platform role
            </label>
            <CustomSelect
              value={platformRole}
              onChange={setPlatformRole}
              options={roleOptions}
              placeholder="Todos os papéis"
            />
          </div>
        </div>
      }
    />
  );
}

/* -------- Bloco: Logs -------- */

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function LogsBlock({ companies }: { companies: Company[] }) {
  const today = useMemo(() => new Date(), []);
  const thirtyDaysAgo = useMemo(
    () => new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
    [today]
  );

  const [dateFrom, setDateFrom] = useState(toDateInput(thirtyDaysAgo));
  const [dateTo, setDateTo] = useState(toDateInput(today));
  const [companyId, setCompanyId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);

  // Dados dinâmicos populados quando empresa é selecionada
  const [availableRoutes, setAvailableRoutes] = useState<
    { id: string; name: string }[]
  >([]);
  const [availableEventTypes, setAvailableEventTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!companyId) {
      setAvailableRoutes([]);
      setAvailableEventTypes([]);
      setRouteId("");
      setEventTypes([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      getAvailableRoutes(companyId).catch(() => []),
      getAvailableEventTypes(companyId).catch(() => []),
    ]).then(([routes, events]) => {
      if (cancelled) return;
      setAvailableRoutes(routes);
      setAvailableEventTypes(events);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const searchParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("dateFrom", new Date(dateFrom + "T00:00:00Z").toISOString());
    p.set("dateTo", new Date(dateTo + "T23:59:59Z").toISOString());
    if (companyId) p.set("companyId", companyId);
    if (routeId) p.set("routeId", routeId);
    if (statuses.length > 0) p.set("statuses", statuses.join(","));
    if (eventTypes.length > 0) p.set("eventTypes", eventTypes.join(","));
    return p;
  }, [dateFrom, dateTo, companyId, routeId, statuses, eventTypes]);

  function toggleStatus(value: string) {
    setStatuses((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function toggleEventType(value: string) {
    setEventTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  return (
    <ReportBlock
      type="logs"
      title="Logs de Webhook"
      description="Entregas de webhook recebidos da Meta com status, duração e erro."
      icon={<FileText className="h-4 w-4 text-muted-foreground" />}
      searchParams={searchParams}
      filters={
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                De
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-muted/50 border-border text-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Até
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-muted/50 border-border text-foreground"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Empresa
              </label>
              <CustomSelect
                value={companyId}
                onChange={(v) => {
                  setCompanyId(v);
                  setRouteId("");
                  setEventTypes([]);
                }}
                options={buildCompanyOptions(companies)}
                placeholder="Todas as empresas"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Rota
              </label>
              <CustomSelect
                value={routeId}
                onChange={setRouteId}
                options={[
                  { value: "", label: "Todas as rotas" },
                  ...availableRoutes.map((r) => ({
                    value: r.id,
                    label: r.name,
                  })),
                ]}
                placeholder="Todas as rotas"
                disabled={!companyId || availableRoutes.length === 0}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {DELIVERY_STATUSES.map((s) => {
                const active = statuses.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStatus(s.value)}
                    className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? "bg-violet-500/20 border-violet-500/50 text-violet-400"
                        : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {companyId && availableEventTypes.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Tipo de evento
              </label>
              <div className="flex flex-wrap gap-2">
                {availableEventTypes.map((e) => {
                  const active = eventTypes.includes(e);
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => toggleEventType(e)}
                      className={`px-3 py-1 rounded-full border text-xs font-mono transition-colors cursor-pointer ${
                        active
                          ? "bg-violet-500/20 border-violet-500/50 text-violet-400"
                          : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {e}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}
