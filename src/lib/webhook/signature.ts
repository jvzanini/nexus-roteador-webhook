import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifica a assinatura X-Hub-Signature-256 enviada pela Meta.
 *
 * IMPORTANTE: `rawBody` deve ser o corpo bruto original (string/buffer),
 * NAO o payload reserializado via JSON.stringify(). A Meta calcula o HMAC
 * sobre o byte stream exato que enviou.
 *
 * @param rawBody - Corpo bruto da requisicao (string)
 * @param signatureHeader - Valor do header X-Hub-Signature-256 (ex: "sha256=abc123...")
 * @param appSecret - App Secret descriptografado da empresa
 * @returns true se a assinatura eh valida
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string,
  appSecret: string
): boolean {
  if (!signatureHeader || !rawBody || !appSecret) {
    return false;
  }

  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const receivedHex = signatureHeader.slice("sha256=".length);

  const hmac = createHmac("sha256", appSecret);
  hmac.update(rawBody, "utf8");
  const expectedHex = hmac.digest("hex");

  // Garantir que ambos tem o mesmo comprimento antes de comparar
  if (receivedHex.length !== expectedHex.length) {
    return false;
  }

  try {
    const receivedBuf = Buffer.from(receivedHex, "hex");
    const expectedBuf = Buffer.from(expectedHex, "hex");

    return timingSafeEqual(receivedBuf, expectedBuf);
  } catch {
    return false;
  }
}
