"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
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
import { UserPlus, Trash2, Shield, ShieldCheck, Eye, Briefcase, Users, Loader2, AlertTriangle, Crown, ChevronDown, Check } from "lucide-react";
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
  canEdit?: boolean;
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

function MemberBadgeSelect({
  value,
  onChange,
  options,
  getBadgeStyle,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string; bg: string; icon: React.ComponentType<{ className?: string }> }[];
  getBadgeStyle: (value: string) => { bg: string; icon: React.ComponentType<{ className?: string }> };
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
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
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed" as const,
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 240),
        zIndex: 100,
      });
    }
    setOpen(!open);
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
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
            style={dropdownStyle}
            className="rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
          >
            {options.map((option) => {
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => { onChange(option.value); setOpen(false); }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left cursor-pointer transition-all hover:bg-accent ${value === option.value ? "bg-accent/50" : ""}`}
                >
                  <OptionIcon className={`h-4 w-4 shrink-0 ${option.bg.includes("purple") ? "text-purple-400" : option.bg.includes("blue") ? "text-blue-400" : option.bg.includes("amber") ? "text-amber-400" : "text-muted-foreground"}`} />
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

export function MembersTab({ companyId, canEdit = true }: MembersTabProps) {
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
        {canEdit && !showAddForm && (
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
                {canEdit && (
                  <TableHead className="text-muted-foreground text-right px-4 py-2">
                    Ações
                  </TableHead>
                )}
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
                    {member.isSuperAdmin ? (
                      <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium bg-purple-500/10 text-purple-400 border-purple-500/20">
                        <Crown className="size-3" />
                        Super Admin
                      </span>
                    ) : canEdit ? (
                      <MemberBadgeSelect
                        value={member.role}
                        onChange={(v) => {
                          if (v !== member.role) {
                            handleRoleChange(member.id, v);
                          }
                        }}
                        options={[
                          { value: "company_admin", label: "Admin", description: "Gerencia a empresa", bg: "bg-blue-500/10 border-blue-500/20 text-blue-400", icon: ShieldCheck },
                          { value: "manager", label: "Gerente", description: "Gerencia rotas e webhooks", bg: "bg-amber-500/10 border-amber-500/20 text-amber-400", icon: Shield },
                          { value: "viewer", label: "Visualizador", description: "Apenas visualização", bg: "bg-zinc-800 border-zinc-700 text-zinc-400", icon: Eye },
                        ]}
                        getBadgeStyle={(val) => {
                          switch (val) {
                            case "company_admin": return { bg: "bg-blue-500/10 border-blue-500/20 text-blue-400", icon: ShieldCheck };
                            case "manager": return { bg: "bg-amber-500/10 border-amber-500/20 text-amber-400", icon: Shield };
                            default: return { bg: "bg-zinc-800 border-zinc-700 text-zinc-400", icon: Eye };
                          }
                        }}
                      />
                    ) : (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleLabels[member.role]?.className ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"}`}>
                        {roleLabels[member.role]?.icon}
                        {roleLabels[member.role]?.label ?? member.role}
                      </span>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right px-4 py-2">
                      {!member.isSuperAdmin && (
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
                      )}
                    </TableCell>
                  )}
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
