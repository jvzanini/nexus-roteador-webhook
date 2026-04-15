jest.mock("@/lib/prisma", () => ({
  prisma: {
    companyCredential: { findUnique: jest.fn(), update: jest.fn() },
    userCompanyMembership: { findUnique: jest.fn() },
    company: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/meta/graph-api", () => {
  const actual = jest.requireActual("@/lib/meta/graph-api");
  return {
    __esModule: true,
    ...actual,
    getPhoneNumber: jest.fn(),
    subscribeWhatsAppBusinessAccount: jest.fn(),
    unsubscribeWhatsAppBusinessAccount: jest.fn(),
    getSubscribedApps: jest.fn(),
    overrideCallbackUrl: jest.fn(),
  };
});
jest.mock("@/lib/encryption", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
  mask: (s: string) => `***${s.slice(-3)}`,
}));
jest.mock("@/lib/notifications", () => ({ createNotification: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));
jest.mock("@/lib/realtime", () => ({ publishRealtimeEvent: jest.fn() }));
jest.mock("@/lib/rate-limit/meta", () => ({
  enforceMetaRateLimit: jest.fn(async () => ({ allowed: true, remaining: 9 })),
  acquireMetaLock: jest.fn(async () => true),
  releaseMetaLock: jest.fn(async () => {}),
}));

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import * as graphApi from "@/lib/meta/graph-api";
import { testMetaConnection } from "../meta-subscription";

// Compartilhado entre describes (Tasks 6-9 reusam)
export const anyCred = {
  id: "cred-1",
  companyId: "c1",
  accessToken: "enc:AT",
  phoneNumberId: "PN",
  metaAppId: "APP",
  wabaId: "WABA",
  verifyToken: "enc:VT",
  metaSystemUserToken: "enc:SUT",
  metaSubscriptionStatus: "not_configured",
  metaSubscribedAt: null,
  metaSubscriptionError: null,
  metaSubscribedFields: [],
  metaSubscribedCallbackUrl: null,
};

beforeEach(() => jest.clearAllMocks());

describe("testMetaConnection", () => {
  const VALID_UUID = "11111111-1111-4111-8111-111111111111";

  it("retorna erro se não autenticado", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const r = await testMetaConnection(VALID_UUID);
    expect(r.success).toBe(false);
  });

  it("nega manager", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: false, email: "m@x.com" });
    (prisma.userCompanyMembership.findUnique as jest.Mock).mockResolvedValue({
      isActive: true,
      role: "manager",
    });
    const r = await testMetaConnection(VALID_UUID);
    expect(r.success).toBe(false);
  });

  it("super admin consegue e retorna phone number info", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (graphApi.getPhoneNumber as jest.Mock).mockResolvedValue({
      id: "PN", displayPhoneNumber: "+55", verifiedName: "X", qualityRating: "GREEN",
    });
    const r = await testMetaConnection(VALID_UUID);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ displayPhoneNumber: "+55", verifiedName: "X" });
    expect(graphApi.getPhoneNumber).toHaveBeenCalledWith("PN", "AT");
  });

  it("sinaliza missing_fields se credencial incompleta", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({ ...anyCred, phoneNumberId: null });
    const r = await testMetaConnection(VALID_UUID);
    expect(r.success).toBe(false);
    expect(r.error).toContain("phoneNumberId");
  });

  it("trata MetaApiError sem alterar status", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (graphApi.getPhoneNumber as jest.Mock).mockRejectedValue(
      new graphApi.MetaApiError({ status: 401, message: "expired" })
    );
    const r = await testMetaConnection(VALID_UUID);
    expect(r.success).toBe(false);
    expect(r.error).toContain("expired");
    expect(prisma.companyCredential.update).not.toHaveBeenCalled();
  });
});
