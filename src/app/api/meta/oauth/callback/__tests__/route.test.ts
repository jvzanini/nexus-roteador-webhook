jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userCompanyMembership: { findUnique: jest.fn() },
    companyCredential: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}));
jest.mock("@/lib/meta/oauth", () => ({
  exchangeCode: jest.fn(),
  exchangeForLongLivedToken: jest.fn(),
  validateBusinessAccess: jest.fn(),
}));
jest.mock("@/lib/meta/graph-api", () => {
  const actual = jest.requireActual("@/lib/meta/graph-api");
  return {
    __esModule: true,
    ...actual,
    serializeErrorSafe: jest.fn((e: unknown) => (e instanceof Error ? e.message : "err")),
  };
});
jest.mock("@/lib/rate-limit/meta", () => ({
  enforceMetaRateLimit: jest.fn(async () => ({ allowed: true, remaining: 9 })),
  acquireMetaLock: jest.fn(async () => true),
  releaseMetaLock: jest.fn(async () => {}),
}));
jest.mock("@/lib/actions/meta-subscription", () => ({
  subscribeWebhookUnlocked: jest.fn(async () => ({ success: true })),
  unsubscribeWebhookUnlocked: jest.fn(async () => ({ success: true })),
}));
jest.mock("@/lib/notifications", () => ({ createNotification: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));
jest.mock("@/lib/realtime", () => ({ publishRealtimeEvent: jest.fn() }));
jest.mock("@/lib/redis", () => ({
  redis: { get: jest.fn(), del: jest.fn(), set: jest.fn() },
}));
jest.mock("@/lib/encryption", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
  mask: (s: string) => `***${s.slice(-3)}`,
}));

import { POST } from "../route";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import * as oauth from "@/lib/meta/oauth";
import * as rateLimit from "@/lib/rate-limit/meta";
import * as subscription from "@/lib/actions/meta-subscription";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { publishRealtimeEvent } from "@/lib/realtime";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

function makeReq(body: unknown, originOk = true) {
  return new Request("http://localhost/api/meta/oauth/callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(originOk ? { Origin: "https://x.com" } : {}),
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  companyId: VALID_UUID,
  code: "CODE123",
  wabaId: "WABA_NEW",
  phoneNumberId: "PHONE123",
  state: "a".repeat(48),
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_URL = "https://x.com";
  process.env.META_APP_ID = "APP";
  process.env.META_APP_SECRET = "SECRET";
  (getCurrentUser as jest.Mock).mockResolvedValue({
    id: "u1",
    email: "u@x.com",
    isSuperAdmin: true,
  });
  (redis.get as jest.Mock).mockResolvedValue("a".repeat(48));
  (redis.del as jest.Mock).mockResolvedValue(1);
  (oauth.exchangeCode as jest.Mock).mockResolvedValue({
    accessToken: "short",
    tokenType: "bearer",
  });
  (oauth.exchangeForLongLivedToken as jest.Mock).mockResolvedValue({
    accessToken: "long",
    expiresIn: 5184000,
  });
  (oauth.validateBusinessAccess as jest.Mock).mockResolvedValue(undefined);
  (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.companyCredential.upsert as jest.Mock).mockResolvedValue({});
});

it("401 sem sessão", async () => {
  (getCurrentUser as jest.Mock).mockResolvedValue(null);
  const res = await POST(makeReq(validBody));
  expect(res.status).toBe(401);
});

it("403 se Origin não bate", async () => {
  const res = await POST(makeReq(validBody, false));
  expect(res.status).toBe(403);
});

it("403 se state ausente no Redis", async () => {
  (redis.get as jest.Mock).mockResolvedValue(null);
  const res = await POST(makeReq(validBody));
  expect(res.status).toBe(403);
  const j = await res.json();
  expect(j.error).toMatch(/State/i);
});

it("403 se state diverge", async () => {
  (redis.get as jest.Mock).mockResolvedValue("b".repeat(48));
  const res = await POST(makeReq(validBody));
  expect(res.status).toBe(403);
});

it("429 se rate limit excedido", async () => {
  (rateLimit.enforceMetaRateLimit as jest.Mock).mockResolvedValueOnce({
    allowed: false,
    remaining: 0,
  });
  const res = await POST(makeReq(validBody));
  expect(res.status).toBe(429);
});

it("409 se lock não adquirido", async () => {
  (rateLimit.acquireMetaLock as jest.Mock).mockResolvedValueOnce(false);
  const res = await POST(makeReq(validBody));
  expect(res.status).toBe(409);
});

it("happy path — chama oauth, upsert, subscribe, audit, notification, realtime", async () => {
  const res = await POST(makeReq(validBody));
  expect(res.status).toBe(200);
  const j = await res.json();
  expect(j.success).toBe(true);
  expect(j.data).toEqual({ wabaId: "WABA_NEW", phoneNumberId: "PHONE123" });

  expect(oauth.exchangeCode).toHaveBeenCalledWith("CODE123", "https://x.com/api/meta/oauth/callback");
  expect(oauth.exchangeForLongLivedToken).toHaveBeenCalledWith("short");
  expect(oauth.validateBusinessAccess).toHaveBeenCalledWith("long", "WABA_NEW", "PHONE123");

  const upsertCall = (prisma.companyCredential.upsert as jest.Mock).mock.calls[0][0];
  expect(upsertCall.where).toEqual({ companyId: VALID_UUID });
  expect(upsertCall.update.accessToken).toBe("enc:long");
  expect(upsertCall.update.accessTokenExpiresAt).toBeInstanceOf(Date);
  expect(upsertCall.update.connectedViaEmbeddedSignup).toBe(true);
  expect(upsertCall.update.wabaId).toBe("WABA_NEW");
  expect(upsertCall.update.phoneNumberId).toBe("PHONE123");
  expect(upsertCall.create.metaAppId).toBe("APP");
  expect(upsertCall.create.metaAppSecret).toBe("enc:SECRET");

  expect(subscription.subscribeWebhookUnlocked).toHaveBeenCalledWith(
    VALID_UUID,
    expect.objectContaining({ actor: "user", userId: "u1" })
  );
  expect(logAudit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "meta_embedded_signup.connected", companyId: VALID_UUID })
  );
  expect(createNotification).toHaveBeenCalledWith(
    expect.objectContaining({ companyId: VALID_UUID, type: "info" })
  );
  expect(publishRealtimeEvent).toHaveBeenCalledWith({
    type: "credential:updated",
    companyId: VALID_UUID,
  });
  expect(rateLimit.releaseMetaLock).toHaveBeenCalledWith(VALID_UUID);
});

it("reconexão com WABA diferente — unsubscribe é chamado antes do upsert", async () => {
  (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
    wabaId: "WABA_OLD",
  });
  const res = await POST(makeReq(validBody));
  expect(res.status).toBe(200);
  expect(subscription.unsubscribeWebhookUnlocked).toHaveBeenCalledWith(
    VALID_UUID,
    expect.objectContaining({ actor: "user", userId: "u1" })
  );
  const unsubOrder = (subscription.unsubscribeWebhookUnlocked as jest.Mock).mock.invocationCallOrder[0];
  const upsertOrder = (prisma.companyCredential.upsert as jest.Mock).mock.invocationCallOrder[0];
  expect(unsubOrder).toBeLessThan(upsertOrder);
});

it("reconexão com mesma WABA — unsubscribe NÃO é chamado", async () => {
  (prisma.companyCredential.findUnique as jest.Mock).mockResolvedValue({
    wabaId: "WABA_NEW",
  });
  const res = await POST(makeReq(validBody));
  expect(res.status).toBe(200);
  expect(subscription.unsubscribeWebhookUnlocked).not.toHaveBeenCalled();
});
