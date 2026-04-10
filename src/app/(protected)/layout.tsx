import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { PLATFORM_ROLE_LABELS } from '@/lib/constants/roles';
import { SearchProvider } from '@/components/layout/search-context';
import { CommandPalette } from '@/components/layout/command-palette';

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
  const platformRole = (session.user as any)?.platformRole ?? 'viewer';
  const avatarUrl = (session.user as any)?.avatarUrl ?? null;

  const roleLabel = PLATFORM_ROLE_LABELS[platformRole] || 'Usuário';

  const user = {
    name: session.user.name || session.user.email || 'Usuário',
    email: session.user.email || '',
    role: roleLabel,
    platformRole,
    isSuperAdmin,
    avatarUrl,
  };

  return (
    <SearchProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar user={user} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-8 sm:pb-8 lg:px-8">
            {children}
          </div>
        </main>
        <CommandPalette />
      </div>
    </SearchProvider>
  );
}
