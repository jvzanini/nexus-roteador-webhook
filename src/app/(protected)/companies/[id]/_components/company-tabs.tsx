import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "./overview-tab";
import { CredentialsTab } from "./credentials-tab";
import { RouteList } from "@/components/routes/route-list";

interface CompanyTabsProps {
  company: {
    id: string;
    name: string;
    slug: string;
    webhookKey: string;
    isActive: boolean;
    createdAt: Date;
    credential: { id: string } | null;
    _count: {
      memberships: number;
      routes: number;
    };
  };
}

export function CompanyTabs({ company }: CompanyTabsProps) {
  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="bg-zinc-800/50 border border-zinc-700/50">
        <TabsTrigger
          value="overview"
          className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100"
        >
          Visao Geral
        </TabsTrigger>
        <TabsTrigger
          value="credentials"
          className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100"
        >
          Credenciais
        </TabsTrigger>
        <TabsTrigger
          value="routes"
          className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100"
        >
          Rotas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <OverviewTab company={company} />
      </TabsContent>

      <TabsContent value="credentials">
        <CredentialsTab companyId={company.id} />
      </TabsContent>

      <TabsContent value="routes">
        <RouteList companyId={company.id} />
      </TabsContent>
    </Tabs>
  );
}
