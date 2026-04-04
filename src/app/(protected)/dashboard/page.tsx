import { auth } from '@/auth';
import { DashboardContent } from '@/components/dashboard/dashboard-content';

export const metadata = {
  title: 'Dashboard | Nexus Roteador Webhook',
};

export default async function DashboardPage() {
  const session = await auth();

  const userName = session?.user?.name || session?.user?.email || 'Usuario';
  const isSuperAdmin = (session?.user as any)?.isSuperAdmin;

  return (
    <DashboardContent
      userName={userName}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
