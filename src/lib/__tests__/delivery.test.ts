// Mock external dependencies that delivery.ts imports
jest.mock("../../lib/redis", () => ({
  redis: {},
}));
jest.mock("../../lib/prisma", () => ({
  prisma: {},
}));
jest.mock("../../lib/queue", () => ({
  webhookDeliveryQueue: {},
  webhookDlqQueue: {},
}));
jest.mock("bullmq", () => ({
  Worker: jest.fn(),
  Queue: jest.fn(),
}));

import {
  buildDeliveryHeaders,
  buildDeliveryBody,
  truncateResponseBody,
  classifyDeliveryResult,
} from "../../worker/delivery";

describe("delivery worker helpers", () => {
  describe("buildDeliveryBody", () => {
    it("serializes normalized event as JSON string", () => {
      const event = {
        event_type: "messages.text",
        entry_id: "WABA_123",
        timestamp: "1700000000",
        data: {
          from: "5511999999999",
          id: "wamid.abc123",
          type: "text",
          text: { body: "Olá" },
        },
      };

      const body = buildDeliveryBody(event);
      expect(typeof body).toBe("string");

      const parsed = JSON.parse(body);
      expect(parsed.event_type).toBe("messages.text");
      expect(parsed.data.text.body).toBe("Olá");
    });

    it("produces consistent JSON serialization", () => {
      const event = { b: 2, a: 1 };
      const body1 = buildDeliveryBody(event);
      const body2 = buildDeliveryBody(event);
      expect(body1).toBe(body2);
    });
  });

  describe("buildDeliveryHeaders", () => {
    it("includes all required X-Nexus headers", () => {
      const headers = buildDeliveryHeaders({
        deliveryId: "uuid-123",
        attemptNumber: 1,
        eventType: "messages.text",
        timestamp: "2026-04-03T00:00:00.000Z",
        signature: null,
        customHeaders: null,
      });

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["X-Nexus-Delivery-Id"]).toBe("uuid-123");
      expect(headers["X-Nexus-Attempt"]).toBe("1");
      expect(headers["X-Nexus-Event-Type"]).toBe("messages.text");
      expect(headers["X-Nexus-Timestamp"]).toBe("2026-04-03T00:00:00.000Z");
      expect(headers["X-Nexus-Signature-256"]).toBeUndefined();
    });

    it("includes signature header when provided", () => {
      const headers = buildDeliveryHeaders({
        deliveryId: "uuid-123",
        attemptNumber: 1,
        eventType: "messages.text",
        timestamp: "2026-04-03T00:00:00.000Z",
        signature: "sha256=abc123",
        customHeaders: null,
      });

      expect(headers["X-Nexus-Signature-256"]).toBe("sha256=abc123");
    });

    it("includes custom headers from route", () => {
      const headers = buildDeliveryHeaders({
        deliveryId: "uuid-123",
        attemptNumber: 1,
        eventType: "messages.text",
        timestamp: "2026-04-03T00:00:00.000Z",
        signature: null,
        customHeaders: {
          "X-Custom-Token": "my-token",
          "X-Tenant-Id": "tenant-42",
        },
      });

      expect(headers["X-Custom-Token"]).toBe("my-token");
      expect(headers["X-Tenant-Id"]).toBe("tenant-42");
    });

    it("does not allow custom headers to override X-Nexus headers", () => {
      const headers = buildDeliveryHeaders({
        deliveryId: "uuid-123",
        attemptNumber: 1,
        eventType: "messages.text",
        timestamp: "2026-04-03T00:00:00.000Z",
        signature: "sha256=real",
        customHeaders: {
          "X-Nexus-Signature-256": "sha256=fake",
          "X-Nexus-Delivery-Id": "fake-id",
          "Content-Type": "text/plain",
        },
      });

      // X-Nexus headers NÃO podem ser sobrescritos
      expect(headers["X-Nexus-Signature-256"]).toBe("sha256=real");
      expect(headers["X-Nexus-Delivery-Id"]).toBe("uuid-123");
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("truncateResponseBody", () => {
    it("returns body as-is when under 4KB", () => {
      const body = "short response";
      expect(truncateResponseBody(body)).toBe(body);
    });

    it("truncates body to 4KB with marker", () => {
      const body = "x".repeat(5000);
      const truncated = truncateResponseBody(body);
      expect(truncated.length).toBeLessThanOrEqual(4096 + 20); // 4KB + marker
      expect(truncated).toContain("[truncated]");
    });

    it("handles null/undefined body", () => {
      expect(truncateResponseBody(null)).toBeNull();
      expect(truncateResponseBody(undefined)).toBeNull();
    });

    it("handles empty string", () => {
      expect(truncateResponseBody("")).toBe("");
    });
  });

  describe("classifyDeliveryResult", () => {
    it("returns 'delivered' for 2xx status", () => {
      expect(classifyDeliveryResult(200, null)).toBe("delivered");
      expect(classifyDeliveryResult(201, null)).toBe("delivered");
      expect(classifyDeliveryResult(204, null)).toBe("delivered");
    });

    it("returns 'retriable' for retriable status codes", () => {
      expect(classifyDeliveryResult(408, null)).toBe("retriable");
      expect(classifyDeliveryResult(429, null)).toBe("retriable");
      expect(classifyDeliveryResult(500, null)).toBe("retriable");
      expect(classifyDeliveryResult(502, null)).toBe("retriable");
      expect(classifyDeliveryResult(503, null)).toBe("retriable");
      expect(classifyDeliveryResult(504, null)).toBe("retriable");
    });

    it("returns 'failed' for non-retriable 4xx status codes", () => {
      expect(classifyDeliveryResult(400, null)).toBe("failed");
      expect(classifyDeliveryResult(401, null)).toBe("failed");
      expect(classifyDeliveryResult(403, null)).toBe("failed");
      expect(classifyDeliveryResult(404, null)).toBe("failed");
      expect(classifyDeliveryResult(422, null)).toBe("failed");
    });

    it("returns 'failed' for redirect status codes", () => {
      expect(classifyDeliveryResult(301, null)).toBe("failed");
      expect(classifyDeliveryResult(302, null)).toBe("failed");
      expect(classifyDeliveryResult(307, null)).toBe("failed");
      expect(classifyDeliveryResult(308, null)).toBe("failed");
    });

    it("returns 'retriable' for network errors", () => {
      const timeoutError = new Error("timeout");
      (timeoutError as any).code = "ECONNABORTED";
      expect(classifyDeliveryResult(null, timeoutError)).toBe("retriable");

      const connRefused = new Error("refused");
      (connRefused as any).code = "ECONNREFUSED";
      expect(classifyDeliveryResult(null, connRefused)).toBe("retriable");
    });

    it("returns 'failed' for unknown errors without network code", () => {
      const error = new Error("unknown");
      expect(classifyDeliveryResult(null, error)).toBe("failed");
    });
  });
});
