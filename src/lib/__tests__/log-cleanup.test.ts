import { prismaMock } from "../__mocks__/prisma-mock";

jest.mock("../prisma", () => ({
  prisma: prismaMock,
}));

jest.mock("../audit", () => ({
  logAudit: jest.fn(),
}));

import { runLogCleanup } from "../../worker/log-cleanup";
import { logAudit } from "../audit";

describe("runLogCleanup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse("2026-04-03T00:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("le configuracoes de retencao do GlobalSettings", async () => {
    prismaMock.globalSettings.findUnique
      .mockResolvedValueOnce({
        id: "1",
        key: "log_full_retention_days",
        value: 90,
        updatedBy: "system",
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: "2",
        key: "log_summary_retention_days",
        value: 180,
        updatedBy: "system",
        updatedAt: new Date(),
      });

    prismaMock.inboundWebhook.updateMany.mockResolvedValue({ count: 5 });
    prismaMock.deliveryAttempt.deleteMany.mockResolvedValue({ count: 10 });
    prismaMock.routeDelivery.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.inboundWebhook.deleteMany.mockResolvedValue({ count: 2 });

    await runLogCleanup();

    expect(prismaMock.globalSettings.findUnique).toHaveBeenCalledWith({
      where: { key: "log_full_retention_days" },
    });
    expect(prismaMock.globalSettings.findUnique).toHaveBeenCalledWith({
      where: { key: "log_summary_retention_days" },
    });
  });

  it("seta raw_body e raw_payload para null em registros antigos", async () => {
    prismaMock.globalSettings.findUnique
      .mockResolvedValueOnce({
        id: "1",
        key: "log_full_retention_days",
        value: 90,
        updatedBy: "system",
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: "2",
        key: "log_summary_retention_days",
        value: 180,
        updatedBy: "system",
        updatedAt: new Date(),
      });

    prismaMock.inboundWebhook.updateMany.mockResolvedValue({ count: 5 });
    prismaMock.deliveryAttempt.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.routeDelivery.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.inboundWebhook.deleteMany.mockResolvedValue({ count: 0 });

    await runLogCleanup();

    // Passo 1: seta raw_body e raw_payload para null
    expect(prismaMock.inboundWebhook.updateMany).toHaveBeenCalledWith({
      where: {
        receivedAt: { lt: expect.any(Date) },
        OR: [
          { rawBody: { not: null } },
          { rawPayload: { not: { equals: null } } },
        ],
      },
      data: {
        rawBody: null,
        rawPayload: null,
      },
    });
  });

  it("deleta registros completos mais antigos que summary retention", async () => {
    prismaMock.globalSettings.findUnique
      .mockResolvedValueOnce({
        id: "1",
        key: "log_full_retention_days",
        value: 90,
        updatedBy: "system",
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: "2",
        key: "log_summary_retention_days",
        value: 180,
        updatedBy: "system",
        updatedAt: new Date(),
      });

    prismaMock.inboundWebhook.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.deliveryAttempt.deleteMany.mockResolvedValue({ count: 10 });
    prismaMock.routeDelivery.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.inboundWebhook.deleteMany.mockResolvedValue({ count: 2 });

    await runLogCleanup();

    // Passo 3: deleta DeliveryAttempts antigos
    expect(prismaMock.deliveryAttempt.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: expect.any(Date) },
      },
    });

    // Passo 4: deleta RouteDeliveries antigos
    expect(prismaMock.routeDelivery.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: expect.any(Date) },
      },
    });

    // Passo 2: deleta InboundWebhooks antigos
    expect(prismaMock.inboundWebhook.deleteMany).toHaveBeenCalledWith({
      where: {
        receivedAt: { lt: expect.any(Date) },
      },
    });
  });

  it("registra no AuditLog com actor_type system", async () => {
    prismaMock.globalSettings.findUnique
      .mockResolvedValueOnce(null) // usa default 90
      .mockResolvedValueOnce(null); // usa default 180

    prismaMock.inboundWebhook.updateMany.mockResolvedValue({ count: 5 });
    prismaMock.deliveryAttempt.deleteMany.mockResolvedValue({ count: 10 });
    prismaMock.routeDelivery.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.inboundWebhook.deleteMany.mockResolvedValue({ count: 2 });

    await runLogCleanup();

    expect(logAudit).toHaveBeenCalledWith({
      actorType: "system",
      actorLabel: "log-cleanup",
      action: "cleanup.logs",
      resourceType: "InboundWebhook",
      details: {
        prunedPayloads: 5,
        deletedAttempts: 10,
        deletedDeliveries: 3,
        deletedWebhooks: 2,
        fullRetentionDays: 90,
        summaryRetentionDays: 180,
      },
    });
  });

  it("usa valores default quando GlobalSettings nao tem configuracao", async () => {
    prismaMock.globalSettings.findUnique
      .mockResolvedValueOnce(null) // sem config para full retention
      .mockResolvedValueOnce(null); // sem config para summary retention

    prismaMock.inboundWebhook.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.deliveryAttempt.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.routeDelivery.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.inboundWebhook.deleteMany.mockResolvedValue({ count: 0 });

    await runLogCleanup();

    // Deve funcionar sem erro, usando defaults (90 e 180)
    expect(prismaMock.inboundWebhook.updateMany).toHaveBeenCalled();
  });
});
