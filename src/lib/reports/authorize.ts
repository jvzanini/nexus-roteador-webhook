import type { ReportType } from "./types";

export function canAccessReportType(
  platformRole: string,
  type: ReportType
): boolean {
  if (platformRole === "super_admin" || platformRole === "admin") {
    return true;
  }
  if (platformRole === "manager") {
    return type !== "users";
  }
  return false;
}

export function listAccessibleReportTypes(
  platformRole: string
): ReportType[] {
  const all: ReportType[] = ["logs", "companies", "routes", "users"];
  return all.filter((t) => canAccessReportType(platformRole, t));
}

export function canAccessReportsPage(platformRole: string): boolean {
  return (
    platformRole === "super_admin" ||
    platformRole === "admin" ||
    platformRole === "manager"
  );
}
