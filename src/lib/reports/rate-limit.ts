import { redis } from "@/lib/redis";

const EXPORT_LOCK_TTL_SECONDS = 300;

function keyFor(userId: string): string {
  return `report:export:${userId}`;
}

export async function acquireExportLock(userId: string): Promise<boolean> {
  const result = await redis.set(
    keyFor(userId),
    "1",
    "EX",
    EXPORT_LOCK_TTL_SECONDS,
    "NX"
  );
  return result === "OK";
}

export async function releaseExportLock(userId: string): Promise<void> {
  await redis.del(keyFor(userId));
}
