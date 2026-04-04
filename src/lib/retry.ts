/**
 * Lógica de retry para entrega de webhooks.
 *
 * Status retriable: 408, 409, 425, 429, 500, 502, 503, 504, timeout/network error
 * Status não-retriable: todos os outros 4xx, redirects (301/302/307/308)
 *
 * retry_max_retries = além da tentativa inicial (3 retries + 1 inicial = 4 total)
 * Backoff exponencial com jitter ±20%
 */

export const RETRIABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  409, // Conflict
  425, // Too Early
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

export const NON_RETRIABLE_REDIRECT_CODES = new Set([
  301, // Moved Permanently
  302, // Found
  307, // Temporary Redirect
  308, // Permanent Redirect
]);

const RETRIABLE_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

export interface RetryConfig {
  maxRetries: number;
  intervalsSeconds: number[];
  strategy: "exponential" | "fixed";
  jitterEnabled: boolean;
}

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
}

/**
 * Verifica se um HTTP status code é retriable.
 * Retorna false para null (sem resposta HTTP — verificar via isRetriableError).
 */
export function isRetriableStatus(status: number | null): boolean {
  if (status === null) return false;
  return RETRIABLE_STATUS_CODES.has(status);
}

/**
 * Verifica se um erro de rede/timeout é retriable.
 */
export function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as any).code;
  if (typeof code === "string" && RETRIABLE_ERROR_CODES.has(code)) {
    return true;
  }
  return false;
}

/**
 * Aplica jitter de ±20% a um valor em milissegundos.
 * Retorna inteiro.
 */
export function applyJitter(baseMs: number): number {
  if (baseMs === 0) return 0;
  // Fator entre 0.8 e 1.2
  const factor = 0.8 + Math.random() * 0.4;
  return Math.round(baseMs * factor);
}

/**
 * Calcula delay de backoff em milissegundos para um dado attempt.
 *
 * @param retryNumber - Número do retry (1-based, onde 1 = primeiro retry após tentativa inicial)
 * @param config - Configuração de retry
 */
export function calculateBackoffMs(retryNumber: number, config: RetryConfig): number {
  let intervalSeconds: number;

  if (config.strategy === "fixed") {
    // Fixed: sempre usa o primeiro intervalo
    intervalSeconds = config.intervalsSeconds[0] ?? 10;
  } else {
    // Exponential: usa intervalo do array, com fallback para o último
    const index = Math.min(retryNumber - 1, config.intervalsSeconds.length - 1);
    intervalSeconds = config.intervalsSeconds[index] ?? 10;
  }

  const baseMs = intervalSeconds * 1000;

  if (config.jitterEnabled) {
    return applyJitter(baseMs);
  }

  return baseMs;
}

/**
 * Determina se deve fazer retry e qual o delay.
 *
 * @param currentAttempt - Número do retry atual (1-based). Tentativa inicial = 0, primeiro retry = 1.
 * @param config - Configuração de retry
 * @returns RetryDecision se deve retry, null se esgotou retries
 */
export function getNextRetryDelay(
  currentAttempt: number,
  config: RetryConfig
): RetryDecision | null {
  if (currentAttempt > config.maxRetries) {
    return null;
  }

  const delayMs = calculateBackoffMs(currentAttempt, config);

  return {
    shouldRetry: true,
    delayMs,
  };
}
