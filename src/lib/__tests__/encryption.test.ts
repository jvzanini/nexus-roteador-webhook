import { encrypt, decrypt, mask } from "../encryption";

describe("encryption", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "a".repeat(64);
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it("encrypts and decrypts a string correctly", () => {
    const plaintext = "my-secret-api-key-12345";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(":");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext", () => {
    const plaintext = "same-input";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    parts[2] = "tampered" + parts[2];
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("masks values correctly", () => {
    expect(mask("abcdefghijklmnop")).toBe("••••••••lmnop");
    expect(mask("abc")).toBe("••••••••");
    expect(mask("abcdefgh", 6)).toBe("••••••••cdefgh");
  });
});
