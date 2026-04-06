import { getCurrentUser } from "@/lib/auth";
import { getCompanies } from "@/lib/actions/company";
import { CompanyList } from "./_components/company-list";
import { CreateCompanyDialog } from "./_components/create-company-dialog";

export default async function CompaniesPage() {
  const user = await getCurrentUser();
  const isSuperAdmin = user?.isSuperAdmin ?? false;
  const result = await getCompanies();
  const companies = result.success ? (result.data as any[]) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Empresas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie as empresas e suas integrações com a Meta.
          </p>
        </div>
        {isSuperAdmin && <CreateCompanyDialog />}
      </div>

      {/* Lista */}
      <CompanyList companies={companies} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
