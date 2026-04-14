import { prisma } from "@/lib/prisma";
import { webhookDeliveryQueue } from "@/lib/queue";

export interface InboundEntry {
  inboundWebhookId: string;
  deliveryIds: string[];
}

/**
 * Enfileira deliveries no BullMQ + atualiza processing_status=queued no inbound.
 *
 * Best-effort: falhas no Redis sao logadas mas nao propagadas. Orphan-recovery
 * worker periodico reprocessa inbounds com status=received e deliveries pending.
 */
export async function enqueueDeliveries(
  entries: InboundEntry[],
  companyId: string,
): Promise<void> {
  for (const entry of entries) {
    if (entry.deliveryIds.length === 0) continue;
    try {
      await Promise.all(
        entry.deliveryIds.map((id) =>
          webhookDeliveryQueue.add(
            "deliver",
            { routeDeliveryId: id, inboundWebhookId: entry.inboundWebhookId, companyId },
            { jobId: `delivery-${id}`, attempts: 1 },
          ),
        ),
      );
      await prisma.inboundWebhook.update({
        where: { id: entry.inboundWebhookId },
        data: { processingStatus: "queued" },
      });
    } catch (e) {
      console.error(
        `[webhook-ingest] enqueue_fail inbound=${entry.inboundWebhookId}`,
        e,
      );
    }
  }
}
