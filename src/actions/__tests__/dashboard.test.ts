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

// Helper para configurar mocks padrão (chart + erros + recentDeliveries + companies vazios)
function setupDefaultMocks() {
  // Chart: findMany retorna vazio por padrão
  prismaMock.routeDelivery.findMany.mockResolvedValue([]);
  prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);
  prismaMock.company.findMany.mockResolvedValue([]);
}

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

    // Chart: findMany (apenas status e createdAt)
    prismaMock.routeDelivery.findMany
      .mockResolvedValueOnce([])   // chart
      .mockResolvedValueOnce([]);  // recent deliveries
    prismaMock.routeDelivery.count.mockResolvedValueOnce(0);

    prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);
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

    prismaMock.routeDelivery.findMany
      .mockResolvedValueOnce([])   // chart
      .mockResolvedValueOnce([]);  // recent deliveries
    prismaMock.routeDelivery.count.mockResolvedValueOnce(0);
    prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);
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

    prismaMock.routeDelivery.findMany
      .mockResolvedValueOnce([])   // chart
      .mockResolvedValueOnce([]);  // recent deliveries
    prismaMock.routeDelivery.count.mockResolvedValueOnce(0);
    prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([]);

    const result = await getDashboardData();

    expect(result.data?.stats.deliverySuccessRate).toBeNull();
  });

  it("filtra por empresa quando companyId fornecido", async () => {
    prismaMock.inboundWebhook.count.mockResolvedValue(0);
    prismaMock.routeDelivery.count.mockResolvedValue(0);
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);
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
    prismaMock.routeDelivery.findMany.mockResolvedValue([]);
    prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);
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

  describe("getChart — bucketing de deliveries", () => {
    // Data de referência fixa: 2024-01-15 (segunda-feira)
    const FIXED_DAY = new Date(Date.UTC(2024, 0, 15, 0, 0, 0, 0)); // 2024-01-15T00:00:00Z

    beforeEach(() => {
      // Freeze "hoje" para 2024-01-15T12:00:00Z
      jest.useFakeTimers();
      jest.setSystemTime(Date.UTC(2024, 0, 15, 12, 0, 0, 0));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function setupStatsCountsEmpty() {
      prismaMock.inboundWebhook.count.mockResolvedValue(0);
      prismaMock.routeDelivery.count.mockResolvedValue(0);
      prismaMock.deliveryAttempt.findMany.mockResolvedValue([]);
      prismaMock.company.findMany.mockResolvedValue([]);
    }

    it("retorna série completa de horas para period=today com zeros onde não há dados", async () => {
      setupStatsCountsEmpty();

      // Nenhuma delivery retornada pelo chart findMany
      prismaMock.routeDelivery.findMany
        .mockResolvedValueOnce([])   // chart findMany
        .mockResolvedValueOnce([]);  // recent deliveries findMany
      prismaMock.routeDelivery.count.mockResolvedValueOnce(0);

      const result = await getDashboardData(undefined, "today");

      expect(result.success).toBe(true);
      const chart = result.data!.chart;

      // Deve ter de h=0 até h=12 (hora atual), ou seja, 13 buckets
      expect(chart.length).toBe(13);

      // Todos os buckets devem ter total=0
      chart.forEach((point) => {
        expect(point.total).toBe(0);
        expect(point.delivered).toBe(0);
        expect(point.failed).toBe(0);
      });

      // Primeiro bucket deve ser 2024-01-15T00:00:00Z
      expect(chart[0].bucketStart.toISOString()).toBe("2024-01-15T00:00:00.000Z");
      // Último bucket deve ser 2024-01-15T12:00:00Z
      expect(chart[12].bucketStart.toISOString()).toBe("2024-01-15T12:00:00.000Z");
    });

    it("distribui corretamente deliveries em buckets horários", async () => {
      setupStatsCountsEmpty();

      // Deliveries em horas diferentes do dia atual
      const chartDeliveries = [
        { status: "delivered", createdAt: new Date(Date.UTC(2024, 0, 15, 2, 15, 0)) },
        { status: "delivered", createdAt: new Date(Date.UTC(2024, 0, 15, 2, 45, 0)) },
        { status: "failed",    createdAt: new Date(Date.UTC(2024, 0, 15, 2, 59, 0)) },
        { status: "delivered", createdAt: new Date(Date.UTC(2024, 0, 15, 7, 0, 0)) },
        { status: "failed",    createdAt: new Date(Date.UTC(2024, 0, 15, 11, 30, 0)) },
      ];

      prismaMock.routeDelivery.findMany
        .mockResolvedValueOnce(chartDeliveries as any)  // chart findMany
        .mockResolvedValueOnce([]);                      // recent deliveries findMany
      prismaMock.routeDelivery.count.mockResolvedValueOnce(0);

      const result = await getDashboardData(undefined, "today");

      expect(result.success).toBe(true);
      const chart = result.data!.chart;

      // Bucket h=2 deve ter total=3, delivered=2, failed=1
      const bucket2 = chart.find((p) => p.bucketStart.toISOString() === "2024-01-15T02:00:00.000Z");
      expect(bucket2).toBeDefined();
      expect(bucket2!.total).toBe(3);
      expect(bucket2!.delivered).toBe(2);
      expect(bucket2!.failed).toBe(1);

      // Bucket h=7 deve ter total=1, delivered=1
      const bucket7 = chart.find((p) => p.bucketStart.toISOString() === "2024-01-15T07:00:00.000Z");
      expect(bucket7).toBeDefined();
      expect(bucket7!.total).toBe(1);
      expect(bucket7!.delivered).toBe(1);
      expect(bucket7!.failed).toBe(0);

      // Bucket h=11 deve ter total=1, failed=1
      const bucket11 = chart.find((p) => p.bucketStart.toISOString() === "2024-01-15T11:00:00.000Z");
      expect(bucket11).toBeDefined();
      expect(bucket11!.total).toBe(1);
      expect(bucket11!.delivered).toBe(0);
      expect(bucket11!.failed).toBe(1);

      // Horas sem dados devem ter zeros (ex: h=5)
      const bucket5 = chart.find((p) => p.bucketStart.toISOString() === "2024-01-15T05:00:00.000Z");
      expect(bucket5).toBeDefined();
      expect(bucket5!.total).toBe(0);
    });

    it("retorna série completa de 7 dias para period=7d com zeros onde não há dados", async () => {
      setupStatsCountsEmpty();

      prismaMock.routeDelivery.findMany
        .mockResolvedValueOnce([])   // chart findMany
        .mockResolvedValueOnce([]);  // recent deliveries findMany
      prismaMock.routeDelivery.count.mockResolvedValueOnce(0);

      const result = await getDashboardData(undefined, "7d");

      expect(result.success).toBe(true);
      const chart = result.data!.chart;

      // 7d: range de 7 dias atrás até hoje (exclusive)
      // hoje = 2024-01-15, então range = 2024-01-08 até 2024-01-15 (exclusive) = 7 buckets
      expect(chart.length).toBe(7);

      chart.forEach((point) => {
        expect(point.total).toBe(0);
      });

      // Primeiro bucket: 2024-01-08T00:00:00Z
      expect(chart[0].bucketStart.toISOString()).toBe("2024-01-08T00:00:00.000Z");
      // Último bucket: 2024-01-14T00:00:00Z
      expect(chart[6].bucketStart.toISOString()).toBe("2024-01-14T00:00:00.000Z");
    });

    it("distribui corretamente deliveries em buckets diários para period=7d", async () => {
      setupStatsCountsEmpty();

      const chartDeliveries = [
        // Dia 2024-01-08: 2 delivered
        { status: "delivered", createdAt: new Date(Date.UTC(2024, 0, 8, 10, 0, 0)) },
        { status: "delivered", createdAt: new Date(Date.UTC(2024, 0, 8, 15, 30, 0)) },
        // Dia 2024-01-12: 1 failed
        { status: "failed",    createdAt: new Date(Date.UTC(2024, 0, 12, 9, 0, 0)) },
        // Dia 2024-01-14: 1 delivered + 1 failed
        { status: "delivered", createdAt: new Date(Date.UTC(2024, 0, 14, 8, 0, 0)) },
        { status: "failed",    createdAt: new Date(Date.UTC(2024, 0, 14, 23, 59, 59)) },
      ];

      prismaMock.routeDelivery.findMany
        .mockResolvedValueOnce(chartDeliveries as any)
        .mockResolvedValueOnce([]);
      prismaMock.routeDelivery.count.mockResolvedValueOnce(0);

      const result = await getDashboardData(undefined, "7d");

      expect(result.success).toBe(true);
      const chart = result.data!.chart;

      // Bucket 2024-01-08: total=2, delivered=2, failed=0
      const bucketJan8 = chart.find((p) => p.bucketStart.toISOString() === "2024-01-08T00:00:00.000Z");
      expect(bucketJan8!.total).toBe(2);
      expect(bucketJan8!.delivered).toBe(2);
      expect(bucketJan8!.failed).toBe(0);

      // Bucket 2024-01-12: total=1, failed=1
      const bucketJan12 = chart.find((p) => p.bucketStart.toISOString() === "2024-01-12T00:00:00.000Z");
      expect(bucketJan12!.total).toBe(1);
      expect(bucketJan12!.delivered).toBe(0);
      expect(bucketJan12!.failed).toBe(1);

      // Bucket 2024-01-14: total=2, delivered=1, failed=1
      const bucketJan14 = chart.find((p) => p.bucketStart.toISOString() === "2024-01-14T00:00:00.000Z");
      expect(bucketJan14!.total).toBe(2);
      expect(bucketJan14!.delivered).toBe(1);
      expect(bucketJan14!.failed).toBe(1);

      // Bucket 2024-01-10 (sem dados): total=0
      const bucketJan10 = chart.find((p) => p.bucketStart.toISOString() === "2024-01-10T00:00:00.000Z");
      expect(bucketJan10!.total).toBe(0);
    });
  });
});
