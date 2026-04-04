import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/actions/company";
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

  return (
    <div className="space-y-6">
      <CompanyHeader company={company} />
      <CompanyTabs company={company} />
    </div>
  );
}
