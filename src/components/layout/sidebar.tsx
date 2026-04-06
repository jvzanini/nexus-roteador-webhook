'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { signOut } from 'next-auth/react';

interface SidebarProps {
  user: {
    name: string;
    email: string;
    role: string;
    isSuperAdmin: boolean;
    avatarUrl: string | null;
  };
}

const menuItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Empresas', href: '/companies', icon: Building2 },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const allMenuItems = [
    ...menuItems,
    ...(user.isSuperAdmin
      ? [
          { label: 'Usuários', href: '/users', icon: Users },
          { label: 'Configurações', href: '/settings', icon: Settings },
        ]
      : []),
  ];

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#09090b] border-r border-zinc-800">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6">
        <Image src="/logo-nexus-ai.png" alt="Nexus AI" width={36} height={36} className="rounded-lg" />
        <div>
          <h1 className="text-base font-bold text-white tracking-tight">Nexus AI</h1>
          <p className="text-[11px] text-zinc-500 leading-none">Roteador Webhook</p>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {allMenuItems.map((item, index) => {
          const active = isActive(item.href);
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
            >
              <Link
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`
                  group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium
                  transition-all duration-200 cursor-pointer
                  ${
                    active
                      ? 'bg-zinc-800/50 text-violet-500 border-l-2 border-violet-500 pl-[10px]'
                      : 'text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-200'
                  }
                `}
              >
                <item.icon className={`h-[18px] w-[18px] transition-colors duration-200 ${active ? 'text-violet-500' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                {item.label}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-zinc-800 px-4 py-4 space-y-3">
        {/* User info */}
        <Link
          href="/profile"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 rounded-lg px-1 py-1.5 -mx-1 transition-all duration-200 hover:bg-zinc-800/50 cursor-pointer group"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300 overflow-hidden shrink-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors duration-200">{user.name}</p>
            <p className="text-[11px] text-zinc-500 truncate">{user.role}</p>
          </div>
        </Link>

        {/* Logout */}
        <Button
          variant="ghost"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full justify-start gap-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
          size="sm"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile toggle */}
      <div className="fixed top-4 left-4 z-50 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              exit={{ x: -256 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-60 lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
