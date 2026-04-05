import { redis } from "./redis";

// Canal único para eventos real-time
const CHANNEL = "nexus:realtime";

export type RealtimeEvent =
  | { type: "delivery:completed"; companyId: string }
  | { type: "delivery:failed"; companyId: string }
  | { type: "notification:new"; userId: string }
  | { type: "webhook:received"; companyId: string };

export async function publishRealtimeEvent(event: RealtimeEvent): Promise<void> {
  try {
    await redis.publish(CHANNEL, JSON.stringify(event));
  } catch (err) {
    // Best-effort — nunca deve falhar operações principais
    console.error("[realtime] Falha ao publicar evento:", (err as Error).message);
  }
}

export { CHANNEL };
