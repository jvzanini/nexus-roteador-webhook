import { AVG_BYTES_PER_ROW } from "./types";
import type { AccessScope, EstimateResult, ReportType } from "./types";
import { countCompanies } from "./generators/companies";
import { countRoutes } from "./generators/routes";
import { countUsers } from "./generators/users";
import { countLogs } from "./generators/logs";

export async function estimateReport(
  type: ReportType,
  filters: unknown,
  scope: AccessScope
): Promise<EstimateResult> {
  let count = 0;

  switch (type) {
    case "companies":
      count = await countCompanies(filters as any, scope);
      break;
    case "routes":
      count = await countRoutes(filters as any, scope);
      break;
    case "users":
      count = await countUsers(filters as any, scope);
      break;
    case "logs":
      count = await countLogs(filters as any, scope);
      break;
  }

  return {
    count,
    estimatedBytes: count * AVG_BYTES_PER_ROW[type],
  };
}
