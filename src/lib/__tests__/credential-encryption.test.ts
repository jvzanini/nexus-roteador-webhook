import { encrypt, decrypt, mask } from "../encryption";

describe("credential encryption flow", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "b".repeat(64); // 32 bytes hex
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  const sensitiveFields = {
    metaAppSecret: "abc123secret456def",
    verifyToken: "my-custom-verify-token-2024",
    accessToken: "EAAGxxxxxxxxxxxxxxxxxxxxxxZBZBZB",
  };

  it("encrypts all sensitive credential fields", () => {
    const encrypted: Record<string, string> = {};
    for (const [key, value] of Object.entries(sensitiveFields)) {
      encrypted[key] = encrypt(value);
      expect(encrypted[key]).not.toBe(value);
      expect(encrypted[key]).toContain(":");
    }
  });

  it("decrypts all sensitive credential fields back to original", () => {
    for (const [, value] of Object.entries(sensitiveFields)) {
      const encrypted = encrypt(value);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(value);
    }
  });

  it("masks sensitive fields correctly for API response", () => {
    expect(mask("abc123secret456def")).toBe("****...6def");
    expect(mask("EAAGxxxxxxxxxxxxxxxxxxxxxxZBZBZB")).toBe("****...ZBZB");
    expect(mask("ab")).toBe("****");
    expect(mask("abcd")).toBe("****");
    expect(mask("abcde")).toBe("****...bcde");
  });

  it("simulates full save-and-read cycle", () => {
    // Simula salvar no banco
    const toSave = {
      metaAppId: "123456789", // nao criptografado
      metaAppSecret: encrypt(sensitiveFields.metaAppSecret),
      verifyToken: encrypt(sensitiveFields.verifyToken),
      accessToken: encrypt(sensitiveFields.accessToken),
      phoneNumberId: "109876543", // nao criptografado
      wabaId: "112233445566", // nao criptografado
    };

    // Simula ler do banco e retornar para API (masked)
    const apiResponse = {
      metaAppId: toSave.metaAppId,
      metaAppSecret: mask(decrypt(toSave.metaAppSecret)),
      verifyToken: mask(decrypt(toSave.verifyToken)),
      accessToken: mask(decrypt(toSave.accessToken)),
      phoneNumberId: toSave.phoneNumberId,
      wabaId: toSave.wabaId,
    };

    expect(apiResponse.metaAppSecret).toBe("****...6def");
    expect(apiResponse.verifyToken).toBe("****...2024");
    expect(apiResponse.accessToken).toBe("****...ZBZB");
    expect(apiResponse.metaAppId).toBe("123456789");
  });
});
