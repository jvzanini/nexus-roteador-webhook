import {
  upsertCredentialSchema,
} from "../validations/credential";

describe("upsertCredentialSchema", () => {
  const validCredential = {
    metaAppId: "123456789",
    metaAppSecret: "abc123def456",
    verifyToken: "my-verify-token",
    accessToken: "EAAxxxxxxx",
    phoneNumberId: "109876543",
    wabaId: "112233445566",
  };

  it("validates a complete credential", () => {
    const result = upsertCredentialSchema.safeParse(validCredential);
    expect(result.success).toBe(true);
  });

  it("requires metaAppId", () => {
    const { metaAppId, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires metaAppSecret", () => {
    const { metaAppSecret, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires verifyToken", () => {
    const { verifyToken, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires accessToken", () => {
    const { accessToken, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires phoneNumberId", () => {
    const { phoneNumberId, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("requires wabaId", () => {
    const { wabaId, ...rest } = validCredential;
    const result = upsertCredentialSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty metaAppId", () => {
    const result = upsertCredentialSchema.safeParse({
      ...validCredential,
      metaAppId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty metaAppSecret", () => {
    const result = upsertCredentialSchema.safeParse({
      ...validCredential,
      metaAppSecret: "",
    });
    expect(result.success).toBe(false);
  });
});
