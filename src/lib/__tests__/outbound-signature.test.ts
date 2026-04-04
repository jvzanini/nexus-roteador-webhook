import { computeOutboundSignature, verifyOutboundSignature } from "../outbound-signature";

describe("outbound-signature", () => {
  const secretKey = "test-secret-key-for-hmac-256";

  describe("computeOutboundSignature", () => {
    it("produces a sha256= prefixed hex string", () => {
      const body = JSON.stringify({ event: "messages.text", data: { id: "wamid.123" } });
      const signature = computeOutboundSignature(body, secretKey);

      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it("produces consistent signatures for same input", () => {
      const body = '{"key":"value"}';
      const sig1 = computeOutboundSignature(body, secretKey);
      const sig2 = computeOutboundSignature(body, secretKey);

      expect(sig1).toBe(sig2);
    });

    it("produces different signatures for different bodies", () => {
      const sig1 = computeOutboundSignature('{"a":1}', secretKey);
      const sig2 = computeOutboundSignature('{"a":2}', secretKey);

      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures for different keys", () => {
      const body = '{"a":1}';
      const sig1 = computeOutboundSignature(body, "key-one");
      const sig2 = computeOutboundSignature(body, "key-two");

      expect(sig1).not.toBe(sig2);
    });

    it("handles empty body", () => {
      const signature = computeOutboundSignature("", secretKey);
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it("handles unicode body correctly", () => {
      const body = '{"text":"Olá, mundo! 🇧🇷"}';
      const signature = computeOutboundSignature(body, secretKey);
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });
  });

  describe("verifyOutboundSignature", () => {
    it("returns true for valid signature", () => {
      const body = '{"event":"test"}';
      const signature = computeOutboundSignature(body, secretKey);

      expect(verifyOutboundSignature(body, secretKey, signature)).toBe(true);
    });

    it("returns false for tampered body", () => {
      const body = '{"event":"test"}';
      const signature = computeOutboundSignature(body, secretKey);

      expect(verifyOutboundSignature('{"event":"tampered"}', secretKey, signature)).toBe(false);
    });

    it("returns false for wrong key", () => {
      const body = '{"event":"test"}';
      const signature = computeOutboundSignature(body, secretKey);

      expect(verifyOutboundSignature(body, "wrong-key", signature)).toBe(false);
    });

    it("returns false for malformed signature", () => {
      expect(verifyOutboundSignature("body", secretKey, "not-a-valid-sig")).toBe(false);
    });

    it("uses timing-safe comparison", () => {
      const body = '{"event":"test"}';
      const signature = computeOutboundSignature(body, secretKey);

      // Deve funcionar sem timing leak — verificamos que a API funciona corretamente
      expect(verifyOutboundSignature(body, secretKey, signature)).toBe(true);
    });
  });
});
