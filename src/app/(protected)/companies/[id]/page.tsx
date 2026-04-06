import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/actions/company";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { CompanyHeader } from "./_components/company-header";
import { CompanyTabs } from "./_components/company-tabs";

interface CompanyPageProps {
  params: Promise<{ id: string }>;
}

export default async function CompanyPage({ params }: CompanyPageProps) {
  const { id } = await params;
  const result = await getCompanyById(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const company = result.data as any;

  // Determinar role do usuário na empresa
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const isSuperAdmin = (session?.user as any)?.isSuperAdmin ?? false;

  let userRole: string = "viewer";
  if (isSuperAdmin) {
    userRole = "super_admin";
  } else if (userId) {
    const membership = await prisma.userCompanyMembership.findUnique({
      where: { userId_companyId: { userId, companyId: id } },
      select: { role: true },
    });
    if (membership) userRole = membership.role;
  }

  const canEdit = userRole === "super_admin" || userRole === "company_admin";
  const canManageRoutes = canEdit || userRole === "manager";
  const canDelete = userRole === "super_admin";

  return (
    <div className="space-y-6">
      <CompanyHeader company={company} canEdit={canEdit} canDelete={canDelete} />
      <CompanyTabs company={company} canEdit={canEdit} canManageRoutes={canManageRoutes} canDelete={canDelete} currentUserId={userId} currentUserIsSuperAdmin={isSuperAdmin} />
    </div>
  );
}
