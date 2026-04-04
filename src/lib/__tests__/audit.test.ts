import { prismaMock } from "../__mocks__/prisma-mock";
import { logAudit } from "../audit";

// Mock do prisma
jest.mock("../prisma", () => ({
  prisma: prismaMock,
}));

describe("logAudit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("cria registro de audit log com actor_type user", async () => {
    prismaMock.auditLog.create.mockResolvedValue({
      id: "uuid-1",
      actorType: "user",
      actorId: "user-uuid-1",
      actorLabel: "admin@nexusai360.com",
      companyId: "company-uuid-1",
      action: "credential.create",
      resourceType: "CompanyCredential",
      resourceId: "cred-uuid-1",
      details: { metaAppId: "123456" },
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
      createdAt: new Date(),
    });

    await logAudit({
      actorType: "user",
      actorId: "user-uuid-1",
      actorLabel: "admin@nexusai360.com",
      companyId: "company-uuid-1",
      action: "credential.create",
      resourceType: "CompanyCredential",
      resourceId: "cred-uuid-1",
      details: { metaAppId: "123456" },
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: "user",
        actorId: "user-uuid-1",
        actorLabel: "admin@nexusai360.com",
        companyId: "company-uuid-1",
        action: "credential.create",
        resourceType: "CompanyCredential",
        resourceId: "cred-uuid-1",
        details: { metaAppId: "123456" },
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      },
    });
  });

  it("cria registro de audit log com actor_type system", async () => {
    prismaMock.auditLog.create.mockResolvedValue({
      id: "uuid-2",
      actorType: "system",
      actorId: null,
      actorLabel: "log-cleanup",
      companyId: null,
      action: "cleanup.logs",
      resourceType: "InboundWebhook",
      resourceId: null,
      details: { deletedCount: 42, prunedCount: 15 },
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    });

    await logAudit({
      actorType: "system",
      actorLabel: "log-cleanup",
      action: "cleanup.logs",
      resourceType: "InboundWebhook",
      details: { deletedCount: 42, prunedCount: 15 },
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorType: "system",
        actorId: undefined,
        actorLabel: "log-cleanup",
        companyId: undefined,
        action: "cleanup.logs",
        resourceType: "InboundWebhook",
        resourceId: undefined,
        details: { deletedCount: 42, prunedCount: 15 },
        ipAddress: undefined,
        userAgent: undefined,
      },
    });
  });

  it("não lança exceção mesmo se prisma falhar (fire-and-forget)", async () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error("DB down"));

    // Não deve lançar exceção
    await expect(
      logAudit({
        actorType: "system",
        actorLabel: "test",
        action: "test.action",
        resourceType: "Test",
        details: {},
      })
    ).resolves.toBeUndefined();
  });
});
