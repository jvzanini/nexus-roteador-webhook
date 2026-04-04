import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { NotificationBell } from '@/components/layout/notification-bell';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const isSuperAdmin = (session.user as any)?.isSuperAdmin ?? false;
  const user = {
    name: session.user.name || session.user.email || 'Usuario',
    email: session.user.email || '',
    role: isSuperAdmin ? 'Super Admin' : 'Usuario',
    isSuperAdmin,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#09090b]">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto relative">
        <div className="absolute top-4 right-4 sm:right-6 lg:right-8 z-30">
          <NotificationBell />
        </div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
