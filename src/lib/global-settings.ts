import { prisma } from "./prisma";
import type { RetryConfig } from "./retry";

/**
 * Defaults de GlobalSettings.
 * Usados quando a chave não existe no banco.
 */
const DEFAULTS: Record<string, unknown> = {
  retry_max_retries: 3,
  retry_intervals_seconds: [10, 30, 90],
  retry_strategy: "exponential",
  retry_jitter_enabled: true,
  log_full_retention_days: 90,
  log_summary_retention_days: 180,
  notify_platform_enabled: true,
  notify_email_enabled: true,
  notify_whatsapp_enabled: true,
  notify_failure_threshold: 5,
  notify_recipients: "admins",
};

/**
 * Busca um valor de GlobalSettings pelo key.
 * Retorna o default se a chave não existir no banco.
 */
export async function getGlobalSetting<T = unknown>(key: string): Promise<T> {
  const setting = await prisma.globalSettings.findUnique({
    where: { key },
  });

  if (setting) {
    return setting.value as T;
  }

  if (key in DEFAULTS) {
    return DEFAULTS[key] as T;
  }

  throw new Error(`GlobalSettings key "${key}" not found and no default defined`);
}

/**
 * Busca a configuração completa de retry.
 * Combina valores do banco com defaults.
 */
export async function getRetryConfig(): Promise<RetryConfig> {
  const [maxRetries, intervalsSeconds, strategy, jitterEnabled] = await Promise.all([
    getGlobalSetting<number>("retry_max_retries"),
    getGlobalSetting<number[]>("retry_intervals_seconds"),
    getGlobalSetting<"exponential" | "fixed">("retry_strategy"),
    getGlobalSetting<boolean>("retry_jitter_enabled"),
  ]);

  return {
    maxRetries,
    intervalsSeconds,
    strategy,
    jitterEnabled,
  };
}
