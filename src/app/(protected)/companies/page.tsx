import { getCompanies } from "@/lib/actions/company";
import { CompanyList } from "./_components/company-list";
import { CreateCompanyDialog } from "./_components/create-company-dialog";

export default async function CompaniesPage() {
  const result = await getCompanies();
  const companies = result.success ? (result.data as any[]) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Empresas</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Gerencie as empresas e suas integracoes com a Meta.
          </p>
        </div>
        <CreateCompanyDialog />
      </div>

      {/* Lista */}
      <CompanyList companies={companies} />
    </div>
  );
}
