"use client";

import { useState, useCallback, useTransition } from "react";
import { motion } from "framer-motion";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
// import { IconPicker } from "@/components/icon-picker/icon-picker"; // Arquivado temporariamente
import { EventChecklist } from "@/components/event-checklist/event-checklist";
import {
  RouteHeaderFields,
  type HeaderEntry,
} from "@/components/routes/route-header-fields";
import {
  createWebhookRoute,
  updateWebhookRoute,
} from "@/lib/actions/webhook-routes";
import { toast } from "sonner";

interface RouteData {
  id: string;
  name: string;
  icon: string;
  url: string;
  events: string[];
  headers: HeaderEntry[] | null;
  timeoutMs: number;
}

interface RouteFormDialogProps {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  route?: RouteData | null;
  onSuccess?: () => void;
}

export function RouteFormDialog({
  companyId,
  open,
  onOpenChange,
  route,
  onSuccess,
}: RouteFormDialogProps) {
  const isEditing = !!route;
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(route?.name ?? "");
  const [icon, setIcon] = useState(route?.icon ?? "Webhook");
  const [url, setUrl] = useState(route?.url ?? "");
  const [secretKey, setSecretKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [events, setEvents] = useState<string[]>(
    (route?.events as string[]) ?? []
  );
  const [headers, setHeaders] = useState<HeaderEntry[]>(
    (route?.headers as HeaderEntry[]) ?? []
  );
  const [timeoutMs, setTimeoutMs] = useState(route?.timeoutMs ?? 30000);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const resetForm = useCallback(() => {
    setName(route?.name ?? "");
    setIcon(route?.icon ?? "Webhook");
    setUrl(route?.url ?? "");
    setSecretKey("");
    setShowSecretKey(false);
    setEvents((route?.events as string[]) ?? []);
    setHeaders((route?.headers as HeaderEntry[]) ?? []);
    setTimeoutMs(route?.timeoutMs ?? 30000);
    setFieldErrors({});
  }, [route]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFieldErrors({});

      const input = {
        name,
        icon,
        url,
        secretKey: secretKey || undefined,
        events,
        headers: headers.length > 0 ? headers : null,
        timeoutMs,
      };

      startTransition(async () => {
        const result = isEditing
          ? await updateWebhookRoute(route!.id, companyId, input)
          : await createWebhookRoute(companyId, input);

        if (result.success) {
          toast.success(
            isEditing ? "Rota atualizada com sucesso" : "Rota criada com sucesso"
          );
          onOpenChange(false);
          resetForm();
          onSuccess?.();
        } else {
          if (result.fieldErrors) {
            setFieldErrors(result.fieldErrors);
            // Scroll para eventos se o erro for apenas nessa secao
            if (result.fieldErrors.events) {
              setTimeout(() => {
                const eventsSection = document.getElementById("events-section");
                eventsSection?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 100);
            }
          }
          toast.error(result.error ?? "Erro ao salvar rota");
        }
      });
    },
    [
      name,
      icon,
      url,
      secretKey,
      events,
      headers,
      timeoutMs,
      isEditing,
      route,
      companyId,
      onOpenChange,
      resetForm,
      onSuccess,
    ]
  );

  const inputClasses = "bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all duration-200";

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) resetForm();
        onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] bg-card border border-border rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isEditing ? "Editar Rota" : "Nova Rota de Webhook"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <ScrollArea className="h-[60vh] px-5 pr-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 pb-4"
            >
              {/* Nome */}
              <div className="space-y-2">
                <Label htmlFor="route-name" className="text-foreground/80">Nome *</Label>
                <Input
                  id="route-name"
                  placeholder="Ex: N8N Producao, Chatwoot, etc."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isPending}
                  maxLength={100}
                  className={inputClasses}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-red-400">
                    {fieldErrors.name[0]}
                  </p>
                )}
              </div>

              {/* Icone arquivado — funcionalidade desativada temporariamente
              <div className="space-y-2">
                <Label className="text-foreground/80">Icone</Label>
                <IconPicker
                  value={icon}
                  onChange={setIcon}
                  disabled={isPending}
                />
              </div>
              */}

              {/* URL */}
              <div className="space-y-2">
                <Label htmlFor="route-url" className="text-foreground/80">URL do Webhook *</Label>
                <Input
                  id="route-url"
                  placeholder="https://api.exemplo.com/webhook"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isPending}
                  type="url"
                  className={inputClasses}
                />
                <p className="text-xs text-muted-foreground">
                  Somente URLs com HTTPS são aceitas
                </p>
                {fieldErrors.url && (
                  <p className="text-xs text-red-400">
                    {fieldErrors.url[0]}
                  </p>
                )}
              </div>

              {/* Secret Key */}
              <div className="space-y-2">
                <Label htmlFor="route-secret" className="text-foreground/80">Secret Key (opcional)</Label>
                <div className="relative">
                  <Input
                    id="route-secret"
                    placeholder={
                      isEditing
                        ? "Deixe vazio para manter a atual"
                        : "Chave secreta para assinatura HMAC"
                    }
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    disabled={isPending}
                    type={showSecretKey ? "text" : "password"}
                    className={`pr-10 ${inputClasses}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer transition-colors duration-200"
                  >
                    {showSecretKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Será criptografada com AES-256-GCM antes de salvar
                </p>
              </div>

              {/* Timeout */}
              <div className="space-y-2">
                <Label htmlFor="route-timeout" className="text-foreground/80">Timeout (ms)</Label>
                <Input
                  id="route-timeout"
                  type="number"
                  min={1000}
                  max={60000}
                  step={1000}
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(Number(e.target.value))}
                  disabled={isPending}
                  className={inputClasses}
                />
                <p className="text-xs text-muted-foreground">
                  Entre 1.000ms e 60.000ms. Padrao: 30.000ms
                </p>
                {fieldErrors.timeoutMs && (
                  <p className="text-xs text-red-400">
                    {fieldErrors.timeoutMs[0]}
                  </p>
                )}
              </div>

              {/* Headers customizados */}
              <RouteHeaderFields
                headers={headers}
                onChange={setHeaders}
                disabled={isPending}
              />

              {/* Eventos */}
              <div id="events-section" className="space-y-2">
                <Label className="text-foreground/80">Eventos WhatsApp *</Label>
                <EventChecklist
                  selectedEvents={events}
                  onChange={setEvents}
                  disabled={isPending}
                />
                {fieldErrors.events && (
                  <p className="text-xs text-red-400">
                    {fieldErrors.events[0]}
                  </p>
                )}
              </div>
            </motion.div>
          </ScrollArea>

          <DialogFooter className="pt-4 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-200"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar alteracoes" : "Criar rota"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
