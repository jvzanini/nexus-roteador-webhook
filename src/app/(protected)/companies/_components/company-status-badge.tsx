import { Badge } from "@/components/ui/badge";

interface CompanyStatusBadgeProps {
  isActive: boolean;
}

export function CompanyStatusBadge({ isActive }: CompanyStatusBadgeProps) {
  return (
    <Badge
      variant={isActive ? "default" : "secondary"}
      className={
        isActive
          ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/30"
          : "bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30 border-zinc-500/30"
      }
    >
      {isActive ? "Ativa" : "Inativa"}
    </Badge>
  );
}
