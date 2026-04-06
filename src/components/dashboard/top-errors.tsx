"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { TopError } from "@/lib/actions/dashboard";

interface TopErrorsProps {
  errors: TopError[];
}

export function TopErrors({ errors }: TopErrorsProps) {
  const router = useRouter();

  return (
    <Card className="bg-card border border-border rounded-xl h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          Erros Mais Frequentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {errors.length === 0 ? (
          <div className="flex items-center justify-center h-[120px] text-sm text-muted-foreground">
            Nenhum erro no período
          </div>
        ) : (
          <div className="space-y-3">
            {errors.map((error, i) => (
              <div
                key={`${error.routeId}-${i}`}
                onClick={() => router.push(`/companies/${error.companyId}/logs?routeId=${error.routeId}`)}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors duration-200 cursor-pointer"
              >
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm text-foreground/80 truncate" title={error.errorMessage}>
                    {error.errorMessage.length > 60
                      ? error.errorMessage.slice(0, 60) + "..."
                      : error.errorMessage}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
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
