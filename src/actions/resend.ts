"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { assertCompanyAccess } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { webhookDeliveryQueue } from "@/lib/queue";

// --- Tipos ---

export interface ResendResult {
  created: boolean;
  enqueued: boolean;
  newDeliveryId: string;
  error?: string;
}

export interface BatchResendResult {
  created: number;
  enqueued: number;
  enqueueFailed: number;
  skipped: number;
  errors: string[];
  error?: string;
}

// --- Individual ---

export async function resendDelivery(deliveryId: string): Promise<ResendResult> {
  const user = await getCurrentUser();
  if (!user) return { created: false, enqueued: false, newDeliveryId: "", error: "Não autenticado" };

  // Buscar delivery original
  const original = await prisma.routeDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      inboundWebhookId: true,
      routeId: true,
      companyId: true,
      status: true,
    },
  });

  if (!original) {
    return { created: false, enqueued: false, newDeliveryId: "", error: `Entrega ${deliveryId} não encontrada` };
  }

  // Validar acesso
  await assertCompanyAccess(user, original.companyId);

  // Validar status
  if (original.status !== "failed") {
    return { created: false, enqueued: false, newDeliveryId: "", error: `Apenas entregas com status failed podem ser reenviadas. Status atual: ${original.status}` };
  }

  // Criar delivery derivada
  const newDelivery = await prisma.routeDelivery.create({
    data: {
      inboundWebhookId: original.inboundWebhookId,
      routeId: original.routeId,
      companyId: original.companyId,
      status: "pending",
      originDeliveryId: original.id,
    },
  });

  // Enfileirar — best-effort
  let enqueued = false;
  try {
    await webhookDeliveryQueue.add("delivery", { routeDeliveryId: newDelivery.id });
    enqueued = true;
  } catch (err) {
    console.error("[resend] Falha ao enfileirar job, orphan-recovery vai compensar:", err);
  }

  // Audit log
  logAudit({
    actorType: "user",
    actorId: user.id,
    actorLabel: user.email,
    companyId: original.companyId,
    action: "delivery.resend",
    resourceType: "route_delivery",
    resourceId: newDelivery.id,
    details: {
      originalDeliveryId: original.id,
      newDeliveryId: newDelivery.id,
      routeId: original.routeId,
      inboundWebhookId: original.inboundWebhookId,
      enqueued,
    },
  });

  return { created: true, enqueued, newDeliveryId: newDelivery.id };
}

// --- Lote ---

export async function resendDeliveries(deliveryIds: string[]): Promise<BatchResendResult> {
  const user = await getCurrentUser();
  if (!user) return { created: 0, enqueued: 0, enqueueFailed: 0, skipped: 0, errors: [], error: "Não autenticado" };

  // Deduplicar
  const uniqueIds = [...new Set(deliveryIds)];

  // Limitar a 50
  if (uniqueIds.length > 50) {
    return { created: 0, enqueued: 0, enqueueFailed: 0, skipped: 0, errors: [], error: "Máximo 50 entregas por vez" };
  }

  // Buscar todas as deliveries
  const originals = await prisma.routeDelivery.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      inboundWebhookId: true,
      routeId: true,
      companyId: true,
      status: true,
    },
  });

  const foundIds = new Set(originals.map((o) => o.id));
  const errors: string[] = [];
  const toResend: typeof originals = [];

  for (const id of uniqueIds) {
    if (!foundIds.has(id)) {
      errors.push(`${id}: não encontrada`);
      continue;
    }
    const delivery = originals.find((o) => o.id === id)!;
    if (delivery.status !== "failed") {
      errors.push(`${id}: status é ${delivery.status}, não failed`);
      continue;
    }

    // Validar acesso
    try {
      await assertCompanyAccess(user, delivery.companyId);
    } catch {
      errors.push(`${id}: sem acesso à empresa`);
      continue;
    }

    toResend.push(delivery);
  }

  const skipped = uniqueIds.length - toResend.length;

  // Criar deliveries derivadas
  let created = 0;
  let enqueued = 0;
  let enqueueFailed = 0;
  const originalIds: string[] = [];
  const newIds: string[] = [];

  for (const original of toResend) {
    const newDelivery = await prisma.routeDelivery.create({
      data: {
        inboundWebhookId: original.inboundWebhookId,
        routeId: original.routeId,
        companyId: original.companyId,
        status: "pending",
        originDeliveryId: original.id,
      },
    });

    created++;
    originalIds.push(original.id);
    newIds.push(newDelivery.id);

    try {
      await webhookDeliveryQueue.add("delivery", { routeDeliveryId: newDelivery.id });
      enqueued++;
    } catch {
      enqueueFailed++;
    }
  }

  // Audit log
  if (created > 0) {
    logAudit({
      actorType: "user",
      actorId: user.id,
      actorLabel: user.email,
      action: "delivery.resend_batch",
      resourceType: "route_delivery",
      details: { originalIds, newIds, created, enqueued, enqueueFailed, skipped },
    });
  }

  return { created, enqueued, enqueueFailed, skipped, errors };
}
