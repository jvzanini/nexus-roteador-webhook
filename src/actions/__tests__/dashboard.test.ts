import { prismaMock } from "@/lib/__mocks__/prisma-mock";

// Mock prisma
jest.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

// Mock auth
const mockGetCurrentUser = jest.fn();
jest.mock("@/lib/auth", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock tenant
const mockGetAccessibleCompanyIds = jest.fn();
const mockAssertCompanyAccess = jest.fn();
jest.mock("@/lib/tenant", () => ({
  getAccessibleCompanyIds: (...args: any[]) => mockGetAccessibleCompanyIds(...args),
  buildTenantFilter: jest.requireActual("@/lib/tenant").buildTenantFilter,
  assertCompanyAccess: (...args: any[]) => mockAssertCompanyAccess(...args),
}));

// Importar depois dos mocks
import { getDashboardData } from "../dashboard";

describe("getDashboardData", () => {
  const superAdmin = { id: "user-1", name: "Admin", email: "admin@test.com", isSuperAdmin: true, avatarUrl: null, theme: "dark" };
  const normalUser = { id: "user-2", name: "User", email: "user@test.com", isSuperAdmin: false, avatarUrl: null, theme: "dark" };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(superAdmin);
    mockGetAccessibleCompanyIds.mockResolvedValue(undefined); // super admin
  });

  it("retorna erro se usuário não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await getDashboardData();
    expect(result).toEqual({ success: false, error: "Não autenticado" });
  });

  it("retorna stats com dados reais para super admin", async () => {
    // Stats: contagem de InboundWebhook
    prismaMock.inboundWebhook.count
      .mockResolvedValueOnce(100)  // período atual
      .mockResolvedValueOnce(80);  // período anterior

    // Stats: contagem de RouteDelivery por status
    prismaMock.routeDelivery.count
      .mockResolvedValueOnce(90)   // delivered atual
      .mockResolvedValueOnce(10)   // failed atual
      .mockResolvedValueOnce(70)   // delivered anterior
      .mockResolvedValueOnce(8);   // failed anterior

    // Chart: groupBy
    prismaMock.routeDelivery.groupBy.mockResolvedValue([]);

    // Top errors: deliveryAttempt.findMany
    prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);

    // Recent deliveries
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.routeDelivery.count.mockResolvedValueOnce(0);

    // Companies para filtro
    prismaMock.company.findMany.mockResolvedValue([]);

    const result = await getDashboardData();

    expect(result.success).toBe(true);
    expect(result.data?.stats.webhooksReceived).toBe(100);
    expect(result.data?.stats.deliveriesCompleted).toBe(90);
    expect(result.data?.stats.deliveriesFailed).toBe(10);
    expect(result.data?.stats.deliverySuccessRate).toBe(90.0);
    expect(result.data?.stats.comparison.webhooksReceived).toBe(25.0); // (100-80)/80*100
  });

  it("retorna comparison null quando período anterior é zero", async () => {
    prismaMock.inboundWebhook.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(0);  // anterior = 0

    prismaMock.routeDelivery.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)  // anterior delivered = 0
      .mockResolvedValueOnce(0); // anterior failed = 0

    prismaMock.routeDelivery.groupBy.mockResolvedValue([]);
    prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.routeDelivery.count.mockResolvedValueOnce(0);
    prismaMock.company.findMany.mockResolvedValue([]);

    const result = await getDashboardData();

    expect(result.data?.stats.comparison.webhooksReceived).toBeNull();
  });

  it("retorna deliverySuccessRate null quando não há entregas", async () => {
    prismaMock.inboundWebhook.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    prismaMock.routeDelivery.count
      .mockResolvedValueOnce(0)  // delivered = 0
      .mockResolvedValueOnce(0)  // failed = 0
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    prismaMock.routeDelivery.groupBy.mockResolvedValue([]);
    prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.routeDelivery.count.mockResolvedValueOnce(0);
    prismaMock.company.findMany.mockResolvedValue([]);

    const result = await getDashboardData();

    expect(result.data?.stats.deliverySuccessRate).toBeNull();
  });

  it("filtra por empresa quando companyId fornecido", async () => {
    prismaMock.inboundWebhook.count.mockResolvedValue(0);
    prismaMock.routeDelivery.count.mockResolvedValue(0);
    prismaMock.routeDelivery.groupBy.mockResolvedValue([]);
    prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([]);

    await getDashboardData("company-123", "today");

    // Verifica que inboundWebhook.count foi chamado com companyId
    expect(prismaMock.inboundWebhook.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: "company-123" }),
      })
    );
  });

  it("aplica tenant scoping para usuário normal", async () => {
    mockGetCurrentUser.mockResolvedValue(normalUser);
    mockGetAccessibleCompanyIds.mockResolvedValue(["comp-1", "comp-2"]);

    prismaMock.inboundWebhook.count.mockResolvedValue(0);
    prismaMock.routeDelivery.count.mockResolvedValue(0);
    prismaMock.routeDelivery.groupBy.mockResolvedValue([]);
    prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([]);

    await getDashboardData();

    // Verifica que inboundWebhook.count inclui filtro de tenant
    expect(prismaMock.inboundWebhook.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: { in: ["comp-1", "comp-2"] },
        }),
      })
    );
  });
});
