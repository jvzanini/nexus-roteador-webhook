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
    subscribeFields: jest.fn(),
    subscribeApp: jest.fn(),
    unsubscribeApp: jest.fn(),
    listSubscribedApps: jest.fn(),
    listSubscriptions: jest.fn(),
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
import * as rateLimit from "@/lib/rate-limit/meta";
import { createNotification } from "@/lib/notifications";
import { publishRealtimeEvent } from "@/lib/realtime";
import {
  testMetaConnection,
  subscribeWebhook,
  subscribeWebhookUnlocked,
  unsubscribeWebhook,
  unsubscribeWebhookUnlocked,
  verifyMetaSubscription,
  verifyMetaSubscriptionCore,
  generateVerifyToken,
  updateVerifyToken,
} from "../meta-subscription";

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

describe("subscribeWebhook", () => {
  const VALID_UUID = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://roteador.example.com";
    (process.env as Record<string, string>).NODE_ENV = "production";
    (getCurrentUser as jest.Mock).mockResolvedValue({
      id: "u1",
      isSuperAdmin: true,
      email: "s@x.com",
    });
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: VALID_UUID,
      webhookKey: "wk-abc",
    });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (prisma.companyCredential.update as jest.Mock).mockResolvedValue(anyCred);
  });

  it("falha quando acquireMetaLock retorna false", async () => {
    (rateLimit.acquireMetaLock as jest.Mock).mockResolvedValueOnce(false);
    const r = await subscribeWebhook(VALID_UUID);
    expect(r.success).toBe(false);
    expect(r.error).toContain("Outra operação");
    expect(rateLimit.releaseMetaLock).not.toHaveBeenCalled();
  });

  it("falha quando rate limit excedido", async () => {
    (rateLimit.enforceMetaRateLimit as jest.Mock).mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const r = await subscribeWebhook(VALID_UUID);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Rate limit/i);
    expect(rateLimit.releaseMetaLock).toHaveBeenCalledWith(VALID_UUID);
  });

  it("falha quando NEXTAUTH_URL é localhost em produção", async () => {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    const r = await subscribeWebhook(VALID_UUID);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/callback_url/);
    expect(rateLimit.releaseMetaLock).toHaveBeenCalledWith(VALID_UUID);
  });

  it("sinaliza missing fields se accessToken e metaSystemUserToken ambos ausentes", async () => {
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
      ...anyCred,
      accessToken: "",
      metaSystemUserToken: null,
    });
    const r = await subscribeWebhook(VALID_UUID);
    expect(r.success).toBe(false);
    expect(r.error).toContain("accessToken");
    expect(rateLimit.releaseMetaLock).toHaveBeenCalledWith(VALID_UUID);
  });

  it("aceita accessToken se metaSystemUserToken ausente", async () => {
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
      ...anyCred,
      metaSystemUserToken: null,
    });
    (graphApi.subscribeFields as jest.Mock).mockResolvedValue(undefined);
    (graphApi.subscribeApp as jest.Mock).mockResolvedValue(undefined);

    const r = await subscribeWebhook(VALID_UUID);
    expect(r.success).toBe(true);

    expect(graphApi.subscribeFields).toHaveBeenCalledWith(
      "APP",
      expect.any(Object),
      "AT",
    );
    expect(graphApi.subscribeApp).toHaveBeenCalledWith("WABA", "AT");
  });

  it("prioriza metaSystemUserToken quando ambos presentes", async () => {
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
      ...anyCred,
      metaSystemUserToken: "enc:SUT",
      accessToken: "enc:AT",
    });
    (graphApi.subscribeFields as jest.Mock).mockResolvedValue(undefined);
    (graphApi.subscribeApp as jest.Mock).mockResolvedValue(undefined);

    await subscribeWebhook(VALID_UUID);

    expect(graphApi.subscribeApp).toHaveBeenCalledWith("WABA", "SUT");
  });

  it("happy path: pending -> active, notify info, realtime 2x, lock liberado", async () => {
    (graphApi.subscribeFields as jest.Mock).mockResolvedValue(undefined);
    (graphApi.subscribeApp as jest.Mock).mockResolvedValue(undefined);

    const r = await subscribeWebhook(VALID_UUID);
    expect(r.success).toBe(true);

    expect(graphApi.subscribeFields).toHaveBeenCalledWith(
      "APP",
      expect.objectContaining({
        object: "whatsapp_business_account",
        callbackUrl: "https://roteador.example.com/api/webhook/wk-abc",
        verifyToken: "VT",
        fields: expect.any(Array),
      }),
      "SUT"
    );
    expect(graphApi.subscribeApp).toHaveBeenCalledWith("WABA", "SUT");

    const updates = (prisma.companyCredential.update as jest.Mock).mock.calls;
    expect(updates.length).toBe(2);
    expect(updates[0][0].data).toMatchObject({ metaSubscriptionStatus: "pending" });
    expect(updates[1][0].data).toMatchObject({
      metaSubscriptionStatus: "active",
      metaSubscribedCallbackUrl: "https://roteador.example.com/api/webhook/wk-abc",
    });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "info" })
    );
    expect(publishRealtimeEvent).toHaveBeenCalledTimes(2);
    expect(rateLimit.releaseMetaLock).toHaveBeenCalledWith(VALID_UUID);
  });

  it("erro Meta: persiste status error e notifica error", async () => {
    const err = new graphApi.MetaApiError({ status: 400, message: "invalid callback" });
    (graphApi.subscribeFields as jest.Mock).mockRejectedValue(err);

    const r = await subscribeWebhook(VALID_UUID);
    expect(r.success).toBe(false);

    const updates = (prisma.companyCredential.update as jest.Mock).mock.calls;
    expect(updates[0][0].data).toMatchObject({ metaSubscriptionStatus: "pending" });
    const errUpdate = updates.find((c) => c[0].data.metaSubscriptionStatus === "error");
    expect(errUpdate).toBeDefined();
    expect(errUpdate![0].data.metaSubscriptionError).toEqual(expect.any(String));

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" })
    );
    expect(rateLimit.releaseMetaLock).toHaveBeenCalledWith(VALID_UUID);
  });
});

describe("unsubscribeWebhook", () => {
  const VALID_UUID = "11111111-1111-4111-8111-111111111111";

  it("happy path: DELETE + reset status", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (graphApi.unsubscribeApp as jest.Mock).mockResolvedValue(undefined);
    const r = await unsubscribeWebhook(VALID_UUID);
    expect(r.success).toBe(true);
    expect(graphApi.unsubscribeApp).toHaveBeenCalledWith("WABA", "SUT");
    const data = (prisma.companyCredential.update as jest.Mock).mock.calls.pop()![0].data;
    expect(data.metaSubscriptionStatus).toBe("not_configured");
    expect(data.metaSubscribedAt).toBeNull();
    expect(data.metaSubscribedCallbackUrl).toBeNull();
    expect(data.metaSubscribedFields).toEqual([]);
  });

  it("best-effort: atualiza local mesmo com erro Meta", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (graphApi.unsubscribeApp as jest.Mock).mockRejectedValue(
      new graphApi.MetaApiError({ status: 400, message: "already" })
    );
    const r = await unsubscribeWebhook(VALID_UUID);
    expect(r.success).toBe(true);
    expect(prisma.companyCredential.update).toHaveBeenCalled();
    const data = (prisma.companyCredential.update as jest.Mock).mock.calls.pop()![0].data;
    expect(data.metaSubscriptionStatus).toBe("not_configured");
  });

  it("falha se lock não adquirido", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (rateLimit.acquireMetaLock as jest.Mock).mockResolvedValueOnce(false);
    const r = await unsubscribeWebhook(VALID_UUID);
    expect(r.success).toBe(false);
  });

  it("usa accessToken se metaSystemUserToken ausente", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
      ...anyCred,
      metaSystemUserToken: null,
    });
    (graphApi.unsubscribeApp as jest.Mock).mockResolvedValue(undefined);
    const r = await unsubscribeWebhook(VALID_UUID);
    expect(r.success).toBe(true);
    expect(graphApi.unsubscribeApp).toHaveBeenCalledWith("WABA", "AT");
  });
});

describe("subscribeWebhookUnlocked (actor system)", () => {
  const VALID_UUID = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://roteador.example.com";
    (process.env as Record<string, string>).NODE_ENV = "production";
  });

  it("executa sem autorização e registra audit actorType=system", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: "c1", webhookKey: "abc" });
    (graphApi.subscribeFields as jest.Mock).mockResolvedValue(undefined);
    (graphApi.subscribeApp as jest.Mock).mockResolvedValue(undefined);
    const r = await subscribeWebhookUnlocked(VALID_UUID, { actor: "system" });
    expect(r.success).toBe(true);
    const logAuditMock = jest.requireMock("@/lib/audit").logAudit as jest.Mock;
    const auditCall = logAuditMock.mock.calls[0][0];
    expect(auditCall.actorType).toBe("system");
    expect(auditCall.actorLabel).toBe("system");
  });
});

describe("unsubscribeWebhookUnlocked (actor system)", () => {
  const VALID_UUID = "11111111-1111-4111-8111-111111111111";

  it("executa sem autorização", async () => {
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (graphApi.unsubscribeApp as jest.Mock).mockResolvedValue(undefined);
    const r = await unsubscribeWebhookUnlocked(VALID_UUID, { actor: "system" });
    expect(r.success).toBe(true);
  });
});

describe("verifyMetaSubscription", () => {
  const VALID_UUID = "11111111-1111-4111-8111-111111111111";
  const baseCred = { ...anyCred, metaSubscribedCallbackUrl: "https://roteador.example.com/api/webhook/abc" };

  beforeEach(() => {
    process.env.NEXTAUTH_URL = "https://roteador.example.com";
  });

  it("active quando app e callback batem", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(baseCred);
    (graphApi.listSubscribedApps as jest.Mock).mockResolvedValue([{ appId: "APP" }]);
    (graphApi.listSubscriptions as jest.Mock).mockResolvedValue([{
      object: "whatsapp_business_account",
      callbackUrl: "https://roteador.example.com/api/webhook/abc",
      fields: ["messages"],
    }]);
    const r = await verifyMetaSubscription(VALID_UUID);
    expect(r.success).toBe(true);
    const data = (prisma.companyCredential.update as jest.Mock).mock.calls.pop()![0].data;
    expect(data.metaSubscriptionStatus).toBe("active");
  });

  it("stale quando callback diverge", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(baseCred);
    (graphApi.listSubscribedApps as jest.Mock).mockResolvedValue([{ appId: "APP" }]);
    (graphApi.listSubscriptions as jest.Mock).mockResolvedValue([{
      object: "whatsapp_business_account",
      callbackUrl: "https://OLD.example.com/webhook/old",
      fields: ["messages"],
    }]);
    const r = await verifyMetaSubscription(VALID_UUID);
    expect(r.success).toBe(true);
    const data = (prisma.companyCredential.update as jest.Mock).mock.calls.pop()![0].data;
    expect(data.metaSubscriptionStatus).toBe("stale");
  });

  it("stale quando app ausente", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(baseCred);
    (graphApi.listSubscribedApps as jest.Mock).mockResolvedValue([]);
    (graphApi.listSubscriptions as jest.Mock).mockResolvedValue([]);
    const r = await verifyMetaSubscription(VALID_UUID);
    expect(r.success).toBe(true);
    const data = (prisma.companyCredential.update as jest.Mock).mock.calls.pop()![0].data;
    expect(data.metaSubscriptionStatus).toBe("stale");
  });

  it("erro Meta → status=error", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(baseCred);
    (graphApi.listSubscribedApps as jest.Mock).mockRejectedValue(
      new graphApi.MetaApiError({ status: 401, message: "expired" })
    );
    const r = await verifyMetaSubscription(VALID_UUID);
    expect(r.success).toBe(false);
    const data = (prisma.companyCredential.update as jest.Mock).mock.calls.pop()![0].data;
    expect(data.metaSubscriptionStatus).toBe("error");
  });

  it("verifyMetaSubscriptionCore aceita actor=system sem getCurrentUser", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(baseCred);
    (graphApi.listSubscribedApps as jest.Mock).mockResolvedValue([{ appId: "APP" }]);
    (graphApi.listSubscriptions as jest.Mock).mockResolvedValue([{
      object: "whatsapp_business_account",
      callbackUrl: "https://roteador.example.com/api/webhook/abc",
      fields: ["messages"],
    }]);
    const r = await verifyMetaSubscriptionCore(VALID_UUID, { actor: "system" });
    expect(r.success).toBe(true);
  });

  it("usa accessToken quando metaSystemUserToken ausente", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
      ...baseCred,
      metaSystemUserToken: null,
    });
    (graphApi.listSubscribedApps as jest.Mock).mockResolvedValue([{ appId: "APP" }]);
    (graphApi.listSubscriptions as jest.Mock).mockResolvedValue([{
      object: "whatsapp_business_account",
      callbackUrl: "https://roteador.example.com/api/webhook/abc",
      fields: ["messages"],
    }]);
    const r = await verifyMetaSubscription(VALID_UUID);
    expect(r.success).toBe(true);
    expect(graphApi.listSubscribedApps).toHaveBeenCalledWith("WABA", "AT");
  });
});

describe("generateVerifyToken", () => {
  it("gera token 48 chars hex quando autenticado", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u" });
    const r = await generateVerifyToken();
    expect(r.success).toBe(true);
    expect(r.data!.token).toMatch(/^[a-f0-9]{48}$/);
  });
  it("rejeita se não autenticado", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const r = await generateVerifyToken();
    expect(r.success).toBe(false);
  });
});

describe("updateVerifyToken", () => {
  const VALID_UUID = "11111111-1111-4111-8111-111111111111";

  it("rejeita quando não autenticado", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const r = await updateVerifyToken(VALID_UUID, "new-token");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/autenticado/i);
  });

  it("rejeita companyId inválido antes de checar auth", async () => {
    const r = await updateVerifyToken("não-uuid", "new-token");
    expect(r.success).toBe(false);
    expect(r.error).toContain("Input inválido");
  });

  it("rejeita token vazio", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    const r = await updateVerifyToken(VALID_UUID, "");
    expect(r.success).toBe(false);
    expect(r.error).toContain("Verify token inválido");
  });

  it("rejeita token excedendo 500 chars", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    const r = await updateVerifyToken(VALID_UUID, "x".repeat(501));
    expect(r.success).toBe(false);
    expect(r.error).toContain("Verify token inválido");
  });

  it("nega manager (role diferente de company_admin)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: false, email: "m@x.com" });
    (prisma.userCompanyMembership.findUnique as jest.Mock).mockResolvedValue({
      isActive: true,
      role: "manager",
    });
    const r = await updateVerifyToken(VALID_UUID, "new-token");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/negado/i);
  });

  it("retorna erro se credencial não existe", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(null);
    const r = await updateVerifyToken(VALID_UUID, "new-token");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/não cadastradas/i);
  });

  it("happy path: persiste apenas verifyToken encriptado e emite audit + realtime", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "u1", isSuperAdmin: true, email: "s@x.com" });
    (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(anyCred);
    (prisma.companyCredential.update as jest.Mock).mockResolvedValue(anyCred);

    const r = await updateVerifyToken(VALID_UUID, "my-new-verify-token");
    expect(r.success).toBe(true);

    // Confirma que prisma.update recebeu APENAS verifyToken (não tocou em outros campos)
    const updateArgs = (prisma.companyCredential.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.where).toEqual({ companyId: VALID_UUID });
    expect(updateArgs.data).toEqual({ verifyToken: "enc:my-new-verify-token" });
    expect(updateArgs.data.metaAppSecret).toBeUndefined();
    expect(updateArgs.data.accessToken).toBeUndefined();
    expect(updateArgs.data.metaSystemUserToken).toBeUndefined();

    // Audit
    const logAuditMock = jest.requireMock("@/lib/audit").logAudit as jest.Mock;
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "user",
        action: "credential.update_verify_token",
        resourceType: "CompanyCredential",
      }),
    );

    // Realtime
    expect(publishRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "credential:updated", companyId: VALID_UUID }),
    );
  });
});
