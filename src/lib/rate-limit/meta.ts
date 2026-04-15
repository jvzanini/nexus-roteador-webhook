import { redis } from "@/lib/redis";

const LIMIT = 10;
const WINDOW_SECONDS = 60;
const LOCK_TTL_SECONDS = 30;

export interface RateResult {
  allowed: boolean;
  remaining: number;
}

export async function enforceMetaRateLimit(companyId: string): Promise<RateResult> {
  const key = `meta:rl:${companyId}`;
  const multi = redis.multi();
  multi.incr(key);
  multi.expire(key, WINDOW_SECONDS);
  const results = await multi.exec();
  const count = Number((results as Array<[Error | null, unknown]> | null)?.[0]?.[1] ?? 1);
  return {
    allowed: count <= LIMIT,
    remaining: Math.max(0, LIMIT - count),
  };
}

export async function acquireMetaLock(companyId: string): Promise<boolean> {
  const key = `meta:lock:${companyId}`;
  const r = await redis.set(key, "1", "EX", LOCK_TTL_SECONDS, "NX");
  return r === "OK";
}

export async function releaseMetaLock(companyId: string): Promise<void> {
  await redis.del(`meta:lock:${companyId}`);
}
