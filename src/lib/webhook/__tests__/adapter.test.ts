import { PrismaClient } from "@/generated/prisma/client";
import { mockDeep, mockReset, DeepMockProxy } from "jest-mock-extended";

jest.mock("@/lib/prisma", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "@/lib/prisma";
import { PrismaWebhookAdapter } from "../adapter";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;

describe("PrismaWebhookAdapter", () => {
  beforeEach(() => mockReset(mockPrisma));
  const adapter = new PrismaWebhookAdapter();

  describe("listRoutes", () => {
    it("filtra por companyId e onlyActive", async () => {
      mockPrisma.webhookRoute.findMany.mockResolvedValue([
        {
          id: "r1",
          companyId: "c1",
          name: "n",
          icon: "i",
          url: "https://x",
          secretKey: null,
          events: ["a"],
          headers: {},
          timeoutMs: 30000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);
      const res = await adapter.listRoutes("c1", { onlyActive: true });
      expect(mockPrisma.webhookRoute.findMany).toHaveBeenCalledWith({
        where: { companyId: "c1", isActive: true },
      });
      expect(res[0].id).toBe("r1");
      expect(res[0].events).toEqual(["a"]);
    });

    it("tolera events nao-array (retorna [])", async () => {
      mockPrisma.webhookRoute.findMany.mockResolvedValue([
        {
          id: "r1",
          companyId: "c1",
          name: "n",
          icon: "i",
          url: "https://x",
          secretKey: null,
          events: null as any,
          headers: null,
          timeoutMs: 30000,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);
      const res = await adapter.listRoutes("c1");
      expect(res[0].events).toEqual([]);
    });
  });

  describe("findRecentByDedupeKey", () => {
    it("aplica janela temporal", async () => {
      mockPrisma.inboundWebhook.findFirst.mockResolvedValue(null);
      await adapter.findRecentByDedupeKey("k", 60_000);
      const call = mockPrisma.inboundWebhook.findFirst.mock.calls[0][0]!;
      expect(call.where).toMatchObject({ dedupeKey: "k" });
      expect((call.where as any)!.createdAt).toMatchObject({ gt: expect.any(Date) });
    });
  });

  describe("updateRoute", () => {
    it("scoped por companyId antes de update", async () => {
      mockPrisma.webhookRoute.findFirst.mockResolvedValue({
        id: "r1",
        companyId: "c1",
        name: "n",
        icon: "i",
        url: "https://x",
        secretKey: null,
        events: ["a"],
        headers: {},
        timeoutMs: 30000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockPrisma.webhookRoute.update.mockResolvedValue({
        id: "r1",
        companyId: "c1",
        name: "nn",
        icon: "i",
        url: "https://x",
        secretKey: null,
        events: ["a"],
        headers: {},
        timeoutMs: 30000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      const res = await adapter.updateRoute("r1", "c1", { name: "nn" });
      expect(mockPrisma.webhookRoute.findFirst).toHaveBeenCalledWith({
        where: { id: "r1", companyId: "c1" },
      });
      expect(mockPrisma.webhookRoute.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "r1" } }),
      );
      expect(res.name).toBe("nn");
    });

    it("lanca route_not_found se findFirst vazio", async () => {
      mockPrisma.webhookRoute.findFirst.mockResolvedValue(null);
      await expect(adapter.updateRoute("r1", "c1", { name: "x" })).rejects.toThrow(
        "route_not_found",
      );
    });
  });

  describe("persistInboundAndDeliveries", () => {
    it("lanca company_id_mismatch se delivery diverge", async () => {
      await expect(
        adapter.persistInboundAndDeliveries(
          {
            companyId: "c1",
            receivedAt: new Date(),
            rawBody: "{}",
            rawPayload: {},
            eventType: "x",
            dedupeKey: "k",
            processingStatus: "received" as any,
          },
          [{ routeId: "r1", companyId: "c2", status: "pending" as any }],
        ),
      ).rejects.toThrow("company_id_mismatch");
    });

    it("captura P2002 e retorna inbound existente com deliveries vazias", async () => {
      mockPrisma.$transaction.mockRejectedValue({ code: "P2002" });
      mockPrisma.inboundWebhook.findFirst.mockResolvedValue({
        id: "ib_existing",
        companyId: "c1",
        receivedAt: new Date(),
        rawBody: "",
        rawPayload: {},
        eventType: "x",
        dedupeKey: "k",
        processingStatus: "received",
        createdAt: new Date(),
      } as any);
      const res = await adapter.persistInboundAndDeliveries(
        {
          companyId: "c1",
          receivedAt: new Date(),
          rawBody: "{}",
          rawPayload: {},
          eventType: "x",
          dedupeKey: "k",
          processingStatus: "received" as any,
        },
        [],
      );
      expect(res.inbound.id).toBe("ib_existing");
      expect(res.deliveries).toEqual([]);
    });
  });
});
