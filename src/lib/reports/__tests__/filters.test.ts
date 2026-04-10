import {
  LogsFiltersSchema,
  CompaniesFiltersSchema,
  RoutesFiltersSchema,
  UsersFiltersSchema,
  parseFiltersFromSearchParams,
} from "../filters";

describe("LogsFiltersSchema", () => {
  const base = {
    dateFrom: "2026-01-01T00:00:00Z",
    dateTo: "2026-01-31T23:59:59Z",
  };

  it("aceita range válido dentro de 90 dias", () => {
    expect(() => LogsFiltersSchema.parse(base)).not.toThrow();
  });

  it("rejeita dateFrom > dateTo", () => {
    expect(() =>
      LogsFiltersSchema.parse({
        dateFrom: "2026-02-01",
        dateTo: "2026-01-01",
      })
    ).toThrow();
  });

  it("rejeita range maior que 90 dias", () => {
    expect(() =>
      LogsFiltersSchema.parse({
        dateFrom: "2026-01-01",
        dateTo: "2026-05-01",
      })
    ).toThrow(/90 dias/);
  });

  it("aceita companyId UUID opcional", () => {
    expect(() =>
      LogsFiltersSchema.parse({
        ...base,
        companyId: "550e8400-e29b-41d4-a716-446655440000",
      })
    ).not.toThrow();
  });

  it("rejeita companyId não-UUID", () => {
    expect(() =>
      LogsFiltersSchema.parse({ ...base, companyId: "xyz" })
    ).toThrow();
  });

  it("aceita array de statuses válidos", () => {
    expect(() =>
      LogsFiltersSchema.parse({
        ...base,
        statuses: ["delivered", "failed"],
      })
    ).not.toThrow();
  });

  it("rejeita status inválido", () => {
    expect(() =>
      LogsFiltersSchema.parse({ ...base, statuses: ["foo"] as any })
    ).toThrow();
  });
});

describe("CompaniesFiltersSchema", () => {
  it("aceita objeto vazio", () => {
    expect(() => CompaniesFiltersSchema.parse({})).not.toThrow();
  });
});

describe("RoutesFiltersSchema", () => {
  it("aceita sem filtros", () => {
    expect(() => RoutesFiltersSchema.parse({})).not.toThrow();
  });

  it("aceita companyId UUID", () => {
    expect(() =>
      RoutesFiltersSchema.parse({
        companyId: "550e8400-e29b-41d4-a716-446655440000",
      })
    ).not.toThrow();
  });
});

describe("UsersFiltersSchema", () => {
  it("aceita sem filtros", () => {
    expect(() => UsersFiltersSchema.parse({})).not.toThrow();
  });

  it("aceita platformRole válido", () => {
    expect(() =>
      UsersFiltersSchema.parse({ platformRole: "admin" })
    ).not.toThrow();
  });

  it("rejeita platformRole inválido", () => {
    expect(() =>
      UsersFiltersSchema.parse({ platformRole: "root" } as any)
    ).toThrow();
  });
});

describe("parseFiltersFromSearchParams", () => {
  it("parseia logs com todos os filtros", () => {
    const params = new URLSearchParams(
      "dateFrom=2026-01-01&dateTo=2026-01-31&companyId=550e8400-e29b-41d4-a716-446655440000&statuses=delivered,failed&eventTypes=messages,statuses"
    );
    const result = parseFiltersFromSearchParams("logs", params) as any;
    expect(result.dateFrom).toBe("2026-01-01");
    expect(result.dateTo).toBe("2026-01-31");
    expect(result.statuses).toEqual(["delivered", "failed"]);
    expect(result.eventTypes).toEqual(["messages", "statuses"]);
  });

  it("parseia companies como objeto vazio", () => {
    expect(parseFiltersFromSearchParams("companies", new URLSearchParams())).toEqual({});
  });

  it("retorna null para tipo inválido", () => {
    expect(parseFiltersFromSearchParams("foo", new URLSearchParams())).toBeNull();
  });
});
