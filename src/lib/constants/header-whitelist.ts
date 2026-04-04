/**
 * Headers bloqueados para customizacao em rotas de webhook.
 * Esses headers sao controlados pelo sistema ou apresentam riscos de seguranca.
 */
export const BLOCKED_HEADERS = [
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
  "te",
  "trailer",
  "cookie",
  "set-cookie",
  "authorization", // o sistema usa secret_key para auth
] as const;

export type BlockedHeader = (typeof BLOCKED_HEADERS)[number];

/**
 * Verifica se um header eh permitido para customizacao.
 * Comparacao case-insensitive.
 */
export function isHeaderAllowed(headerName: string): boolean {
  return !BLOCKED_HEADERS.includes(
    headerName.toLowerCase().trim() as BlockedHeader
  );
}

/**
 * Valida um array de headers customizados.
 * Retorna os headers invalidos encontrados.
 */
export function getBlockedHeaders(
  headers: Array<{ key: string; value: string }>
): string[] {
  return headers
    .map((h) => h.key)
    .filter((key) => !isHeaderAllowed(key));
}
