import { validateDestinationUrl } from "@nexusai360/webhook-routing";

/**
 * Erro de validacao SSRF.
 * Lancado quando uma URL de destino falha na validacao de seguranca.
 *
 * Shim: delega para `validateDestinationUrl` do pacote @nexusai360/webhook-routing.
 */
export class SsrfError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "SsrfError";
  }
}

/**
 * Valida se uma URL eh segura para receber webhooks (protecao SSRF).
 *
 * @param url - URL a ser validada
 * @throws {SsrfError} se a URL falhar na validacao
 */
export function validateUrl(url: string): void {
  const res = validateDestinationUrl(url);
  if (!res.ok) throw new SsrfError(res.reason ?? "ssrf_blocked");
}
