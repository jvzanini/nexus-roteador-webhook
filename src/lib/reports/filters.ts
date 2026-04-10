import { z } from "zod";
import { MAX_DAYS_LOGS } from "./types";

const DeliveryStatusEnum = z.enum([
  "pending",
  "delivering",
  "delivered",
  "retrying",
  "failed",
]);

const PlatformRoleEnum = z.enum([
  "super_admin",
  "admin",
  "manager",
  "viewer",
]);

export const LogsFiltersSchema = z
  .object({
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
    companyId: z.string().uuid().optional(),
    routeId: z.string().uuid().optional(),
    statuses: z.array(DeliveryStatusEnum).optional(),
    eventTypes: z.array(z.string()).optional(),
  })
  .refine((d) => d.dateFrom <= d.dateTo, {
    message: "dateFrom deve ser anterior ou igual a dateTo",
  })
  .refine(
    (d) => {
      const diffMs = d.dateTo.getTime() - d.dateFrom.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays <= MAX_DAYS_LOGS;
    },
    { message: `Intervalo máximo de ${MAX_DAYS_LOGS} dias por export` }
  );

export const CompaniesFiltersSchema = z.object({});

export const RoutesFiltersSchema = z.object({
  companyId: z.string().uuid().optional(),
});

export const UsersFiltersSchema = z.object({
  platformRole: PlatformRoleEnum.optional(),
});

export function parseFiltersFromSearchParams(
  type: string,
  params: URLSearchParams
): unknown {
  const getArray = (key: string): string[] | undefined => {
    const v = params.get(key);
    return v ? v.split(",").filter(Boolean) : undefined;
  };

  switch (type) {
    case "logs":
      return {
        dateFrom: params.get("dateFrom"),
        dateTo: params.get("dateTo"),
        companyId: params.get("companyId") || undefined,
        routeId: params.get("routeId") || undefined,
        statuses: getArray("statuses"),
        eventTypes: getArray("eventTypes"),
      };
    case "companies":
      return {};
    case "routes":
      return { companyId: params.get("companyId") || undefined };
    case "users":
      return { platformRole: params.get("platformRole") || undefined };
    default:
      return null;
  }
}
