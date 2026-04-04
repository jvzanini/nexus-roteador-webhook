import { prismaMock } from "@/lib/__mocks__/prisma-mock";

jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

const mockGetCurrentUser = jest.fn();
jest.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const mockAssertCompanyAccess = jest.fn();
jest.mock("@/lib/tenant", () => ({
  assertCompanyAccess: (...args: any[]) => mockAssertCompanyAccess(...args),
}));

const mockLogAudit = jest.fn();
jest.mock("@/lib/audit", () => ({
  logAudit: (...args: any[]) => mockLogAudit(...args),
}));

const mockQueueAdd = jest.fn();
jest.mock("@/lib/queue", () => ({
  webhookDeliveryQueue: { add: (...args: any[]) => mockQueueAdd(...args) },
}));

import { resendDelivery, resendDeliveries } from "../resend";

describe("resendDelivery", () => {
  const user = { id: "user-1", name: "Admin", email: "admin@test.com", isSuperAdmin: true, avatarUrl: null, theme: "dark" };

  const failedDelivery = {
    id: "del-1",
    inboundWebhookId: "inb-1",
    routeId: "route-1",
    companyId: "comp-1",
    status: "failed",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(user);
    mockAssertCompanyAccess.mockResolvedValue(undefined);
  });

  it("retorna erro se não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await resendDelivery("del-1");
    expect(result).toEqual({ created: false, enqueued: false, newDeliveryId: "", error: "Não autenticado" });
  });

  it("retorna erro se delivery não existe", async () => {
    prismaMock.routeDelivery.findUnique.mockResolvedValue(null);
    const result = await resendDelivery("del-999");
    expect(result.created).toBe(false);
    expect(result.error).toContain("não encontrada");
  });

  it("retorna erro se status não é failed", async () => {
    prismaMock.routeDelivery.findUnique.mockResolvedValue({ ...failedDelivery, status: "delivered" } as any);
    const result = await resendDelivery("del-1");
    expect(result.created).toBe(false);
    expect(result.error).toContain("failed");
  });

  it("cria delivery derivada e enfileira com sucesso", async () => {
    prismaMock.routeDelivery.findUnique.mockResolvedValue(failedDelivery as any);
    prismaMock.routeDelivery.create.mockResolvedValue({ ...failedDelivery, id: "new-del-1", originDeliveryId: "del-1", status: "pending" } as any);
    mockQueueAdd.mockResolvedValue({ id: "job-1" });

    const result = await resendDelivery("del-1");

    expect(result.created).toBe(true);
    expect(result.enqueued).toBe(true);
    expect(result.newDeliveryId).toBe("new-del-1");

    // Verifica criação da delivery derivada
    expect(prismaMock.routeDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inboundWebhookId: "inb-1",
        routeId: "route-1",
        companyId: "comp-1",
        status: "pending",
        originDeliveryId: "del-1",
      }),
    });

    // Verifica audit log
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delivery.resend",
        resourceType: "route_delivery",
        resourceId: "new-del-1",
      })
    );
  });

  it("cria delivery mas retorna enqueued=false se BullMQ falha", async () => {
    prismaMock.routeDelivery.findUnique.mockResolvedValue(failedDelivery as any);
    prismaMock.routeDelivery.create.mockResolvedValue({ ...failedDelivery, id: "new-del-1", originDeliveryId: "del-1", status: "pending" } as any);
    mockQueueAdd.mockRejectedValue(new Error("Redis down"));

    const result = await resendDelivery("del-1");

    expect(result.created).toBe(true);
    expect(result.enqueued).toBe(false);
    expect(result.newDeliveryId).toBe("new-del-1");
  });
});

describe("resendDeliveries", () => {
  const user = { id: "user-1", name: "Admin", email: "admin@test.com", isSuperAdmin: true, avatarUrl: null, theme: "dark" };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(user);
    mockAssertCompanyAccess.mockResolvedValue(undefined);
  });

  it("retorna erro se mais de 50 IDs", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `del-${i}`);
    const result = await resendDeliveries(ids);
    expect(result.error).toContain("50");
  });

  it("deduplica IDs antes de processar", async () => {
    prismaMock.routeDelivery.findMany.mockResolvedValue([
      { id: "del-1", inboundWebhookId: "inb-1", routeId: "r-1", companyId: "c-1", status: "failed" },
    ] as any);
    prismaMock.routeDelivery.create.mockResolvedValue({ id: "new-1", status: "pending" } as any);
    mockQueueAdd.mockResolvedValue({ id: "job-1" });

    const result = await resendDeliveries(["del-1", "del-1", "del-1"]);

    expect(result.created).toBe(1); // Não 3
  });

  it("pula deliveries inválidas e processa válidas", async () => {
    prismaMock.routeDelivery.findMany.mockResolvedValue([
      { id: "del-1", inboundWebhookId: "inb-1", routeId: "r-1", companyId: "c-1", status: "failed" },
      { id: "del-2", inboundWebhookId: "inb-2", routeId: "r-2", companyId: "c-1", status: "delivered" }, // não é failed
    ] as any);
    prismaMock.routeDelivery.create.mockResolvedValue({ id: "new-1", status: "pending" } as any);
    mockQueueAdd.mockResolvedValue({ id: "job-1" });

    const result = await resendDeliveries(["del-1", "del-2", "del-999"]); // del-999 não existe

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(2); // del-2 (não failed) + del-999 (não encontrado)
    expect(result.errors.length).toBe(2);
  });
});
