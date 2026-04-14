import type {
  WebhookAdapter,
  WebhookRouteRecord,
  InboundWebhookRecord,
  RouteDeliveryRecord,
  DeliveryStatus,
} from "@nexusai360/webhook-routing";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const eventsSchema = z.array(z.string());

function mapRoute(raw: any): WebhookRouteRecord {
  const parsed = eventsSchema.safeParse(raw.events);
  if (!parsed.success) {
    console.warn(`[webhook-adapter] route_events_invalid route=${raw.id}`);
  }
  return {
    id: raw.id,
    companyId: raw.companyId,
    name: raw.name,
    url: raw.url,
    secretKey: raw.secretKey,
    events: parsed.success ? parsed.data : [],
    headers: (raw.headers ?? {}) as Record<string, string>,
    timeoutMs: raw.timeoutMs,
    isActive: raw.isActive,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function mapInbound(raw: any): InboundWebhookRecord {
  const rawStatus = raw.processingStatus;
  // Pacote so conhece: received | no_routes | duplicate
  // Roteador tem: received | queued | processed | no_routes
  // Mapeia queued/processed -> received (estado logico equivalente para o pacote).
  const processingStatus: InboundWebhookRecord["processingStatus"] =
    rawStatus === "no_routes"
      ? "no_routes"
      : rawStatus === "duplicate"
        ? "duplicate"
        : "received";
  return {
    id: raw.id,
    companyId: raw.companyId,
    receivedAt: raw.receivedAt,
    rawBody: raw.rawBody ?? "",
    rawPayload: raw.rawPayload,
    eventType: raw.eventType,
    dedupeKey: raw.dedupeKey,
    processingStatus,
  };
}

function mapDelivery(raw: any): RouteDeliveryRecord {
  return {
    id: raw.id,
    inboundWebhookId: raw.inboundWebhookId,
    routeId: raw.routeId,
    companyId: raw.companyId,
    status: raw.status as DeliveryStatus,
    createdAt: raw.createdAt,
  };
}

export class PrismaWebhookAdapter implements WebhookAdapter {
  async listRoutes(
    companyId: string,
    opts?: { onlyActive?: boolean },
  ): Promise<WebhookRouteRecord[]> {
    const rows = await prisma.webhookRoute.findMany({
      where: { companyId, ...(opts?.onlyActive ? { isActive: true } : {}) },
    });
    return rows.map(mapRoute);
  }

  async findRoute(id: string, companyId: string) {
    const row = await prisma.webhookRoute.findFirst({ where: { id, companyId } });
    return row ? mapRoute(row) : null;
  }

  async findRouteByName(name: string, companyId: string) {
    const row = await prisma.webhookRoute.findFirst({ where: { companyId, name } });
    return row ? mapRoute(row) : null;
  }

  async findRouteByUrl(url: string, companyId: string) {
    const row = await prisma.webhookRoute.findFirst({ where: { companyId, url } });
    return row ? mapRoute(row) : null;
  }

  async createRoute(
    data: Omit<WebhookRouteRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<WebhookRouteRecord> {
    const row = await prisma.webhookRoute.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        url: data.url,
        secretKey: data.secretKey,
        events: data.events as any,
        headers: (data.headers ?? {}) as any,
        timeoutMs: data.timeoutMs,
        isActive: data.isActive,
        icon: "default",
      } as any,
    });
    return mapRoute(row);
  }

  async updateRoute(
    id: string,
    companyId: string,
    patch: Partial<Omit<WebhookRouteRecord, "id" | "companyId" | "createdAt" | "updatedAt">>,
  ): Promise<WebhookRouteRecord> {
    // Prisma exige where com campo unico. companyId nao e unique.
    // Padrao: findFirst(scoped) -> update por id.
    const existing = await prisma.webhookRoute.findFirst({ where: { id, companyId } });
    if (!existing) throw new Error("route_not_found");
    const data: any = { ...patch };
    if (patch.events !== undefined) data.events = patch.events as any;
    if (patch.headers !== undefined) data.headers = patch.headers as any;
    const row = await prisma.webhookRoute.update({
      where: { id },
      data,
    });
    return mapRoute(row);
  }

  async deleteRoute(id: string, companyId: string) {
    await prisma.webhookRoute.deleteMany({ where: { id, companyId } });
  }

  async findRecentByDedupeKey(dedupeKey: string, windowMs: number) {
    const since = new Date(Date.now() - windowMs);
    const row = await prisma.inboundWebhook.findFirst({
      where: { dedupeKey, createdAt: { gt: since } },
    });
    return row ? mapInbound(row) : null;
  }

  async persistInboundAndDeliveries(
    inbound: Omit<InboundWebhookRecord, "id">,
    deliveries: Array<Omit<RouteDeliveryRecord, "id" | "inboundWebhookId" | "createdAt">>,
  ): Promise<{ inbound: InboundWebhookRecord; deliveries: RouteDeliveryRecord[] }> {
    for (const d of deliveries) {
      if (d.companyId !== inbound.companyId) {
        console.error(
          `[webhook-adapter] companyId_mismatch route=${d.routeId} inbound_company=${inbound.companyId} delivery_company=${d.companyId}`,
        );
        throw new Error("company_id_mismatch");
      }
    }
    try {
      return await prisma.$transaction(async (tx) => {
        const ib = await tx.inboundWebhook.create({
          data: {
            companyId: inbound.companyId,
            receivedAt: inbound.receivedAt,
            rawBody: inbound.rawBody,
            rawPayload: inbound.rawPayload as any,
            eventType: inbound.eventType,
            dedupeKey: inbound.dedupeKey,
            processingStatus: (inbound.processingStatus === "duplicate"
              ? "received"
              : inbound.processingStatus) as any,
          },
        });
        const ds: RouteDeliveryRecord[] = [];
        for (const d of deliveries) {
          const created = await tx.routeDelivery.create({
            data: {
              inboundWebhookId: ib.id,
              routeId: d.routeId,
              companyId: d.companyId,
              status: d.status as any,
            },
          });
          ds.push(mapDelivery(created));
        }
        return { inbound: mapInbound(ib), deliveries: ds };
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        const existing = await prisma.inboundWebhook.findFirst({
          where: { companyId: inbound.companyId, dedupeKey: inbound.dedupeKey },
        });
        if (existing) return { inbound: mapInbound(existing), deliveries: [] };
      }
      throw e;
    }
  }

  async markDelivery(
    deliveryId: string,
    status: DeliveryStatus,
    attempt?: { statusCode?: number; error?: string; durationMs?: number },
  ): Promise<void> {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.routeDelivery.update({
        where: { id: deliveryId },
        data: {
          status: status as any,
          ...(status === "delivered" ? { deliveredAt: now } : {}),
          ...(attempt?.statusCode ? { finalHttpStatus: attempt.statusCode } : {}),
          lastAttemptAt: now,
        },
      });
      if (attempt) {
        const delivery = await tx.routeDelivery.findUnique({ where: { id: deliveryId } });
        if (delivery) {
          await tx.deliveryAttempt.create({
            data: {
              routeDeliveryId: deliveryId,
              attemptNumber: (delivery.totalAttempts ?? 0) + 1,
              startedAt: now,
              finishedAt: now,
              durationMs: attempt.durationMs ?? 0,
              httpStatus: attempt.statusCode,
              errorMessage: attempt.error,
            },
          });
        }
      }
    });
  }
}

export const webhookAdapter = new PrismaWebhookAdapter();
