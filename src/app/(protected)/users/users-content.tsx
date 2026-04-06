"use client";

import { useState, useEffect, useTransition } from "react";
import { motion } from "framer-motion";
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
} from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
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
          className="h-14 animate-pulse rounded-lg bg-zinc-800/50 border border-zinc-800"
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
        className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors duration-200"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// --- Main component ---

interface UsersContentProps {
  isSuperAdmin: boolean;
}

export function UsersContent({ isSuperAdmin }: UsersContentProps) {
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

  function renderForm(mode: "create" | "edit") {
    const showConfirmPassword =
      mode === "create" || form.password.trim().length > 0;

    return (
      <div className="space-y-4">
        {/* Nome */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Nome
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nome do usuário"
            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Email
          </label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="email@exemplo.com"
            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>

        {/* Senha */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            {mode === "edit"
              ? "Nova senha (deixe vazio para manter)"
              : "Senha"}
          </label>
          <PasswordInput
            value={form.password}
            onChange={(value) => {
              setForm((f) => ({ ...f, password: value }));
              setPasswordError("");
            }}
            placeholder={
              mode === "edit" ? "Nova senha (opcional)" : "Mínimo 8 caracteres"
            }
          />
        </div>

        {/* Confirmar senha */}
        {showConfirmPassword && (
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
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
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Nível de acesso
          </label>
          <CustomSelect
            value={form.role}
            onChange={(value) => setForm((f) => ({ ...f, role: value }))}
            placeholder="Selecionar nível"
            options={availableRoles.map((r) => ({
              value: r.value,
              label: r.label,
              description: r.description,
            }))}
          />
        </div>

        {/* Ativo/Inativo (apenas na edicao) */}
        {mode === "edit" && (
          <div className="flex items-center justify-between rounded-lg bg-zinc-800/30 border border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              {form.isActive ? (
                <UserCheck className="h-4 w-4 text-emerald-400" />
              ) : (
                <UserX className="h-4 w-4 text-red-400" />
              )}
              <span className="text-sm text-zinc-300">
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
            <h1 className="text-xl font-bold text-zinc-100">Usuários</h1>
            <p className="text-sm text-zinc-500">
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
        className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
      >
        {loading ? (
          <div className="p-6">
            <TableSkeleton />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
            <UsersIcon className="h-12 w-12 mb-3 text-zinc-600" />
            <p className="text-sm">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Nome</TableHead>
                <TableHead className="text-zinc-400">Email</TableHead>
                <TableHead className="text-zinc-400 text-center">
                  Nível
                </TableHead>
                <TableHead className="text-zinc-400 text-center">
                  Status
                </TableHead>
                <TableHead className="text-zinc-400 text-center">
                  Empresas
                </TableHead>
                <TableHead className="text-zinc-400 text-center">
                  Criado em
                </TableHead>
                <TableHead className="text-zinc-400 text-center">
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
                    className="border-zinc-800 hover:bg-zinc-800/30 transition-colors duration-200"
                  >
                    <TableCell className="font-medium text-zinc-200">
                      {user.name}
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {user.email}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.bg}`}
                      >
                        <BadgeIcon className="h-3 w-3" />
                        {user.highestRole}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                          <UserCheck className="h-3 w-3" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-400">
                          <UserX className="h-3 w-3" />
                          Inativo
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-zinc-400">
                      {user.companiesCount}
                    </TableCell>
                    <TableCell className="text-center text-zinc-500 text-sm">
                      {format(new Date(user.createdAt), "dd MMM yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => user.canEdit && openEdit(user)}
                          disabled={!user.canEdit}
                          title={
                            user.canEdit
                              ? "Editar usuário"
                              : "Sem permissão para editar"
                          }
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200 ${
                            user.canEdit
                              ? "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                              : "text-zinc-700 cursor-not-allowed"
                          }`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {user.canDelete && (
                          <button
                            type="button"
                            onClick={() => openDeleteDialog(user)}
                            title="Excluir usuário"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
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
        <DialogContent className="sm:max-w-md">
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
        <DialogContent className="sm:max-w-md">
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
        <AlertDialogContent className="bg-zinc-900 border border-zinc-800 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-zinc-100">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Excluir usuário
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Tem certeza que deseja excluir o usuário{" "}
              <strong className="text-zinc-200">
                &quot;{userToDelete?.name}&quot;
              </strong>
              ? Esta ação é irreversível. Todas as associações com empresas
              serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className="border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer transition-all duration-200"
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
