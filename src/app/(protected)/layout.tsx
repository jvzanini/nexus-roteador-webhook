import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { ThemeInitializer } from '@/components/providers/theme-initializer';

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
  const avatarUrl = (session.user as any)?.avatarUrl ?? null;
  const user = {
    name: session.user.name || session.user.email || 'Usuário',
    email: session.user.email || '',
    role: isSuperAdmin ? 'Super Admin' : 'Usuário',
    isSuperAdmin,
    avatarUrl,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ThemeInitializer theme={(session.user as any)?.theme ?? null} />
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-8 sm:pb-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
