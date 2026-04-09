'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut,
  Menu,
  X,
  Search,
} from 'lucide-react';
import { getNavItems } from '@/lib/constants/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { signOut } from 'next-auth/react';
import { useSearch } from '@/components/layout/search-context';

interface SidebarProps {
  user: {
    name: string;
    email: string;
    role: string; // Display label
    platformRole: string; // super_admin, admin, manager, viewer
    isSuperAdmin: boolean;
    avatarUrl: string | null;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { openSearch } = useSearch();

  const allMenuItems = getNavItems(user.platformRole);

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-background border-r border-border overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6">
        <Image src="/logo-nexus-ai.png" alt="Nexus AI" width={40} height={40} className="rounded-[22%] shadow-[0_0_12px_rgba(124,58,237,0.3)]" />
        <div>
          <h1 className="text-base font-bold text-foreground tracking-tight">Nexus AI</h1>
          <p className="text-[11px] text-muted-foreground leading-none">Roteador Webhook</p>
        </div>
      </div>

      {/* Busca */}
      <div className="px-3 pb-2 border-b border-border mb-1">
        <button
          onClick={() => {
            openSearch();
            setMobileOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:bg-muted/50 hover:text-foreground cursor-pointer"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Buscar</span>
          <kbd className="hidden text-[10px] font-mono text-muted-foreground/70 bg-background border border-border rounded px-1.5 py-0.5 sm:inline-block">
            ⌘K
          </kbd>
        </button>
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
                      ? 'bg-muted/50 text-violet-500 border-l-2 border-violet-500 pl-[10px]'
                      : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                  }
                `}
              >
                <item.icon className={`h-[18px] w-[18px] transition-colors duration-200 ${active ? 'text-violet-500' : 'text-muted-foreground group-hover:text-foreground'}`} />
                {item.label}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border px-4 py-4 space-y-3">
        {/* User info */}
        <Link
          href="/profile"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 rounded-lg px-2 py-2.5 -mx-1 transition-all duration-200 hover:bg-accent/50 cursor-pointer group"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground overflow-hidden shrink-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              user.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate group-hover:text-foreground transition-colors duration-200">{user.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user.role}</p>
          </div>
        </Link>

        {/* Logout */}
        <Button
          variant="ghost"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
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
          className="h-11 w-11 bg-card border border-border text-foreground hover:text-foreground cursor-pointer"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
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
