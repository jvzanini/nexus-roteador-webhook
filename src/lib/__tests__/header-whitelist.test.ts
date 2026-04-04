import {
  isHeaderAllowed,
  getBlockedHeaders,
  BLOCKED_HEADERS,
} from "../constants/header-whitelist";

describe("isHeaderAllowed", () => {
  it("bloqueia headers da lista", () => {
    expect(isHeaderAllowed("Host")).toBe(false);
    expect(isHeaderAllowed("Authorization")).toBe(false);
    expect(isHeaderAllowed("Cookie")).toBe(false);
    expect(isHeaderAllowed("Connection")).toBe(false);
    expect(isHeaderAllowed("Transfer-Encoding")).toBe(false);
    expect(isHeaderAllowed("Content-Length")).toBe(false);
  });

  it("bloqueia headers case-insensitive", () => {
    expect(isHeaderAllowed("host")).toBe(false);
    expect(isHeaderAllowed("HOST")).toBe(false);
    expect(isHeaderAllowed("Host")).toBe(false);
    expect(isHeaderAllowed("AUTHORIZATION")).toBe(false);
  });

  it("permite headers customizados validos", () => {
    expect(isHeaderAllowed("X-Custom-Header")).toBe(true);
    expect(isHeaderAllowed("X-Api-Key")).toBe(true);
    expect(isHeaderAllowed("Content-Type")).toBe(true);
    expect(isHeaderAllowed("Accept")).toBe(true);
    expect(isHeaderAllowed("X-Webhook-Secret")).toBe(true);
  });

  it("trata whitespace", () => {
    expect(isHeaderAllowed("  host  ")).toBe(false);
    expect(isHeaderAllowed("  X-Custom  ")).toBe(true);
  });
});

describe("getBlockedHeaders", () => {
  it("retorna lista vazia quando nenhum header eh bloqueado", () => {
    const headers = [
      { key: "X-Custom", value: "a" },
      { key: "Content-Type", value: "application/json" },
    ];
    expect(getBlockedHeaders(headers)).toEqual([]);
  });

  it("retorna headers bloqueados encontrados", () => {
    const headers = [
      { key: "X-Custom", value: "a" },
      { key: "Host", value: "evil.com" },
      { key: "Authorization", value: "Bearer xxx" },
    ];
    const blocked = getBlockedHeaders(headers);
    expect(blocked).toContain("Host");
    expect(blocked).toContain("Authorization");
    expect(blocked).toHaveLength(2);
  });
});

describe("BLOCKED_HEADERS", () => {
  it("contem pelo menos os headers criticos", () => {
    const critical = ["host", "authorization", "cookie", "proxy-authorization"];
    for (const header of critical) {
      expect(BLOCKED_HEADERS).toContain(header);
    }
  });

  it("todos os itens estao em lowercase", () => {
    for (const header of BLOCKED_HEADERS) {
      expect(header).toBe(header.toLowerCase());
    }
  });
});
