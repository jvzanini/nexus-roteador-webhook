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

jest.mock("@/lib/realtime", () => ({
  publishRealtimeEvent: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("nanoid", () => ({
  nanoid: (len?: number) => "x".repeat(len ?? 21),
}));

const unsubscribeWebhookMock = jest.fn(async () => ({ success: true }));
jest.mock("../meta-subscription", () => ({
  unsubscribeWebhook: (companyId: string) => unsubscribeWebhookMock(companyId),
}));

import { updateCompany, deleteCompany } from "../company";

const superAdmin = {
  id: "user-1",
  name: "Admin",
  email: "admin@test.com",
  isSuperAdmin: true,
  avatarUrl: null,
  theme: "dark",
};

const companyId = "company-1";

describe("company actions — webhookKey invalidation + delete unsubscribe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(superAdmin);
    unsubscribeWebhookMock.mockImplementation(async () => ({ success: true }));
  });

  describe("updateCompany", () => {
    it("nao chama companyCredential.updateMany quando webhookKey nao muda", async () => {
      prismaMock.company.findUnique.mockResolvedValue({
        id: companyId,
        name: "Old",
        slug: "old",
        webhookKey: "same-key",
      });
      prismaMock.companyCredential.findUnique.mockResolvedValue(null);
      prismaMock.company.update.mockResolvedValue({
        id: companyId,
        name: "New",
        slug: "new",
        webhookKey: "same-key",
      });

      const result = await updateCompany(companyId, { name: "New" });

      expect(result.success).toBe(true);
      expect(prismaMock.companyCredential.updateMany).not.toHaveBeenCalled();
    });

    it("reseta credencial para not_configured quando webhookKey muda e status=not_configured", async () => {
      prismaMock.company.findUnique
        .mockResolvedValueOnce({
          id: companyId,
          name: "Old",
          slug: "old",
          webhookKey: "old-key",
        })
        .mockResolvedValueOnce(null); // busca de unique webhookKey

      prismaMock.companyCredential.findUnique.mockResolvedValue({
        id: "cred-1",
        companyId,
        metaSubscriptionStatus: "not_configured",
      });

      prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
        if (typeof cb === "function") {
          return (cb as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock);
        }
        return cb;
      });

      prismaMock.company.update.mockResolvedValue({
        id: companyId,
        name: "Old",
        slug: "old",
        webhookKey: "new-key",
      });
      prismaMock.companyCredential.updateMany.mockResolvedValue({ count: 1 });

      const result = await updateCompany(companyId, { webhookKey: "new-key" });

      expect(result.success).toBe(true);
      expect(prismaMock.companyCredential.updateMany).toHaveBeenCalledWith({
        where: { companyId },
        data: {
          metaSubscriptionStatus: "not_configured",
          metaSubscribedAt: null,
          metaSubscribedCallbackUrl: null,
          metaSubscribedFields: [],
          metaSubscriptionError: null,
        },
      });
    });

    it("bloqueia alteracao de webhookKey quando subscription=pending", async () => {
      prismaMock.company.findUnique
        .mockResolvedValueOnce({
          id: companyId,
          name: "Old",
          slug: "old",
          webhookKey: "old-key",
        })
        .mockResolvedValueOnce(null);

      prismaMock.companyCredential.findUnique.mockResolvedValue({
        id: "cred-1",
        companyId,
        metaSubscriptionStatus: "pending",
      });

      const result = await updateCompany(companyId, { webhookKey: "new-key" });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/inscri/i);
      expect(prismaMock.company.update).not.toHaveBeenCalled();
      expect(prismaMock.companyCredential.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("deleteCompany", () => {
    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (cb: unknown) => {
        if (typeof cb === "function") {
          return (cb as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock);
        }
        return cb;
      });
      prismaMock.webhookRoute.findMany.mockResolvedValue([]);
      prismaMock.webhookRoute.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.inboundWebhook.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.companyCredential.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.notification.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.auditLog.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.userCompanyMembership.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.company.delete.mockResolvedValue({ id: companyId });
    });

    it("chama unsubscribeWebhook antes do delete final", async () => {
      const result = await deleteCompany(companyId);

      expect(result.success).toBe(true);
      expect(unsubscribeWebhookMock).toHaveBeenCalledWith(companyId);
      expect(prismaMock.company.delete).toHaveBeenCalled();
    });

    it("prossegue com o delete mesmo quando unsubscribeWebhook falha", async () => {
      unsubscribeWebhookMock.mockRejectedValueOnce(new Error("meta offline"));

      const result = await deleteCompany(companyId);

      expect(result.success).toBe(true);
      expect(unsubscribeWebhookMock).toHaveBeenCalledWith(companyId);
      expect(prismaMock.company.delete).toHaveBeenCalled();
    });
  });
});
