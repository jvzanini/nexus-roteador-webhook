import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "./overview-tab";
import { CredentialsTab } from "./credentials-tab";
import { RouteList } from "@/components/routes/route-list";
import { LogsTab } from "./logs-tab";
import { MembersTab } from "./members-tab";

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
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <TabsList className="bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-max sm:w-auto">
        <TabsTrigger
          value="overview"
          className="data-[state=active]:bg-zinc-800 data-[state=active]:text-violet-400 data-[state=active]:shadow-none text-zinc-400 rounded-md transition-all duration-200 cursor-pointer"
        >
          Visão Geral
        </TabsTrigger>
        <TabsTrigger
          value="credentials"
          className="data-[state=active]:bg-zinc-800 data-[state=active]:text-violet-400 data-[state=active]:shadow-none text-zinc-400 rounded-md transition-all duration-200 cursor-pointer"
        >
          WhatsApp Cloud
        </TabsTrigger>
        <TabsTrigger
          value="routes"
          className="data-[state=active]:bg-zinc-800 data-[state=active]:text-violet-400 data-[state=active]:shadow-none text-zinc-400 rounded-md transition-all duration-200 cursor-pointer"
        >
          Rotas de Webhook
        </TabsTrigger>
        <TabsTrigger
          value="logs"
          className="data-[state=active]:bg-zinc-800 data-[state=active]:text-violet-400 data-[state=active]:shadow-none text-zinc-400 rounded-md transition-all duration-200 cursor-pointer"
        >
          Logs
        </TabsTrigger>
        <TabsTrigger
          value="members"
          className="data-[state=active]:bg-zinc-800 data-[state=active]:text-violet-400 data-[state=active]:shadow-none text-zinc-400 rounded-md transition-all duration-200 cursor-pointer"
        >
          Membros
        </TabsTrigger>
      </TabsList>
      </div>

      <TabsContent value="overview">
        <OverviewTab company={company} />
      </TabsContent>

      <TabsContent value="credentials">
        <CredentialsTab companyId={company.id} webhookKey={company.webhookKey} />
      </TabsContent>

      <TabsContent value="routes">
        <RouteList companyId={company.id} />
      </TabsContent>

      <TabsContent value="logs">
        <LogsTab companyId={company.id} />
      </TabsContent>

      <TabsContent value="members">
        <MembersTab companyId={company.id} />
      </TabsContent>
    </Tabs>
  );
}
