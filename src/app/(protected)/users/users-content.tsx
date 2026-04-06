"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
  Shield,
  ShieldCheck,
  Crown,
  Eye,
  EyeOff,
  Users as UsersIcon,
  Loader2,
  AlertTriangle,
  ChevronDown,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} from "@/lib/actions/users";
import type { UserItem } from "@/lib/actions/users";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

// --- Role config ---

type RoleOption = {
  value: string;
  label: string;
  description: string;
};

const ALL_ROLES: RoleOption[] = [
  {
    value: "super_admin",
    label: "Super Admin",
    description: "Acesso total a toda a plataforma",
  },
  {
    value: "company_admin",
    label: "Admin",
    description: "Gerencia empresas e usuários",
  },
  {
    value: "manager",
    label: "Gerente",
    description: "Gerencia rotas e webhooks",
  },
  {
    value: "viewer",
    label: "Visualizador",
    description: "Apenas visualização",
  },
];

function getRoleBadge(role: string) {
  switch (role) {
    case "Super Admin":
      return {
        bg: "bg-purple-500/10 border-purple-500/20 text-purple-400",
        icon: Crown,
      };
    case "Admin":
      return {
        bg: "bg-blue-500/10 border-blue-500/20 text-blue-400",
        icon: ShieldCheck,
      };
    case "Gerente":
      return {
        bg: "bg-amber-500/10 border-amber-500/20 text-amber-400",
        icon: Shield,
      };
    case "Visualizador":
      return {
        bg: "bg-zinc-800 border-zinc-700 text-zinc-400",
        icon: Eye,
      };
    default:
      return {
        bg: "bg-zinc-800 border-zinc-700 text-zinc-500",
        icon: UserX,
      };
  }
}

// --- Form types ---

interface UserFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
  isActive: boolean;
}

const emptyForm: UserFormData = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "viewer",
  isActive: true,
};

// --- Components ---

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-lg bg-muted/50 border border-border"
        />
      ))}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-200"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// --- BadgeSelect component ---

function BadgeSelect({
  value,
  onChange,
  options,
  getBadgeStyle,
  useFixed = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string; bg: string; icon: React.ComponentType<{ className?: string }> }[];
  getBadgeStyle: (value: string) => { bg: string; icon: React.ComponentType<{ className?: string }> };
  useFixed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const current = getBadgeStyle(value);
  const CurrentIcon = current.icon;
  const currentOption = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleToggle() {
    if (!open && useFixed && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropdownPos({
        position: 'fixed' as const,
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 240),
        zIndex: 200,
      });
    }
    setOpen(!open);
  }

  const dropdownClasses = useFixed
    ? "rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
    : "absolute left-0 top-full mt-1 z-[200] min-w-[240px] rounded-lg border border-border bg-popover shadow-xl overflow-hidden";

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-all hover:opacity-80 ${current.bg}`}
      >
        <CurrentIcon className="h-3 w-3" />
        {currentOption?.label ?? value}
        <ChevronDown className={`h-3 w-3 ml-0.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={useFixed ? dropdownPos : undefined}
            className={dropdownClasses}
          >
            {options.map((option) => {
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => { onChange(option.value); setOpen(false); }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left cursor-pointer transition-all hover:bg-accent ${value === option.value ? "bg-accent/50" : ""}`}
                >
                  <OptionIcon className={`h-4 w-4 shrink-0 ${option.bg.includes("purple") ? "text-purple-400" : option.bg.includes("blue") ? "text-blue-400" : option.bg.includes("amber") ? "text-amber-400" : option.bg.includes("emerald") ? "text-emerald-400" : option.bg.includes("red") ? "text-red-400" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">{option.label}</span>
                    {option.description && (
                      <span className="block text-xs text-muted-foreground">{option.description}</span>
                    )}
                  </div>
                  {value === option.value && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Main component ---

interface UsersContentProps {
  isSuperAdmin: boolean;
  currentUserId: string;
}

function mapRoleToValue(displayRole: string): string {
  switch (displayRole) {
    case "Super Admin": return "super_admin";
    case "Admin": return "company_admin";
    case "Gerente": return "manager";
    case "Visualizador": return "viewer";
    default: return "viewer";
  }
}

export function UsersContent({ isSuperAdmin, currentUserId }: UsersContentProps) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [passwordError, setPasswordError] = useState("");
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);

  const availableRoles = isSuperAdmin
    ? ALL_ROLES
    : ALL_ROLES.filter((r) => r.value !== "super_admin");

  async function loadUsers() {
    const result = await getUsers();
    if (result.success && result.data) {
      setUsers(result.data);
    } else {
      toast.error(result.error || "Erro ao carregar usuários");
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    loadUsers();
  }, []);

  function openCreate() {
    setForm(emptyForm);
    setPasswordError("");
    setCreateOpen(true);
  }

  function openEdit(user: UserItem) {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      confirmPassword: "",
      role: user.isSuperAdmin
        ? "super_admin"
        : user.highestRole === "Admin"
          ? "company_admin"
          : user.highestRole === "Gerente"
            ? "manager"
            : user.highestRole === "Visualizador"
              ? "viewer"
              : "viewer",
      isActive: user.isActive,
    });
    setPasswordError("");
    setEditOpen(true);
  }

  function openDeleteDialog(user: UserItem) {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  }

  function handleSubmitCreate() {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setPasswordError("As senhas não coincidem");
      return;
    }

    setPasswordError("");

    startSaving(async () => {
      const result = await createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role as
          | "super_admin"
          | "company_admin"
          | "manager"
          | "viewer",
      });

      if (result.success) {
        toast.success("Usuário criado com sucesso");
        setCreateOpen(false);
        setForm(emptyForm);
        await loadUsers();
      } else {
        toast.error(result.error || "Erro ao criar usuário");
      }
    });
  }

  function handleSubmitEdit() {
    if (!editingUser) return;
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Nome e email são obrigatórios");
      return;
    }

    // Se digitou senha, validar confirmacao
    if (form.password.trim() && form.password !== form.confirmPassword) {
      setPasswordError("As senhas não coincidem");
      return;
    }

    setPasswordError("");

    startSaving(async () => {
      const data: {
        name?: string;
        email?: string;
        password?: string;
        role?: "super_admin" | "company_admin" | "manager" | "viewer";
        isActive?: boolean;
      } = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role as
          | "super_admin"
          | "company_admin"
          | "manager"
          | "viewer",
        isActive: form.isActive,
      };
      if (form.password.trim()) {
        data.password = form.password;
      }

      const result = await updateUser(editingUser.id, data);

      if (result.success) {
        toast.success("Usuário atualizado com sucesso");
        setEditOpen(false);
        setEditingUser(null);
        setForm(emptyForm);
        await loadUsers();
      } else {
        toast.error(result.error || "Erro ao atualizar usuário");
      }
    });
  }

  function handleDelete() {
    if (!userToDelete) return;

    startDeleting(async () => {
      const result = await deleteUser(userToDelete.id);

      if (result.success) {
        toast.success(`Usuário "${userToDelete.name}" excluído com sucesso`);
        setDeleteDialogOpen(false);
        setUserToDelete(null);
        await loadUsers();
      } else {
        toast.error(result.error || "Erro ao excluir usuário");
      }
    });
  }

  async function handleInlineRoleChange(userId: string, role: string) {
    startSaving(async () => {
      const result = await updateUser(userId, { role: role as "super_admin" | "company_admin" | "manager" | "viewer" });
      if (result.success) {
        const warning = (result as any).warning;
        if (warning) {
          toast.warning(warning);
        } else {
          toast.success("Nível atualizado");
        }
        await loadUsers();
      } else {
        toast.error(result.error || "Erro ao atualizar nível");
      }
    });
  }

  async function handleInlineStatusChange(userId: string, isActive: boolean) {
    startSaving(async () => {
      const result = await updateUser(userId, { isActive });
      if (result.success) {
        toast.success(isActive ? "Usuário ativado" : "Usuário inativado");
        await loadUsers();
      } else {
        toast.error(result.error || "Erro ao atualizar status");
      }
    });
  }

  function renderForm(mode: "create" | "edit") {
    const showConfirmPassword =
      mode === "create" || form.password.trim().length > 0;

    return (
      <div className="space-y-4">
        {/* Nome */}
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">
            Nome
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nome do usuário"
            className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">
            Email
          </label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="email@exemplo.com"
            className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Senha */}
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">
            Senha
          </label>
          <PasswordInput
            value={form.password}
            onChange={(value) => {
              setForm((f) => ({ ...f, password: value }));
              setPasswordError("");
            }}
            placeholder={
              mode === "edit" ? "••••••••" : "Mínimo 8 caracteres"
            }
          />
          {mode === "edit" && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Deixe vazio para manter a senha atual
            </p>
          )}
        </div>

        {/* Confirmar senha */}
        {showConfirmPassword && (
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1.5">
              Confirmar senha
            </label>
            <PasswordInput
              value={form.confirmPassword}
              onChange={(value) => {
                setForm((f) => ({ ...f, confirmPassword: value }));
                setPasswordError("");
              }}
              placeholder="Confirme a senha"
            />
            {passwordError && (
              <p className="mt-1.5 text-xs text-red-400">{passwordError}</p>
            )}
          </div>
        )}

        {/* Nivel de acesso */}
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1.5">
            Nível de acesso
          </label>
          <BadgeSelect
            value={form.role}
            onChange={(val) => setForm((f) => ({ ...f, role: val }))}
            options={availableRoles.map((r) => ({
              value: r.value,
              label: r.label,
              description: r.description,
              bg: r.value === "super_admin" ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                : r.value === "company_admin" ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                : r.value === "manager" ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-zinc-800 border-zinc-700 text-zinc-400",
              icon: r.value === "super_admin" ? Crown
                : r.value === "company_admin" ? ShieldCheck
                : r.value === "manager" ? Shield
                : Eye,
            }))}
            getBadgeStyle={(val) => {
              switch (val) {
                case "super_admin": return { bg: "bg-purple-500/10 border-purple-500/20 text-purple-400", icon: Crown };
                case "company_admin": return { bg: "bg-blue-500/10 border-blue-500/20 text-blue-400", icon: ShieldCheck };
                case "manager": return { bg: "bg-amber-500/10 border-amber-500/20 text-amber-400", icon: Shield };
                default: return { bg: "bg-zinc-800 border-zinc-700 text-zinc-400", icon: Eye };
              }
            }}
          />
        </div>

        {/* Ativo/Inativo (apenas na edicao, exceto super admin) */}
        {mode === "edit" && editingUser && editingUser.highestRole !== "Super Admin" && (
          <div className="flex items-center justify-between rounded-lg bg-muted/30 border border-border px-4 py-3">
            <div className="flex items-center gap-2">
              {form.isActive ? (
                <UserCheck className="h-4 w-4 text-emerald-400" />
              ) : (
                <UserX className="h-4 w-4 text-red-400" />
              )}
              <span className="text-sm text-foreground/80">
                {form.isActive ? "Ativo" : "Inativo"}
              </span>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, isActive: !!checked }))
              }
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/10 border border-violet-500/20">
            <UsersIcon className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Usuários</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie os usuários da plataforma
            </p>
          </div>
        </div>
        <Button
          onClick={openCreate}
          className="gap-2 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
        >
          <Plus className="h-4 w-4" />
          Novo Usuário
        </Button>
      </motion.div>

      {/* Table */}
      <motion.div
        variants={itemVariants}
        className="rounded-xl border border-border bg-card/50 overflow-hidden overflow-x-auto"
      >
        {loading ? (
          <div className="p-6">
            <TableSkeleton />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <UsersIcon className="h-12 w-12 mb-3 text-muted-foreground/60" />
            <p className="text-sm">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Nome</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                <TableHead className="text-muted-foreground text-center">
                  Nível
                </TableHead>
                <TableHead className="text-muted-foreground text-center">
                  Status
                </TableHead>
                <TableHead className="text-muted-foreground text-center">
                  Empresas
                </TableHead>
                <TableHead className="text-muted-foreground text-center hidden sm:table-cell">
                  Criado em
                </TableHead>
                <TableHead className="text-muted-foreground text-center">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user, index) => {
                const badge = getRoleBadge(user.highestRole);
                const BadgeIcon = badge.icon;

                return (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.2,
                      delay: index * 0.03,
                      ease: "easeOut" as const,
                    }}
                    className="border-border hover:bg-accent/30 transition-colors duration-200"
                  >
                    <TableCell className="font-medium text-foreground">
                      {user.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const isOwnUser = user.id === currentUserId;
                        const isTargetSuperAdmin = user.highestRole === "Super Admin";

                        if (isOwnUser || (isTargetSuperAdmin && !isSuperAdmin)) {
                          return (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.bg}`}
                            >
                              <BadgeIcon className="h-3 w-3" />
                              {user.highestRole}
                            </span>
                          );
                        }

                        const roleSelectOptions = (isSuperAdmin ? [
                          { value: "super_admin", label: "Super Admin", description: "Acesso total a toda a plataforma", bg: "bg-purple-500/10 border-purple-500/20 text-purple-400", icon: Crown },
                        ] : []).concat([
                          { value: "company_admin", label: "Admin", description: "Gerencia empresas e usuários", bg: "bg-blue-500/10 border-blue-500/20 text-blue-400", icon: ShieldCheck },
                          { value: "manager", label: "Gerente", description: "Gerencia rotas e webhooks", bg: "bg-amber-500/10 border-amber-500/20 text-amber-400", icon: Shield },
                          { value: "viewer", label: "Visualizador", description: "Apenas visualização", bg: "bg-zinc-800 border-zinc-700 text-zinc-400", icon: Eye },
                        ]);

                        return (
                          <BadgeSelect
                            useFixed
                            value={mapRoleToValue(user.highestRole)}
                            onChange={(val) => handleInlineRoleChange(user.id, val)}
                            options={roleSelectOptions}
                            getBadgeStyle={(val) => {
                              switch (val) {
                                case "super_admin": return { bg: "bg-purple-500/10 border-purple-500/20 text-purple-400", icon: Crown };
                                case "company_admin": return { bg: "bg-blue-500/10 border-blue-500/20 text-blue-400", icon: ShieldCheck };
                                case "manager": return { bg: "bg-amber-500/10 border-amber-500/20 text-amber-400", icon: Shield };
                                default: return { bg: "bg-zinc-800 border-zinc-700 text-zinc-400", icon: Eye };
                              }
                            }}
                          />
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      {user.id === currentUserId ? (
                        user.isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                            <UserCheck className="h-3 w-3" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-400">
                            <UserX className="h-3 w-3" />
                            Inativo
                          </span>
                        )
                      ) : (
                        <BadgeSelect
                          useFixed
                          value={user.isActive ? "active" : "inactive"}
                          onChange={(val) => handleInlineStatusChange(user.id, val === "active")}
                          options={[
                            { value: "active", label: "Ativo", bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400", icon: UserCheck },
                            { value: "inactive", label: "Inativo", bg: "bg-red-500/10 border-red-500/20 text-red-400", icon: UserX },
                          ]}
                          getBadgeStyle={(val) => val === "active"
                            ? { bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400", icon: UserCheck }
                            : { bg: "bg-red-500/10 border-red-500/20 text-red-400", icon: UserX }
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {user.companiesCount}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground text-sm hidden sm:table-cell">
                      {format(new Date(user.createdAt), "dd MMM yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {user.canEdit && user.id !== currentUserId && (
                          <button
                            type="button"
                            onClick={() => openEdit(user)}
                            title="Editar usuário"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-all duration-200"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {user.canDelete && (
                          <button
                            type="button"
                            onClick={() => openDeleteDialog(user)}
                            title="Excluir usuário"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        )}
      </motion.div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md overflow-visible">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>
              Crie um novo usuário para a plataforma
            </DialogDescription>
          </DialogHeader>
          {renderForm("create")}
          <DialogFooter>
            <Button
              onClick={handleSubmitCreate}
              disabled={saving}
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditingUser(null);
        }}
      >
        <DialogContent className="sm:max-w-md overflow-visible">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize os dados do usuário
            </DialogDescription>
          </DialogHeader>
          {renderForm("edit")}
          <DialogFooter>
            <Button
              onClick={handleSubmitEdit}
              disabled={saving}
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Excluir usuário
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tem certeza que deseja excluir o usuário{" "}
              <strong className="text-foreground">
                &quot;{userToDelete?.name}&quot;
              </strong>
              ? Esta ação é irreversível. Todas as associações com empresas
              serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className="border-border text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-all duration-200"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700 cursor-pointer transition-all duration-200"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
