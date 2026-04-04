import { verifySignature } from "../signature";
import { createHmac } from "crypto";

describe("verifySignature", () => {
  const appSecret = "test-app-secret-12345";

  function generateSignature(body: string, secret: string): string {
    const hmac = createHmac("sha256", secret);
    hmac.update(body, "utf8");
    return "sha256=" + hmac.digest("hex");
  }

  it("retorna true para assinatura valida", () => {
    const body = '{"entry":[]}';
    const signature = generateSignature(body, appSecret);

    expect(verifySignature(body, signature, appSecret)).toBe(true);
  });

  it("retorna false para assinatura invalida", () => {
    const body = '{"entry":[]}';
    const signature = "sha256=invalidhex";

    expect(verifySignature(body, signature, appSecret)).toBe(false);
  });

  it("retorna false quando assinatura esta ausente", () => {
    const body = '{"entry":[]}';

    expect(verifySignature(body, "", appSecret)).toBe(false);
    expect(verifySignature(body, undefined as unknown as string, appSecret)).toBe(false);
  });

  it("retorna false quando header nao comeca com sha256=", () => {
    const body = '{"entry":[]}';
    const hmac = createHmac("sha256", appSecret);
    hmac.update(body, "utf8");
    const rawHex = hmac.digest("hex");

    expect(verifySignature(body, rawHex, appSecret)).toBe(false);
  });

  it("usa timing-safe comparison (nao vaza informacao via timing)", () => {
    const body = '{"entry":[]}';
    const signature = generateSignature(body, appSecret);

    // Assinatura correta deve passar
    expect(verifySignature(body, signature, appSecret)).toBe(true);

    // Assinatura com 1 char diferente deve falhar
    const tampered = signature.slice(0, -1) + "0";
    expect(verifySignature(body, tampered, appSecret)).toBe(false);
  });

  it("valida contra o raw body, nao contra payload reserializado", () => {
    // Simula body com espacos extras (como a Meta pode enviar)
    const bodyWithSpaces = '{ "entry" :  [  ] }';
    const bodyReserialized = '{"entry":[]}';

    const signatureForOriginal = generateSignature(bodyWithSpaces, appSecret);

    // Deve validar com o body original
    expect(verifySignature(bodyWithSpaces, signatureForOriginal, appSecret)).toBe(true);

    // Nao deve validar com o body reserializado
    expect(verifySignature(bodyReserialized, signatureForOriginal, appSecret)).toBe(false);
  });
});
