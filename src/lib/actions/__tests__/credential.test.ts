import { prismaMock } from "@/lib/__mocks__/prisma-mock";

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

const mockGetCurrentUser = jest.fn();
jest.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

jest.mock("@/lib/audit", () => ({
  logAudit: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

// Mock encryption: prefixa "enc:" e descriptografa removendo o prefixo
jest.mock("@/lib/encryption", () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => (v.startsWith("enc:") ? v.slice(4) : v),
  mask: (v: string) =>
    v.length <= 5 ? "••••••••" : "••••••••" + v.slice(-5),
}));

import { upsertCredential, getCredential } from "../credential";

const superAdmin = {
  id: "user-1",
  name: "Admin",
  email: "admin@test.com",
  isSuperAdmin: true,
  avatarUrl: null,
  theme: "dark",
};

const companyId = "company-1";

describe("credential actions — metaSystemUserToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(superAdmin);
  });

  it("upsertCredential criptografa metaSystemUserToken antes de persistir", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: companyId });
    prismaMock.companyCredential.findUnique.mockResolvedValue(null);
    prismaMock.companyCredential.upsert.mockResolvedValue({
      id: "cred-1",
      companyId,
      metaAppId: "app",
      metaAppSecret: "enc:secret",
      verifyToken: "enc:vt",
      accessToken: "enc:at",
      metaSystemUserToken: "enc:plaintext-token",
      phoneNumberId: "pn",
      wabaId: "waba",
    });

    const result = await upsertCredential(companyId, {
      metaAppId: "app",
      metaAppSecret: "secret",
      verifyToken: "vt",
      accessToken: "at",
      phoneNumberId: "pn",
      wabaId: "waba",
      metaSystemUserToken: "plaintext-token",
    });

    expect(result.success).toBe(true);

    const upsertCall = prismaMock.companyCredential.upsert.mock.calls[0][0];
    // Valor persistido deve ser o encriptado, NUNCA o plaintext
    expect(upsertCall.create.metaSystemUserToken).toBe("enc:plaintext-token");
    expect(upsertCall.update.metaSystemUserToken).toBe("enc:plaintext-token");
    expect(upsertCall.create.metaSystemUserToken).not.toBe("plaintext-token");

    // Retorno mascarado — nao vaza plaintext
    const data = result.data as Record<string, unknown>;
    expect(data.metaSystemUserToken).not.toBe("plaintext-token");
    expect(data.metaSystemUserToken).toMatch(/••••••••/);
  });

  it("upsertCredential com metaSystemUserToken ausente nao inclui o campo no data", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: companyId });
    prismaMock.companyCredential.findUnique.mockResolvedValue(null);
    prismaMock.companyCredential.upsert.mockResolvedValue({
      id: "cred-1",
      companyId,
      metaAppId: "app",
      metaAppSecret: "enc:secret",
      verifyToken: "enc:vt",
      accessToken: "enc:at",
      metaSystemUserToken: null,
      phoneNumberId: "pn",
      wabaId: "waba",
    });

    await upsertCredential(companyId, {
      metaAppId: "app",
      metaAppSecret: "secret",
      verifyToken: "vt",
      accessToken: "at",
      phoneNumberId: "pn",
      wabaId: "waba",
    });

    const upsertCall = prismaMock.companyCredential.upsert.mock.calls[0][0];
    expect(upsertCall.create.metaSystemUserToken).toBeUndefined();
    expect(upsertCall.update.metaSystemUserToken).toBeUndefined();
  });

  it("upsertCredential com metaSystemUserToken null limpa o campo", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: companyId });
    prismaMock.companyCredential.findUnique.mockResolvedValue({ id: "cred-1" });
    prismaMock.companyCredential.upsert.mockResolvedValue({
      id: "cred-1",
      companyId,
      metaAppId: "app",
      metaAppSecret: "enc:secret",
      verifyToken: "enc:vt",
      accessToken: "enc:at",
      metaSystemUserToken: null,
      phoneNumberId: "pn",
      wabaId: "waba",
    });

    await upsertCredential(companyId, {
      metaAppId: "app",
      metaAppSecret: "secret",
      verifyToken: "vt",
      accessToken: "at",
      phoneNumberId: "pn",
      wabaId: "waba",
      metaSystemUserToken: null,
    });

    const upsertCall = prismaMock.companyCredential.upsert.mock.calls[0][0];
    expect(upsertCall.update.metaSystemUserToken).toBeNull();
  });

  it("getCredential retorna metaSystemUserToken mascarado e snapshot meta", async () => {
    prismaMock.companyCredential.findUnique.mockResolvedValue({
      id: "cred-1",
      companyId,
      metaAppId: "app",
      metaAppSecret: "enc:secret",
      verifyToken: "enc:vt",
      accessToken: "enc:at",
      metaSystemUserToken: "enc:supersecrettoken123",
      phoneNumberId: "pn",
      wabaId: "waba",
      metaSubscriptionStatus: "active",
      metaSubscribedAt: new Date("2026-04-15T00:00:00.000Z"),
      metaSubscriptionError: null,
      metaSubscribedCallbackUrl: "https://example.com/webhook",
      metaSubscribedFields: ["messages"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getCredential(companyId);
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;

    expect(data.meta).toEqual({
      status: "active",
      subscribedAt: "2026-04-15T00:00:00.000Z",
      error: null,
      callbackUrl: "https://example.com/webhook",
      fields: ["messages"],
    });
  });

  it("getCredential retorna metaSystemUserToken null quando nao configurado", async () => {
    prismaMock.companyCredential.findUnique.mockResolvedValue({
      id: "cred-1",
      companyId,
      metaAppId: "app",
      metaAppSecret: "enc:secret",
      verifyToken: "enc:vt",
      accessToken: "enc:at",
      metaSystemUserToken: null,
      phoneNumberId: "pn",
      wabaId: "waba",
      metaSubscriptionStatus: "not_configured",
      metaSubscribedAt: null,
      metaSubscriptionError: null,
      metaSubscribedCallbackUrl: null,
      metaSubscribedFields: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getCredential(companyId);
    const data = result.data as Record<string, unknown>;
    expect((data.meta as Record<string, unknown>).subscribedAt).toBeNull();
  });

  it("upsertCredential preserva verifyToken/accessToken existentes quando input mascarado", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: companyId });
    prismaMock.companyCredential.findUnique.mockResolvedValue({
      id: "cred-1",
      companyId,
      metaAppId: "app",
      metaAppSecret: "enc:oldsecret",
      verifyToken: "enc:oldverify",
      accessToken: "enc:oldaccess",
      phoneNumberId: "pn",
      wabaId: "waba",
      metaSystemUserToken: null,
    });
    prismaMock.companyCredential.upsert.mockImplementation(
      async (args: { update: Record<string, unknown> }) =>
        ({ id: "cred-1", companyId, ...args.update }) as never,
    );

    const result = await upsertCredential(companyId, {
      metaAppId: "app",
      metaAppSecret: "secret",
      verifyToken: "••••••••5def",
      accessToken: "••••••••9abc",
      phoneNumberId: "pn",
      wabaId: "waba",
    });

    expect(result.success).toBe(true);
    const upsertCall = prismaMock.companyCredential.upsert.mock.calls[0][0];
    expect(upsertCall.update.verifyToken).toBe("enc:oldverify");
    expect(upsertCall.update.accessToken).toBe("enc:oldaccess");
  });
});
