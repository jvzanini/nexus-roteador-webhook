"use client";

import { useEffect, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Clock, AlertCircle, Loader2 } from "lucide-react";
import { LogStatusBadge } from "./log-status-badge";
import { getWebhookLogDetail } from "@/lib/actions/logs";
import type { LogDetailEntry } from "@/lib/actions/logs";

interface LogRowDetailProps {
  companyId: string;
  inboundWebhookId: string;
}

export function LogRowDetail({
  companyId,
  inboundWebhookId,
}: LogRowDetailProps) {
  const [detail, setDetail] = useState<LogDetailEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [payloadOpen, setPayloadOpen] = useState(false);

  useEffect(() => {
    getWebhookLogDetail(companyId, inboundWebhookId)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [companyId, inboundWebhookId]);

  if (loading) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando detalhes...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Detalhes não encontrados.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 bg-card/50 border-t border-border">
      {/* Payload colapsavel */}
      <Collapsible open={payloadOpen} onOpenChange={setPayloadOpen}>
        <CollapsibleTrigger
          render={<Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-200" />}
        >
          {payloadOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Payload
          {!detail.rawBody && !detail.rawPayload && (
            <Badge variant="secondary" className="ml-2 text-xs bg-muted text-muted-foreground border-border">
              Removido (LGPD)
            </Badge>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ScrollArea className="max-h-64 mt-2">
            {detail.rawPayload ? (
              <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto text-foreground/80 font-mono border border-border/50">
                {JSON.stringify(detail.rawPayload, null, 2)}
              </pre>
            ) : detail.rawBody ? (
              <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto text-foreground/80 font-mono border border-border/50">
                {detail.rawBody}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground p-3">
                Payload removido pela politica de retencao de dados.
              </p>
            )}
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>

      {/* Entregas e tentativas */}
      {detail.deliveries.map((delivery) => (
        <div key={delivery.id} className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="font-medium text-sm text-foreground">{delivery.routeName}</span>
            <LogStatusBadge status={delivery.status} />
            <span className="text-xs text-muted-foreground font-mono">
              {delivery.routeUrl}
            </span>
            {delivery.finalHttpStatus && (
              <Badge variant="outline" className="text-xs border-border text-foreground/80">
                HTTP {delivery.finalHttpStatus}
              </Badge>
            )}
          </div>

          {/* Tentativas */}
          <div className="ml-4 space-y-1">
            {delivery.attempts.map((attempt) => (
              <div
                key={attempt.id}
                className="flex items-center gap-3 text-xs py-1 border-l-2 border-border pl-3"
              >
                <span className="text-muted-foreground font-mono">
                  #{attempt.attemptNumber}
                </span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{attempt.durationMs}ms</span>
                </div>
                {attempt.httpStatus && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      attempt.httpStatus >= 200 && attempt.httpStatus < 300
                        ? "text-emerald-400 border-emerald-500/30"
                        : "text-red-400 border-red-500/30"
                    }`}
                  >
                    {attempt.httpStatus}
                  </Badge>
                )}
                {attempt.errorMessage && (
                  <div className="flex items-center gap-1 text-red-400">
                    <AlertCircle className="h-3 w-3" />
                    <span className="truncate max-w-xs">
                      {attempt.errorMessage}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Response body da ultima tentativa */}
          {delivery.attempts.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger
                render={<Button variant="ghost" size="sm" className="ml-4 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-200" />}
              >
                <ChevronRight className="h-3 w-3 mr-1" />
                Response body
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="max-h-32 ml-4 mt-1">
                  <pre className="text-xs bg-muted/50 rounded-lg p-2 overflow-x-auto text-foreground/80 font-mono border border-border/50">
                    {delivery.attempts[delivery.attempts.length - 1]
                      ?.responseBody || "(vazio)"}
                  </pre>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      ))}
    </div>
  );
}
