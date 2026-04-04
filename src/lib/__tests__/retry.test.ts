import {
  isRetriableStatus,
  isRetriableError,
  calculateBackoffMs,
  applyJitter,
  getNextRetryDelay,
  RetryConfig,
  RETRIABLE_STATUS_CODES,
  NON_RETRIABLE_REDIRECT_CODES,
} from "../retry";

describe("retry", () => {
  describe("RETRIABLE_STATUS_CODES", () => {
    it("includes all expected retriable codes", () => {
      expect(RETRIABLE_STATUS_CODES).toEqual(
        new Set([408, 409, 425, 429, 500, 502, 503, 504])
      );
    });
  });

  describe("NON_RETRIABLE_REDIRECT_CODES", () => {
    it("includes redirect status codes", () => {
      expect(NON_RETRIABLE_REDIRECT_CODES).toEqual(
        new Set([301, 302, 307, 308])
      );
    });
  });

  describe("isRetriableStatus", () => {
    it.each([408, 409, 425, 429, 500, 502, 503, 504])(
      "returns true for retriable status %d",
      (status) => {
        expect(isRetriableStatus(status)).toBe(true);
      }
    );

    it.each([200, 201, 204, 301, 302, 307, 308, 400, 401, 403, 404, 405, 422])(
      "returns false for non-retriable status %d",
      (status) => {
        expect(isRetriableStatus(status)).toBe(false);
      }
    );

    it("returns false for null (no HTTP response — handled by isRetriableError)", () => {
      expect(isRetriableStatus(null)).toBe(false);
    });
  });

  describe("isRetriableError", () => {
    it("returns true for timeout errors", () => {
      const error = new Error("timeout of 30000ms exceeded");
      (error as any).code = "ECONNABORTED";
      expect(isRetriableError(error)).toBe(true);
    });

    it("returns true for network errors (ECONNREFUSED)", () => {
      const error = new Error("connect ECONNREFUSED 127.0.0.1:3000");
      (error as any).code = "ECONNREFUSED";
      expect(isRetriableError(error)).toBe(true);
    });

    it("returns true for network errors (ECONNRESET)", () => {
      const error = new Error("socket hang up");
      (error as any).code = "ECONNRESET";
      expect(isRetriableError(error)).toBe(true);
    });

    it("returns true for DNS resolution errors (ENOTFOUND)", () => {
      const error = new Error("getaddrinfo ENOTFOUND example.com");
      (error as any).code = "ENOTFOUND";
      expect(isRetriableError(error)).toBe(true);
    });

    it("returns true for ETIMEDOUT errors", () => {
      const error = new Error("connect ETIMEDOUT");
      (error as any).code = "ETIMEDOUT";
      expect(isRetriableError(error)).toBe(true);
    });

    it("returns false for generic errors without network code", () => {
      const error = new Error("something went wrong");
      expect(isRetriableError(error)).toBe(false);
    });

    it("returns false for non-Error objects", () => {
      expect(isRetriableError("string error")).toBe(false);
    });
  });

  describe("applyJitter", () => {
    it("returns value within ±20% range", () => {
      const baseMs = 10000;
      const results = new Set<number>();

      // Rodar 100 vezes para cobrir range
      for (let i = 0; i < 100; i++) {
        const jittered = applyJitter(baseMs);
        results.add(jittered);
        expect(jittered).toBeGreaterThanOrEqual(baseMs * 0.8);
        expect(jittered).toBeLessThanOrEqual(baseMs * 1.2);
      }

      // Deve ter variação (não retornar sempre o mesmo valor)
      expect(results.size).toBeGreaterThan(1);
    });

    it("returns integer milliseconds", () => {
      for (let i = 0; i < 50; i++) {
        const jittered = applyJitter(10000);
        expect(Number.isInteger(jittered)).toBe(true);
      }
    });

    it("handles zero base", () => {
      expect(applyJitter(0)).toBe(0);
    });

    it("handles small values", () => {
      const jittered = applyJitter(100);
      expect(jittered).toBeGreaterThanOrEqual(80);
      expect(jittered).toBeLessThanOrEqual(120);
    });
  });

  describe("calculateBackoffMs", () => {
    const defaultConfig: RetryConfig = {
      maxRetries: 3,
      intervalsSeconds: [10, 30, 90],
      strategy: "exponential",
      jitterEnabled: true,
    };

    it("returns interval from array for exponential strategy", () => {
      // attemptNumber 1 = primeiro retry, usa intervalsSeconds[0]
      const delay = calculateBackoffMs(1, { ...defaultConfig, jitterEnabled: false });
      expect(delay).toBe(10_000); // 10s em ms
    });

    it("returns second interval for second retry", () => {
      const delay = calculateBackoffMs(2, { ...defaultConfig, jitterEnabled: false });
      expect(delay).toBe(30_000); // 30s
    });

    it("returns third interval for third retry", () => {
      const delay = calculateBackoffMs(3, { ...defaultConfig, jitterEnabled: false });
      expect(delay).toBe(90_000); // 90s
    });

    it("uses last interval if attempt exceeds array length", () => {
      const delay = calculateBackoffMs(5, { ...defaultConfig, jitterEnabled: false });
      expect(delay).toBe(90_000); // último da array
    });

    it("applies jitter when enabled", () => {
      const results = new Set<number>();
      for (let i = 0; i < 50; i++) {
        results.add(calculateBackoffMs(1, defaultConfig));
      }
      // Com jitter, deve ter variação
      expect(results.size).toBeGreaterThan(1);

      // Todos devem estar dentro de ±20% de 10000
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(8_000);
        expect(r).toBeLessThanOrEqual(12_000);
      }
    });

    it("uses fixed strategy correctly", () => {
      const fixedConfig: RetryConfig = {
        ...defaultConfig,
        strategy: "fixed",
        jitterEnabled: false,
      };
      // Fixed usa sempre o primeiro intervalo
      expect(calculateBackoffMs(1, fixedConfig)).toBe(10_000);
      expect(calculateBackoffMs(2, fixedConfig)).toBe(10_000);
      expect(calculateBackoffMs(3, fixedConfig)).toBe(10_000);
    });
  });

  describe("getNextRetryDelay", () => {
    const defaultConfig: RetryConfig = {
      maxRetries: 3,
      intervalsSeconds: [10, 30, 90],
      strategy: "exponential",
      jitterEnabled: false,
    };

    it("returns delay for retriable attempt within limit", () => {
      const result = getNextRetryDelay(1, defaultConfig);
      expect(result).not.toBeNull();
      expect(result!.delayMs).toBe(10_000);
      expect(result!.shouldRetry).toBe(true);
    });

    it("returns null when max retries exhausted", () => {
      // attemptNumber > maxRetries = sem mais retries
      const result = getNextRetryDelay(4, defaultConfig);
      expect(result).toBeNull();
    });

    it("returns null when attemptNumber equals maxRetries + 1", () => {
      const result = getNextRetryDelay(4, defaultConfig);
      expect(result).toBeNull();
    });

    it("returns delay for last retry", () => {
      const result = getNextRetryDelay(3, defaultConfig);
      expect(result).not.toBeNull();
      expect(result!.delayMs).toBe(90_000);
    });
  });
});
