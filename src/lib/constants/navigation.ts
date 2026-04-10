// Configuração centralizada de navegação
// Usado por: sidebar

import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  FileBarChart2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Roles que podem ver este item. Se undefined, todos veem */
  allowedRoles?: string[];
}

export const MAIN_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Empresas", href: "/companies", icon: Building2 },
];

export const RESTRICTED_NAV_ITEMS: NavItem[] = [
  { label: "Usuários", href: "/users", icon: Users, allowedRoles: ["super_admin", "admin"] },
  { label: "Relatórios", href: "/relatorios", icon: FileBarChart2, allowedRoles: ["super_admin", "admin", "manager"] },
  { label: "Configurações", href: "/settings", icon: Settings, allowedRoles: ["super_admin"] },
];

/** Retorna todos os itens de navegação visíveis para o role */
export function getNavItems(platformRole: string): NavItem[] {
  const restricted = RESTRICTED_NAV_ITEMS.filter(
    (item) => !item.allowedRoles || item.allowedRoles.includes(platformRole)
  );
  return [...MAIN_NAV_ITEMS, ...restricted];
}
