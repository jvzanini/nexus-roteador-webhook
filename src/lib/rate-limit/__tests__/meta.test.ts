import { enforceMetaRateLimit, acquireMetaLock, releaseMetaLock } from "../meta";

jest.mock("@/lib/redis", () => {
  const store = new Map<string, string>();
  return {
    redis: {
      multi: () => {
        const ops: Array<() => Promise<unknown>> = [];
        const self: any = {
          incr: (k: string) => { ops.push(async () => { const n = (parseInt(store.get(k) ?? "0", 10) || 0) + 1; store.set(k, String(n)); return n; }); return self; },
          expire: (_k: string, _s: number) => { ops.push(async () => 1); return self; },
          exec: async () => { const r: Array<[Error | null, unknown]> = []; for (const o of ops) r.push([null, await o()]); return r; },
        };
        return self;
      },
      set: async (k: string, v: string, ..._args: unknown[]) => {
        if (_args.includes("NX") && store.has(k)) return null;
        store.set(k, v);
        return "OK";
      },
      del: async (k: string) => { store.delete(k); return 1; },
      __store: store,
    },
  };
});

describe("enforceMetaRateLimit", () => {
  beforeEach(() => {
    const m = jest.requireMock("@/lib/redis") as { redis: { __store: Map<string, string> } };
    m.redis.__store.clear();
  });

  it("permite 10 calls e bloqueia 11a", async () => {
    for (let i = 1; i <= 10; i++) {
      const r = await enforceMetaRateLimit("c1");
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(10 - i);
    }
    const r11 = await enforceMetaRateLimit("c1");
    expect(r11.allowed).toBe(false);
  });

  it("chaves separadas por empresa", async () => {
    for (let i = 0; i < 10; i++) await enforceMetaRateLimit("c1");
    const r = await enforceMetaRateLimit("c2");
    expect(r.allowed).toBe(true);
  });
});

describe("acquireMetaLock / releaseMetaLock", () => {
  beforeEach(() => {
    const m = jest.requireMock("@/lib/redis") as { redis: { __store: Map<string, string> } };
    m.redis.__store.clear();
  });

  it("adquire uma vez e falha na segunda", async () => {
    expect(await acquireMetaLock("c1")).toBe(true);
    expect(await acquireMetaLock("c1")).toBe(false);
    await releaseMetaLock("c1");
    expect(await acquireMetaLock("c1")).toBe(true);
  });
});
