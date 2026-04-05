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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Trash2, Shield, Eye, Briefcase, Users, X } from "lucide-react";
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
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
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
      toast.error("Selecione um usuario");
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

  function handleRemoveMember(membershipId: string, userName: string) {
    if (!window.confirm(`Remover ${userName} desta empresa?`)) return;

    startTransition(async () => {
      const result = await removeMembership(membershipId);

      if (result.success) {
        toast.success("Membro removido");
        await fetchMembers();
      } else {
        toast.error(result.error || "Erro ao remover membro");
      }
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-zinc-800/50 rounded-lg animate-pulse" />
        <div className="h-64 bg-zinc-800/50 rounded-xl animate-pulse" />
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
          <Users className="size-5 text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-300">
            {members.length} {members.length === 1 ? "membro" : "membros"}
          </h3>
        </div>
        {!showAddForm && (
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700/50 hover:text-zinc-100"
            onClick={handleOpenAddForm}
            disabled={isPending}
          >
            <UserPlus className="size-4 mr-1" />
            Adicionar Membro
          </Button>
        )}
      </motion.div>

      {/* Formulario de adicionar membro */}
      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
        >
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">
                Usuario
              </label>
              <Select
                value={selectedUserId}
                onValueChange={(v) => setSelectedUserId(v ?? "")}
              >
                <SelectTrigger className="w-full bg-zinc-800/50 border-zinc-700 text-zinc-200">
                  <SelectValue placeholder="Selecione um usuario" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      Nenhum usuario disponivel
                    </SelectItem>
                  ) : (
                    availableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="w-44 space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Papel</label>
              <Select
                value={selectedRole}
                onValueChange={(v) => setSelectedRole(v ?? "viewer")}
              >
                <SelectTrigger className="w-full bg-zinc-800/50 border-zinc-700 text-zinc-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_admin">Admin</SelectItem>
                  <SelectItem value="manager">Gerente</SelectItem>
                  <SelectItem value="viewer">Visualizador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleAddMember}
              disabled={isPending || !selectedUserId}
            >
              Adicionar
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCancelAdd}
              disabled={isPending}
            >
              <X className="size-4 text-zinc-400" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Tabela de membros */}
      <motion.div
        variants={itemVariants}
        className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
      >
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <Users className="size-10 mb-3 text-zinc-600" />
            <p className="text-sm">Nenhum membro nesta empresa</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Nome</TableHead>
                <TableHead className="text-zinc-400">Email</TableHead>
                <TableHead className="text-zinc-400">Papel</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400 text-right">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow
                  key={member.id}
                  className="border-zinc-800/50 hover:bg-zinc-800/30"
                >
                  <TableCell className="text-zinc-200 font-medium">
                    {member.userName}
                  </TableCell>
                  <TableCell className="text-zinc-400">
                    {member.userEmail}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={member.role}
                      onValueChange={(v) => {
                        if (v && v !== member.role) {
                          handleRoleChange(member.id, v);
                        }
                      }}
                    >
                      <SelectTrigger className="w-36 h-7 bg-transparent border-zinc-700/50 text-zinc-300 text-xs">
                        <SelectValue>
                          <span className="flex items-center gap-1.5">
                            {roleLabels[member.role]?.icon}
                            {roleLabels[member.role]?.label || member.role}
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company_admin">
                          <Shield className="size-3 mr-1 inline" /> Admin
                        </SelectItem>
                        <SelectItem value="manager">
                          <Briefcase className="size-3 mr-1 inline" /> Gerente
                        </SelectItem>
                        <SelectItem value="viewer">
                          <Eye className="size-3 mr-1 inline" /> Visualizador
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
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
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        handleRemoveMember(member.id, member.userName)
                      }
                      disabled={isPending}
                      className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
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
    </motion.div>
  );
}
