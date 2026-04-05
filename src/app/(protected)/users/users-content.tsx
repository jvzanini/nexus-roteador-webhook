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
  Plus,
  Pencil,
  UserCheck,
  UserX,
  Shield,
  Users as UsersIcon,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getUsers, createUser, updateUser } from "@/lib/actions/users";
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

interface UserFormData {
  name: string;
  email: string;
  password: string;
  isSuperAdmin: boolean;
}

const emptyForm: UserFormData = {
  name: "",
  email: "",
  password: "",
  isSuperAdmin: false,
};

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

export function UsersContent() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [saving, startSaving] = useTransition();
  const [toggling, startToggling] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function loadUsers() {
    const result = await getUsers();
    if (result.success && result.data) {
      setUsers(result.data);
    } else {
      toast.error(result.error || "Erro ao carregar usuarios");
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadUsers(); }, []);

  function openCreate() {
    setForm(emptyForm);
    setCreateOpen(true);
  }

  function openEdit(user: UserItem) {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      isSuperAdmin: user.isSuperAdmin,
    });
    setEditOpen(true);
  }

  function handleSubmitCreate() {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error("Preencha todos os campos obrigatorios");
      return;
    }

    startSaving(async () => {
      const result = await createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        isSuperAdmin: form.isSuperAdmin,
      });

      if (result.success) {
        toast.success("Usuario criado com sucesso");
        setCreateOpen(false);
        setForm(emptyForm);
        await loadUsers();
      } else {
        toast.error(result.error || "Erro ao criar usuario");
      }
    });
  }

  function handleSubmitEdit() {
    if (!editingUser) return;
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Nome e email sao obrigatorios");
      return;
    }

    startSaving(async () => {
      const data: Parameters<typeof updateUser>[1] = {
        name: form.name.trim(),
        email: form.email.trim(),
        isSuperAdmin: form.isSuperAdmin,
      };
      if (form.password.trim()) {
        data.password = form.password;
      }

      const result = await updateUser(editingUser.id, data);

      if (result.success) {
        toast.success("Usuario atualizado com sucesso");
        setEditOpen(false);
        setEditingUser(null);
        setForm(emptyForm);
        await loadUsers();
      } else {
        toast.error(result.error || "Erro ao atualizar usuario");
      }
    });
  }

  function handleToggleActive(user: UserItem) {
    setTogglingId(user.id);
    startToggling(async () => {
      const result = await updateUser(user.id, { isActive: !user.isActive });

      if (result.success) {
        toast.success(
          user.isActive ? "Usuario desativado" : "Usuario ativado"
        );
        await loadUsers();
      } else {
        toast.error(result.error || "Erro ao alterar status");
      }
      setTogglingId(null);
    });
  }

  function renderForm(mode: "create" | "edit") {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Nome
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nome do usuario"
            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
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
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Senha{mode === "edit" ? " (deixe vazio para manter)" : ""}
          </label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) =>
              setForm((f) => ({ ...f, password: e.target.value }))
            }
            placeholder={
              mode === "edit" ? "Nova senha (opcional)" : "Senha do usuario"
            }
            className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-zinc-800/30 border border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-purple-400" />
            <span className="text-sm text-zinc-300">Super Admin</span>
          </div>
          <Switch
            checked={form.isSuperAdmin}
            onCheckedChange={(checked) =>
              setForm((f) => ({ ...f, isSuperAdmin: !!checked }))
            }
          />
        </div>
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 border border-blue-500/20">
            <UsersIcon className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Usuarios</h1>
            <p className="text-sm text-zinc-500">
              Gerencie os usuarios da plataforma
            </p>
          </div>
        </div>
        <Button
          onClick={openCreate}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-all duration-200"
        >
          <Plus className="h-4 w-4" />
          Novo Usuario
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
            <p className="text-sm">Nenhum usuario encontrado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Nome</TableHead>
                <TableHead className="text-zinc-400">Email</TableHead>
                <TableHead className="text-zinc-400">Perfil</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400 text-center">
                  Empresas
                </TableHead>
                <TableHead className="text-zinc-400">Criado em</TableHead>
                <TableHead className="text-zinc-400 text-right">
                  Acoes
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user, index) => (
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
                  <TableCell className="text-zinc-400">{user.email}</TableCell>
                  <TableCell>
                    {user.isSuperAdmin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 text-xs font-medium text-purple-400">
                        <Shield className="h-3 w-3" />
                        Super Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 border border-zinc-700 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                        Usuario
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
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
                  <TableCell className="text-zinc-500 text-sm">
                    {format(new Date(user.createdAt), "dd MMM yyyy", {
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(user)}
                        className="h-8 w-8 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer transition-all duration-200"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(user)}
                        disabled={toggling && togglingId === user.id}
                        className={`h-8 w-8 cursor-pointer transition-all duration-200 ${
                          user.isActive
                            ? "text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                            : "text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                        }`}
                      >
                        {toggling && togglingId === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : user.isActive ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <UserCheck className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        )}
      </motion.div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Usuario</DialogTitle>
            <DialogDescription>
              Crie um novo usuario para a plataforma
            </DialogDescription>
          </DialogHeader>
          {renderForm("create")}
          <DialogFooter>
            <Button
              onClick={handleSubmitCreate}
              disabled={saving}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-all duration-200"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Usuario
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
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>
              Atualize os dados do usuario
            </DialogDescription>
          </DialogHeader>
          {renderForm("edit")}
          <DialogFooter>
            <Button
              onClick={handleSubmitEdit}
              disabled={saving}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-all duration-200"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar Alteracoes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
