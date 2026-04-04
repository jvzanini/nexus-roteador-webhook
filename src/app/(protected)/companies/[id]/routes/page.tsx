import { RouteList } from "@/components/routes/route-list";

interface RoutesPageProps {
  params: Promise<{ id: string }>;
}

export default async function RoutesPage({ params }: RoutesPageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <RouteList companyId={id} />
    </div>
  );
}
