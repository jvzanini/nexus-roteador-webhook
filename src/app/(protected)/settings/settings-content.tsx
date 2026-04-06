"use client";

import { useState, useEffect, useTransition } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CustomSelect } from "@/components/ui/custom-select";
import { RotateCcw, Archive, Bell, Save, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";
import {
  getAllSettings,
  updateSettings,
} from "@/lib/actions/settings";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
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

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-64 animate-pulse rounded-xl bg-zinc-800/50 border border-zinc-800"
        />
      ))}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
      {children}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-zinc-500 mt-1">{children}</p>;
}

export function SettingsContent() {
  const [loading, setLoading] = useState(true);

  // Retry section state
  const [retryMaxRetries, setRetryMaxRetries] = useState(3);
  const [retryIntervals, setRetryIntervals] = useState("10, 30, 90");
  const [retryStrategy, setRetryStrategy] = useState<"exponential" | "fixed">(
    "exponential"
  );
  const [retryJitter, setRetryJitter] = useState(true);
  const [savingRetry, startSavingRetry] = useTransition();

  // Logs section state
  const [logFullRetention, setLogFullRetention] = useState(30);
  const [logSummaryRetention, setLogSummaryRetention] = useState(90);
  const [savingLogs, startSavingLogs] = useTransition();

  // Notifications section state
  const [notifyPlatform, setNotifyPlatform] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [notifyThreshold, setNotifyThreshold] = useState(5);
  const [notifyRecipients, setNotifyRecipients] = useState("");
  const [savingNotify, startSavingNotify] = useTransition();

  useEffect(() => {
    async function load() {
      const result = await getAllSettings();
      if (result.success && result.data) {
        const d = result.data;
        setRetryMaxRetries(d.retry_max_retries);
        setRetryIntervals(d.retry_intervals_seconds.join(", "));
        setRetryStrategy(d.retry_strategy);
        setRetryJitter(d.retry_jitter_enabled);
        setLogFullRetention(d.log_full_retention_days);
        setLogSummaryRetention(d.log_summary_retention_days);
        setNotifyPlatform(d.notify_platform_enabled);
        setNotifyEmail(d.notify_email_enabled);
        setNotifyWhatsapp(d.notify_whatsapp_enabled);
        setNotifyThreshold(d.notify_failure_threshold);
        setNotifyRecipients(d.notify_recipients);
      } else {
        toast.error("Erro ao carregar configuracoes");
      }
      setLoading(false);
    }
    load();
  }, []);

  function handleSaveRetry() {
    startSavingRetry(async () => {
      const intervals = retryIntervals
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);

      if (intervals.length === 0) {
        toast.error("Informe pelo menos um intervalo valido");
        return;
      }

      const result = await updateSettings({
        retry_max_retries: retryMaxRetries,
        retry_intervals_seconds: intervals,
        retry_strategy: retryStrategy,
        retry_jitter_enabled: retryJitter,
      });

      if (result.success) {
        toast.success("Configuracoes de retry salvas");
      } else {
        toast.error(result.error || "Erro ao salvar");
      }
    });
  }

  function handleSaveLogs() {
    startSavingLogs(async () => {
      const result = await updateSettings({
        log_full_retention_days: logFullRetention,
        log_summary_retention_days: logSummaryRetention,
      });

      if (result.success) {
        toast.success("Configuracoes de retencao salvas");
      } else {
        toast.error(result.error || "Erro ao salvar");
      }
    });
  }

  function handleSaveNotify() {
    startSavingNotify(async () => {
      const result = await updateSettings({
        notify_platform_enabled: notifyPlatform,
        notify_email_enabled: notifyEmail,
        notify_whatsapp_enabled: notifyWhatsapp,
        notify_failure_threshold: notifyThreshold,
        notify_recipients: notifyRecipients,
      });

      if (result.success) {
        toast.success("Configuracoes de notificacoes salvas");
      } else {
        toast.error(result.error || "Erro ao salvar");
      }
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600/10 border border-violet-600/20">
            <Settings className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Configuracoes
            </h1>
            <p className="text-sm text-zinc-500">
              Configuracoes globais da plataforma
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <SettingsSkeleton />
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Retry Section */}
          <motion.div variants={itemVariants}>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-zinc-100">
                  <RotateCcw className="h-4 w-4 text-violet-500" />
                  Retentativas de Webhook
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <FieldLabel>Maximo de tentativas</FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={retryMaxRetries}
                      onChange={(e) =>
                        setRetryMaxRetries(
                          Math.min(10, Math.max(0, parseInt(e.target.value) || 0))
                        )
                      }
                      className="bg-zinc-800/50 border-zinc-700 text-zinc-200"
                    />
                    <FieldHint>Numero maximo de vezes que o sistema tentara reenviar um webhook que falhou (0-10)</FieldHint>
                  </div>

                  <div>
                    <FieldLabel>Intervalos (segundos)</FieldLabel>
                    <Input
                      type="text"
                      value={retryIntervals}
                      onChange={(e) => setRetryIntervals(e.target.value)}
                      placeholder="10, 30, 90"
                      className="bg-zinc-800/50 border-zinc-700 text-zinc-200"
                    />
                    <FieldHint>Tempo entre cada tentativa, separados por virgula (ex: 10, 30, 90 = aguarda 10s, 30s e 90s)</FieldHint>
                  </div>

                  <div>
                    <FieldLabel>Estrategia</FieldLabel>
                    <CustomSelect
                      value={retryStrategy}
                      onChange={(val) => setRetryStrategy(val as "exponential" | "fixed")}
                      options={[
                        { value: "exponential", label: "Exponencial", description: "Backoff exponencial entre tentativas" },
                        { value: "fixed", label: "Fixo", description: "Intervalo fixo entre tentativas" },
                      ]}
                    />
                    <FieldHint>
                      {retryStrategy === "exponential"
                        ? "Multiplica os intervalos progressivamente (ex: 10s → 20s → 40s). Ignora os intervalos fixos definidos acima"
                        : "Usa exatamente os intervalos definidos acima na ordem (10s, 30s, 90s)"}
                    </FieldHint>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <FieldLabel>Jitter</FieldLabel>
                      <FieldHint>
                        Adiciona variacao aleatoria ao intervalo para evitar que multiplas rotas reenviem ao mesmo tempo
                      </FieldHint>
                    </div>
                    <Switch
                      checked={retryJitter}
                      onCheckedChange={setRetryJitter}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSaveRetry}
                    disabled={savingRetry}
                    className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
                  >
                    {savingRetry ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Logs Retention Section */}
          <motion.div variants={itemVariants}>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-zinc-100">
                  <Archive className="h-4 w-4 text-violet-500" />
                  Retencao de Logs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <FieldLabel>Retencao completa (dias)</FieldLabel>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={logFullRetention}
                      onChange={(e) =>
                        setLogFullRetention(
                          Math.min(
                            365,
                            Math.max(1, parseInt(e.target.value) || 1)
                          )
                        )
                      }
                      className="bg-zinc-800/50 border-zinc-700 text-zinc-200"
                    />
                    <FieldHint>
                      Logs completos com payload, headers e resposta (1-365 dias)
                    </FieldHint>
                  </div>

                  <div>
                    <FieldLabel>Retencao resumida (dias)</FieldLabel>
                    <Input
                      type="number"
                      min={1}
                      max={730}
                      value={logSummaryRetention}
                      onChange={(e) =>
                        setLogSummaryRetention(
                          Math.min(
                            730,
                            Math.max(1, parseInt(e.target.value) || 1)
                          )
                        )
                      }
                      className="bg-zinc-800/50 border-zinc-700 text-zinc-200"
                    />
                    <FieldHint>
                      Resumos sem payload — apenas metadados como status, duracao e erro (1-730 dias)
                    </FieldHint>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSaveLogs}
                    disabled={savingLogs}
                    className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
                  >
                    {savingLogs ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Notifications Section */}
          <motion.div variants={itemVariants}>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-zinc-100">
                  <Bell className="h-4 w-4 text-violet-500" />
                  Notificacoes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-300">
                        Notificacoes na plataforma
                      </p>
                      <p className="text-xs text-zinc-500">
                        Alertas dentro do painel
                      </p>
                    </div>
                    <Switch
                      checked={notifyPlatform}
                      onCheckedChange={setNotifyPlatform}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-300">
                        Notificacoes por e-mail
                      </p>
                      <p className="text-xs text-zinc-500">
                        Enviar alertas por e-mail
                      </p>
                    </div>
                    <Switch
                      checked={notifyEmail}
                      onCheckedChange={(val) => {
                        if (!val && !notifyWhatsapp) return;
                        setNotifyEmail(val);
                      }}
                      disabled={notifyEmail && !notifyWhatsapp}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-300">
                        Notificacoes por WhatsApp
                      </p>
                      <p className="text-xs text-zinc-500">
                        Enviar alertas via WhatsApp
                      </p>
                    </div>
                    <Switch
                      checked={notifyWhatsapp}
                      onCheckedChange={(val) => {
                        if (!val && !notifyEmail) return;
                        setNotifyWhatsapp(val);
                      }}
                      disabled={notifyWhatsapp && !notifyEmail}
                    />
                  </div>

                  <p className="text-xs text-zinc-500 italic">
                    E obrigatorio manter pelo menos um canal de notificacao ativo (e-mail ou WhatsApp)
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                  <div>
                    <FieldLabel>Threshold de falha</FieldLabel>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={notifyThreshold}
                      onChange={(e) =>
                        setNotifyThreshold(
                          Math.min(
                            100,
                            Math.max(1, parseInt(e.target.value) || 1)
                          )
                        )
                      }
                      className="bg-zinc-800/50 border-zinc-700 text-zinc-200"
                    />
                    <FieldHint>
                      Quantidade de falhas consecutivas de uma mesma rota para disparar alerta de notificacao
                    </FieldHint>
                  </div>

                  <div>
                    <FieldLabel>Destinatarios</FieldLabel>
                    <Input
                      type="text"
                      value={notifyRecipients}
                      onChange={(e) => setNotifyRecipients(e.target.value)}
                      placeholder="email@exemplo.com, +5511999999999"
                      className="bg-zinc-800/50 border-zinc-700 text-zinc-200"
                    />
                    <FieldHint>
                      E-mails ou numeros de WhatsApp que receberao alertas (separados por virgula)
                    </FieldHint>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSaveNotify}
                    disabled={savingNotify}
                    className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
                  >
                    {savingNotify ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
