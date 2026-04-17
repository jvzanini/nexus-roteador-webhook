import { Building2 } from "lucide-react";
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
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/10 border border-violet-500/20">
            <Building2 className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Empresas</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie as empresas e suas integrações com a Meta.
            </p>
          </div>
        </div>
        {isSuperAdmin && <CreateCompanyDialog />}
      </div>

      {/* Lista */}
      <CompanyList companies={companies} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
