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
  canEdit?: boolean;
  canManageRoutes?: boolean;
  canDelete?: boolean;
  currentUserId?: string;
}

export function CompanyTabs({ company, canEdit = true, canManageRoutes = true, canDelete = false, currentUserId }: CompanyTabsProps) {
  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <TabsList className="bg-card border border-border rounded-lg p-1 gap-1 w-max sm:w-auto">
        <TabsTrigger
          value="overview"
          className="data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-400 data-[state=active]:border data-[state=active]:border-violet-500/30 data-[state=active]:shadow-none text-muted-foreground rounded-md px-4 py-2 transition-all duration-200 cursor-pointer text-sm"
        >
          Visão Geral
        </TabsTrigger>
        <TabsTrigger
          value="credentials"
          className="data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-400 data-[state=active]:border data-[state=active]:border-violet-500/30 data-[state=active]:shadow-none text-muted-foreground rounded-md px-4 py-2 transition-all duration-200 cursor-pointer text-sm"
        >
          WhatsApp Cloud
        </TabsTrigger>
        <TabsTrigger
          value="routes"
          className="data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-400 data-[state=active]:border data-[state=active]:border-violet-500/30 data-[state=active]:shadow-none text-muted-foreground rounded-md px-4 py-2 transition-all duration-200 cursor-pointer text-sm"
        >
          Rotas de Webhook
        </TabsTrigger>
        <TabsTrigger
          value="logs"
          className="data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-400 data-[state=active]:border data-[state=active]:border-violet-500/30 data-[state=active]:shadow-none text-muted-foreground rounded-md px-4 py-2 transition-all duration-200 cursor-pointer text-sm"
        >
          Logs
        </TabsTrigger>
        <TabsTrigger
          value="members"
          className="data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-400 data-[state=active]:border data-[state=active]:border-violet-500/30 data-[state=active]:shadow-none text-muted-foreground rounded-md px-4 py-2 transition-all duration-200 cursor-pointer text-sm"
        >
          Membros
        </TabsTrigger>
      </TabsList>
      </div>

      <TabsContent value="overview">
        <OverviewTab company={company} />
      </TabsContent>

      <TabsContent value="credentials">
        <CredentialsTab companyId={company.id} webhookKey={company.webhookKey} canEdit={canEdit} />
      </TabsContent>

      <TabsContent value="routes">
        <RouteList companyId={company.id} canManageRoutes={canManageRoutes} />
      </TabsContent>

      <TabsContent value="logs">
        <LogsTab companyId={company.id} />
      </TabsContent>

      <TabsContent value="members">
        <MembersTab companyId={company.id} canEdit={canEdit} currentUserId={currentUserId} />
      </TabsContent>
    </Tabs>
  );
}
