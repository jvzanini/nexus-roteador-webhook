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
          ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs"
          : "bg-zinc-500/15 text-zinc-400 hover:bg-zinc-500/20 border border-zinc-500/30 text-xs"
      }
    >
      {isActive ? "Ativa" : "Inativa"}
    </Badge>
  );
}
