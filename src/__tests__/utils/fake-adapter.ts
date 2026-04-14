import type {
  WebhookAdapter,
  WebhookRouteRecord,
  InboundWebhookRecord,
  RouteDeliveryRecord,
} from "@nexusai360/webhook-routing";

export interface FakeAdapterSeed {
  routes?: WebhookRouteRecord[];
  existing?: InboundWebhookRecord[];
}

export interface FakeAdapterInstance extends WebhookAdapter {
  readonly inbound: InboundWebhookRecord[];
  readonly deliveries: RouteDeliveryRecord[];
}

/**
 * Adapter in-memory para testes. Implementa WebhookAdapter do pacote sem
 * tocar Prisma, permitindo assertions determinísticas sobre o pipeline.
 */
export function makeFakeAdapter(seed: FakeAdapterSeed = {}): FakeAdapterInstance {
  const routes: WebhookRouteRecord[] = [...(seed.routes ?? [])];
  const inbound: InboundWebhookRecord[] = [...(seed.existing ?? [])];
  const deliveries: RouteDeliveryRecord[] = [];
  let idCounter = 0;
  const nextId = () => `id_${++idCounter}`;

  const adapter: FakeAdapterInstance = {
    get inbound() {
      return inbound;
    },
    get deliveries() {
      return deliveries;
    },
    async listRoutes(companyId, opts) {
      return routes.filter(
        (r) => r.companyId === companyId && (!opts?.onlyActive || r.isActive),
      );
    },
    async findRoute(id, companyId) {
      return routes.find((r) => r.id === id && r.companyId === companyId) ?? null;
    },
    async findRouteByName(name, companyId) {
      return routes.find((r) => r.name === name && r.companyId === companyId) ?? null;
    },
    async findRouteByUrl(url, companyId) {
      return routes.find((r) => r.url === url && r.companyId === companyId) ?? null;
    },
    async createRoute() {
      throw new Error("createRoute not impl in fake adapter");
    },
    async updateRoute() {
      throw new Error("updateRoute not impl in fake adapter");
    },
    async deleteRoute() {},
    async findRecentByDedupeKey(dedupeKey, windowMs) {
      const since = Date.now() - windowMs;
      return (
        inbound.find(
          (i) => i.dedupeKey === dedupeKey && i.receivedAt.getTime() > since,
        ) ?? null
      );
    },
    async persistInboundAndDeliveries(ib, ds) {
      const created: InboundWebhookRecord = { ...ib, id: nextId() };
      inbound.push(created);
      const newDs: RouteDeliveryRecord[] = ds.map((d) => ({
        ...d,
        id: nextId(),
        inboundWebhookId: created.id,
        createdAt: new Date(),
      }));
      deliveries.push(...newDs);
      return { inbound: created, deliveries: newDs };
    },
    async markDelivery() {},
  };
  return adapter;
}
