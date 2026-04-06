"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { CustomSelect } from "@/components/ui/custom-select";
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
import { UserPlus, Trash2, Shield, Eye, Briefcase, Users, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getCompanyMembers,
  addCompanyMember,
  updateMembership,
  removeMembership,
  getUsers,
} from "@/lib/actions/users";
import type { MemberItem, UserItem } from "@/lib/actions/users";

interface MembersTabProps {
  companyId: string;
}

const roleLabels: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  company_admin: {
    label: "Admin",
    icon: <Shield className="size-3" />,
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  },
  manager: {
    label: "Gerente",
    icon: <Briefcase className="size-3" />,
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  },
  viewer: {
    label: "Visualizador",
    icon: <Eye className="size-3" />,
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      ease: [0.4, 0, 0.2, 1] as const,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const },
  },
} as const;

export function MembersTab({ companyId }: MembersTabProps) {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<UserItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("viewer");
  const [deletingMember, setDeletingMember] = useState<MemberItem | null>(null);

  const fetchMembers = useCallback(async () => {
    const result = await getCompanyMembers(companyId);
    if (result.success && result.data) {
      setMembers(result.data);
    } else {
      toast.error(result.error || "Erro ao carregar membros");
    }
    setLoading(false);
  }, [companyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  function handleOpenAddForm() {
    setShowAddForm(true);
    startTransition(async () => {
      const result = await getUsers();
      if (result.success && result.data) {
        // Filtrar usuarios que ja sao membros
        const memberUserIds = new Set(members.map((m) => m.userId));
        setAvailableUsers(result.data.filter((u) => !memberUserIds.has(u.id)));
      }
    });
  }

  function handleCancelAdd() {
    setShowAddForm(false);
    setSelectedUserId("");
    setSelectedRole("viewer");
  }

  function handleAddMember() {
    if (!selectedUserId) {
      toast.error("Selecione um usuário");
      return;
    }

    startTransition(async () => {
      const result = await addCompanyMember({
        userId: selectedUserId,
        companyId,
        role: selectedRole as "company_admin" | "manager" | "viewer",
      });

      if (result.success) {
        toast.success("Membro adicionado com sucesso");
        handleCancelAdd();
        await fetchMembers();
      } else {
        toast.error(result.error || "Erro ao adicionar membro");
      }
    });
  }

  function handleRoleChange(membershipId: string, newRole: string) {
    startTransition(async () => {
      const result = await updateMembership({
        membershipId,
        role: newRole as "company_admin" | "manager" | "viewer",
      });

      if (result.success) {
        toast.success("Papel atualizado");
        await fetchMembers();
      } else {
        toast.error(result.error || "Erro ao atualizar papel");
      }
    });
  }

  function handleConfirmRemoveMember() {
    if (!deletingMember) return;

    startTransition(async () => {
      const result = await removeMembership(deletingMember.id);

      if (result.success) {
        toast.success("Membro removido");
        setDeletingMember(null);
        await fetchMembers();
      } else {
        toast.error(result.error || "Erro ao remover membro");
      }
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-muted/50 rounded-lg animate-pulse" />
        <div className="h-64 bg-muted/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Users className="size-5 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground/80">
            {members.length} {members.length === 1 ? "membro" : "membros"}
          </h3>
        </div>
        {!showAddForm && (
          <Button
            variant="outline"
            size="sm"
            className="border-border bg-muted/50 text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer transition-all duration-200"
            onClick={handleOpenAddForm}
            disabled={isPending}
            title="Adicionar novo membro"
          >
            <UserPlus className="size-4 mr-1" />
            Adicionar Membro
          </Button>
        )}
      </motion.div>

      {/* Formulário de adicionar membro */}
      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="rounded-xl border border-border bg-card/50 p-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Usuário
              </label>
              <CustomSelect
                value={selectedUserId}
                onChange={(v) => setSelectedUserId(v)}
                placeholder="Selecione um usuário"
                options={
                  availableUsers.length === 0
                    ? [{ value: "_none", label: "Nenhum usuário disponível" }]
                    : availableUsers.map((user) => ({
                        value: user.id,
                        label: user.name,
                        description: user.email,
                      }))
                }
              />
            </div>

            <div className="w-44 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Papel</label>
              <CustomSelect
                value={selectedRole}
                onChange={(v) => setSelectedRole(v)}
                options={[
                  { value: "company_admin", label: "Admin", description: "Gerencia a empresa" },
                  { value: "manager", label: "Gerente", description: "Gerencia rotas e webhooks" },
                  { value: "viewer", label: "Visualizador", description: "Apenas visualização" },
                ]}
              />
            </div>

            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
              onClick={handleAddMember}
              disabled={isPending || !selectedUserId}
            >
              Adicionar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelAdd}
              disabled={isPending}
              className="text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-200"
            >
              Cancelar
            </Button>
          </div>
        </motion.div>
      )}

      {/* Tabela de membros */}
      <motion.div
        variants={itemVariants}
        className="rounded-xl border border-border bg-card/50 overflow-hidden overflow-x-auto"
      >
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="size-10 mb-3 text-muted-foreground/60" />
            <p className="text-sm">Nenhum membro nesta empresa</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground px-4 py-2">Nome</TableHead>
                <TableHead className="text-muted-foreground px-4 py-2">Email</TableHead>
                <TableHead className="text-muted-foreground px-4 py-2">Papel</TableHead>
                <TableHead className="text-muted-foreground px-4 py-2">Status</TableHead>
                <TableHead className="text-muted-foreground text-right px-4 py-2">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow
                  key={member.id}
                  className="border-border/50 hover:bg-accent/30"
                >
                  <TableCell className="text-foreground font-medium px-4 py-2">
                    {member.userName}
                  </TableCell>
                  <TableCell className="text-muted-foreground px-4 py-2">
                    {member.userEmail}
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <CustomSelect
                      value={member.role}
                      onChange={(v) => {
                        if (v !== member.role) {
                          handleRoleChange(member.id, v);
                        }
                      }}
                      triggerClassName="w-36 h-7 text-xs"
                      options={[
                        { value: "company_admin", label: "Admin", description: "Gerencia a empresa" },
                        { value: "manager", label: "Gerente", description: "Gerencia rotas e webhooks" },
                        { value: "viewer", label: "Visualizador", description: "Apenas visualização" },
                      ]}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-2">
                    <Badge
                      className={
                        member.isActive
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-red-500/15 text-red-400 border border-red-500/30"
                      }
                    >
                      {member.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right px-4 py-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeletingMember(member)}
                      disabled={isPending}
                      className="text-muted-foreground hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all duration-200"
                      title="Remover membro"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </motion.div>

      {/* Dialog de confirmação para remover membro */}
      <AlertDialog
        open={!!deletingMember}
        onOpenChange={(open) => { if (!open) setDeletingMember(null); }}
      >
        <AlertDialogContent className="bg-card border border-border rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Remover membro
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tem certeza que deseja remover{" "}
              <strong className="text-foreground">{deletingMember?.userName}</strong>{" "}
              ({deletingMember?.userEmail}) desta empresa?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isPending}
              className="border-border text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-all duration-200"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemoveMember}
              disabled={isPending}
              className="bg-red-600 text-white hover:bg-red-700 cursor-pointer transition-all duration-200"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
