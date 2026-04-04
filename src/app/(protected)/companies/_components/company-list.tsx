import { CompanyCard } from "./company-card";

interface CompanyListProps {
  companies: Array<{
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    logoUrl: string | null;
    isActive: boolean;
    _count: { memberships: number };
    credential: { id: string } | null;
  }>;
}

export function CompanyList({ companies }: CompanyListProps) {
  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
          <span className="text-2xl">🏢</span>
        </div>
        <h3 className="text-lg font-semibold text-zinc-200 mb-1">
          Nenhuma empresa cadastrada
        </h3>
        <p className="text-sm text-zinc-500 max-w-sm">
          Crie sua primeira empresa para comecar a configurar o roteamento de webhooks.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {companies.map((company) => (
        <CompanyCard key={company.id} company={company} />
      ))}
    </div>
  );
}
