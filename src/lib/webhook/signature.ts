import { verifyHmacSignature } from "@nexusai360/webhook-routing";

/**
 * Verifica a assinatura X-Hub-Signature-256 enviada pela Meta.
 *
 * Wrapper sobre `verifyHmacSignature` do @nexusai360/webhook-routing, preservando
 * a assinatura legada do Roteador (rawBody, signatureHeader, appSecret).
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
  appSecret: string,
): boolean {
  if (!signatureHeader || !rawBody || !appSecret) {
    return false;
  }
  // Mantem comportamento legado: header DEVE comecar com "sha256=".
  // O pacote aceita hex puro, mas o Roteador exige o prefixo.
  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }
  return verifyHmacSignature({
    rawBody,
    signatureHeader,
    secret: appSecret,
    algo: "sha256",
  });
}
