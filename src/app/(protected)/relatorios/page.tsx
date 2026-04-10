import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleCompanyIds } from "@/lib/tenant";
import {
  canAccessReportsPage,
  listAccessibleReportTypes,
} from "@/lib/reports/authorize";
import { ReportsContent } from "./reports-content";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!canAccessReportsPage(user.platformRole)) {
    redirect("/dashboard");
  }

  const scope = await getAccessibleCompanyIds({
    id: user.id,
    isSuperAdmin: user.isSuperAdmin,
  });

  const where = scope === undefined ? {} : { id: { in: scope } };
  const companies = await prisma.company.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const availableReports = listAccessibleReportTypes(user.platformRole);

  return (
    <ReportsContent
      companies={companies}
      availableReports={availableReports}
    />
  );
}
