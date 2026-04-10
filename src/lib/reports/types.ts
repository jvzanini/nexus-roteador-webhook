import type { DeliveryStatus } from "@/generated/prisma/client";

export type ReportType = "logs" | "companies" | "routes" | "users";

export const REPORT_TYPES: ReportType[] = [
  "logs",
  "companies",
  "routes",
  "users",
];

export type AccessScope = string[] | undefined;

export interface LogsFilters {
  dateFrom: Date;
  dateTo: Date;
  companyId?: string;
  routeId?: string;
  statuses?: DeliveryStatus[];
  eventTypes?: string[];
}

export interface CompaniesFilters {
  // sem filtros no v1
}

export interface RoutesFilters {
  companyId?: string;
}

export interface UsersFilters {
  platformRole?: "super_admin" | "admin" | "manager" | "viewer";
}

export interface EstimateResult {
  count: number;
  estimatedBytes: number;
}

export const AVG_BYTES_PER_ROW: Record<ReportType, number> = {
  logs: 250,
  companies: 200,
  routes: 180,
  users: 220,
};

export const MAX_ROWS_PER_EXPORT = 50_000;
export const MAX_DAYS_LOGS = 90;
