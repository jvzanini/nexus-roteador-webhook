/**
 * Testes do handler POST /api/webhook/[webhookKey].
 *
 * Cobre o pipeline novo (via @nexusai360/webhook-routing, flag ON) e o
 * comportamento com flag OFF. Mocka prisma, decrypt, logAudit e BullMQ
 * para isolar a rota.
 */

import { createHmac } from "crypto";

// ─── Mocks globais ─────────────────────────────────────────────
const logAuditMock = jest.fn();
jest.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

const decryptMock = jest.fn((v: string) => v);
jest.mock("@/lib/encryption", () => ({
  decrypt: (v: string) => decryptMock(v),
}));

const prismaFindUniqueMock = jest.fn();
const prismaUpdateMock = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: (...args: unknown[]) => prismaFindUniqueMock(...args) },
    inboundWebhook: { update: (...args: unknown[]) => prismaUpdateMock(...args) },
  },
}));

const queueAddMock = jest.fn().mockResolvedValue({ id: "job_1" });
jest.mock("@/lib/queue", () => ({
  webhookDeliveryQueue: { add: (...args: unknown[]) => queueAddMock(...args) },
}));

// ─── Imports apos mocks ────────────────────────────────────────
import {
  configureWebhookRouting,
  resetWebhookRouting,
} from "@nexusai360/webhook-routing";
import { makeFakeAdapter, FakeAdapterInstance } from "@/__tests__/utils/fake-adapter";
import { POST } from "../[webhookKey]/route";

const SECRET = "test_app_secret";
function sign(body: string): string {
  return (
    "sha256=" + createHmac("sha256", SECRET).update(body, "utf8").digest("hex")
  );
}

function makeReq(body: string, signature?: string): Request {
  return new Request("http://localhost/api/webhook/key1", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature ?? sign(body),
    },
  }) as any;
}

const ctx = () => ({ params: Promise.resolve({ webhookKey: "key1" }) });

function seedCompany() {
  prismaFindUniqueMock.mockResolvedValue({
    id: "c1",
    webhookKey: "key1",
    isActive: true,
    credential: { metaAppSecret: SECRET, verifyToken: "vt" },
  });
}

describe("POST /api/webhook/[webhookKey] — pipeline via pacote (flag ON)", () => {
  let adapter: FakeAdapterInstance;

  beforeEach(() => {
    process.env.USE_PACKAGE_PIPELINE = "true";
    jest.clearAllMocks();
    seedCompany();
    adapter = makeFakeAdapter({
      routes: [
        {
          id: "r1",
          companyId: "c1",
          name: "route-1",
          url: "https://example.com",
          secretKey: null,
          events: ["messages.text", "errors.131000"],
          headers: {},
          timeoutMs: 30000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    configureWebhookRouting(adapter);
  });

  afterAll(() => {
    delete process.env.USE_PACKAGE_PIPELINE;
    resetWebhookRouting();
  });

  it("signature valida + 1 evento -> 200 events:1 deduplicated:0", async () => {
    const body = JSON.stringify({
      entry: [
        {
          id: "waba1",
          changes: [
            {
              field: "messages",
              value: {
                messages: [{ id: "wamid.A", type: "text", text: { body: "hi" } }],
              },
            },
          ],
        },
      ],
    });
    const res = await POST(makeReq(body), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "ok",
      events: 1,
      deduplicated: 0,
    });
    expect(adapter.inbound).toHaveLength(1);
    expect(adapter.deliveries).toHaveLength(1);
    expect(queueAddMock).toHaveBeenCalledTimes(1);
  });

  it("signature invalida -> 401 + audit log", async () => {
    const body = "{}";
    const res = await POST(
      makeReq(body, "sha256=" + "0".repeat(64)),
      ctx(),
    );
    expect(res.status).toBe(401);
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock.mock.calls[0][0]).toMatchObject({
      action: "auth.invalid_signature",
    });
  });

  it("JSON invalido -> 400", async () => {
    const res = await POST(makeReq("not-json"), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("callback sem eventos -> 200 events:0", async () => {
    const body = JSON.stringify({
      entry: [{ id: "waba1", changes: [{ field: "messages", value: {} }] }],
    });
    const res = await POST(makeReq(body), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", events: 0 });
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it("dedupe hit (mesmo wamid 2x) -> deduplicated:1 na 2a", async () => {
    const body = JSON.stringify({
      entry: [
        {
          id: "waba1",
          changes: [
            {
              field: "messages",
              value: {
                messages: [{ id: "wamid.SAME", type: "text" }],
              },
            },
          ],
        },
      ],
    });
    await POST(makeReq(body), ctx());
    const res2 = await POST(makeReq(body), ctx());
    expect(await res2.json()).toMatchObject({ events: 0, deduplicated: 1 });
    // So 1 inbound persistido e 1 delivery/job
    expect(adapter.inbound).toHaveLength(1);
    expect(queueAddMock).toHaveBeenCalledTimes(1);
  });

  it("errors.* (dedupeIdentifier null) usa fallback hash e persiste", async () => {
    const body = JSON.stringify({
      entry: [
        {
          id: "waba1",
          changes: [
            {
              field: "messages",
              value: { errors: [{ code: 131000, title: "rate_limit" }] },
            },
          ],
        },
      ],
    });
    const res = await POST(makeReq(body), ctx());
    const json = await res.json();
    expect(json).toMatchObject({ events: 1 });
    expect(adapter.inbound[0].eventType).toBe("errors.131000");
  });

  it("webhookKey inexistente -> 404 sem tocar adapter", async () => {
    prismaFindUniqueMock.mockResolvedValueOnce(null);
    const body = JSON.stringify({ entry: [] });
    const res = await POST(makeReq(body), ctx());
    expect(res.status).toBe(404);
    expect(adapter.inbound).toHaveLength(0);
  });
});

describe("POST /api/webhook/[webhookKey] — flag OFF (handleInlinePost)", () => {
  beforeAll(() => {
    process.env.USE_PACKAGE_PIPELINE = "false";
  });
  afterAll(() => {
    delete process.env.USE_PACKAGE_PIPELINE;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    seedCompany();
  });

  it("flag off nao chama adapter persistInboundAndDeliveries", async () => {
    const persistSpy = jest.fn();
    const fake = makeFakeAdapter();
    (fake as any).persistInboundAndDeliveries = persistSpy;
    configureWebhookRouting(fake);
    // Body com 0 eventos — rota inline ainda respondera 200 events:0 sem
    // tocar no adapter do pacote (inline usa prisma diretamente).
    const body = JSON.stringify({ entry: [] });
    await POST(makeReq(body), ctx()).catch(() => {
      // inline tentara prisma.webhookRoute.findMany etc. — mocks vazios retornam undefined
      // aceitavel: queremos apenas garantir que persistSpy nunca foi chamado.
    });
    expect(persistSpy).not.toHaveBeenCalled();
  });
});
