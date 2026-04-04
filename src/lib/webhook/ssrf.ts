import { URL } from "url";
import { isIP } from "net";

/**
 * Erro de validacao SSRF.
 * Lancado quando uma URL de destino falha na validacao de seguranca.
 */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/**
 * Ranges de IPs privados/reservados que devem ser bloqueados.
 * Referencia: RFC 1918, RFC 6890, RFC 3927
 */
const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost."]);

/**
 * Verifica se um endereco IPv4 esta em um range privado/reservado.
 */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;

  // 0.0.0.0/8 -- current network
  if (a === 0) return true;

  // 10.0.0.0/8 -- private class A
  if (a === 10) return true;

  // 127.0.0.0/8 -- loopback
  if (a === 127) return true;

  // 169.254.0.0/16 -- link-local (inclui cloud metadata endpoint 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 -- private class B (172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 -- private class C
  if (a === 192 && b === 168) return true;

  return false;
}

/**
 * Verifica se um endereco IPv6 eh loopback ou link-local.
 */
function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");

  // ::1 -- loopback
  if (normalized === "::1") return true;

  // fe80::/10 -- link-local
  if (normalized.startsWith("fe80:")) return true;

  // fc00::/7 -- unique local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  return false;
}

/**
 * Valida se uma URL eh segura para receber webhooks (protecao SSRF).
 *
 * Regras:
 * 1. Apenas HTTPS permitido
 * 2. Hostname nao pode ser IP privado/reservado
 * 3. Hostname nao pode ser localhost
 * 4. URL deve ser bem formada
 *
 * @param url - URL a ser validada
 * @throws {SsrfError} se a URL falhar na validacao
 */
export function validateUrl(url: string): void {
  if (!url || typeof url !== "string") {
    throw new SsrfError("URL vazia ou invalida");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfError(`URL mal formada: ${url}`);
  }

  // Apenas HTTPS
  if (parsed.protocol !== "https:") {
    throw new SsrfError(`Apenas HTTPS eh permitido. Protocolo recebido: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;

  if (!hostname) {
    throw new SsrfError("URL sem hostname");
  }

  // Bloquear hostnames conhecidos
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new SsrfError(`Hostname bloqueado: ${hostname}`);
  }

  // Verificar se eh IP direto
  const cleanHostname = hostname.replace(/^\[|\]$/g, "");
  const ipVersion = isIP(cleanHostname);

  if (ipVersion === 4) {
    if (isPrivateIpv4(cleanHostname)) {
      throw new SsrfError(`IP privado/reservado bloqueado: ${cleanHostname}`);
    }
  } else if (ipVersion === 6) {
    if (isPrivateIpv6(cleanHostname)) {
      throw new SsrfError(`IP IPv6 privado/reservado bloqueado: ${cleanHostname}`);
    }
  }

  // Se eh hostname (nao IP), poderia fazer DNS lookup para verificar
  // se resolve para IP privado, mas isso adiciona latencia e complexidade.
  // Por ora, bloqueamos IPs diretos e hostnames conhecidos.
  // DNS rebinding pode ser mitigado no futuro com DNS pinning.
}
