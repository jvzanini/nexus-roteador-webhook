import { auth } from '@/auth';

export const metadata = {
  title: 'Dashboard | Nexus Roteador Webhook',
};

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-2 text-zinc-400">
          Bem-vindo, {session?.user?.name || session?.user?.email}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {(session?.user as any)?.isSuperAdmin
            ? 'Super Admin'
            : 'Usuario'}
        </p>
      </div>
    </div>
  );
}
