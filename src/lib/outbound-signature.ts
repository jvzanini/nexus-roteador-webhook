import { createHmac, timingSafeEqual } from "crypto";

/**
 * Calcula HMAC-SHA256 do body serializado usando a secret_key da rota.
 * Retorna no formato "sha256=<hex>" compatível com X-Nexus-Signature-256.
 */
export function computeOutboundSignature(body: string, secretKey: string): string {
  const hmac = createHmac("sha256", secretKey);
  hmac.update(body, "utf8");
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * Verifica assinatura outbound usando timing-safe comparison.
 * Previne timing attacks na verificação.
 */
export function verifyOutboundSignature(
  body: string,
  secretKey: string,
  signature: string
): boolean {
  const expected = computeOutboundSignature(body, secretKey);

  if (expected.length !== signature.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}
