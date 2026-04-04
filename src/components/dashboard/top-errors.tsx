"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TopError } from "@/actions/dashboard";

interface TopErrorsProps {
  errors: TopError[];
}

export function TopErrors({ errors }: TopErrorsProps) {
  const router = useRouter();

  return (
    <Card className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          Erros Mais Frequentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {errors.length === 0 ? (
          <div className="flex items-center justify-center h-[120px] text-sm text-zinc-500">
            Nenhum erro no período
          </div>
        ) : (
          <div className="space-y-3">
            {errors.map((error, i) => (
              <div
                key={`${error.routeId}-${i}`}
                onClick={() => router.push(`/companies/${error.companyId}/logs?routeId=${error.routeId}`)}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors duration-200 cursor-pointer"
              >
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm text-zinc-300 truncate" title={error.errorMessage}>
                    {error.errorMessage.length > 60
                      ? error.errorMessage.slice(0, 60) + "..."
                      : error.errorMessage}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {error.routeName} &middot; {error.companyName} &middot;{" "}
                    {formatDistanceToNow(new Date(error.lastOccurrence), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs border-red-500/30 text-red-400 bg-red-500/10 shrink-0">
                  {error.count}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
