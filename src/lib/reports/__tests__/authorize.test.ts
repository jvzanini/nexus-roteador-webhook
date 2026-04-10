import {
  canAccessReportType,
  listAccessibleReportTypes,
  canAccessReportsPage,
} from "../authorize";

describe("canAccessReportsPage", () => {
  it.each([
    ["super_admin", true],
    ["admin", true],
    ["manager", true],
    ["viewer", false],
    ["unknown", false],
  ])("%s → %s", (role, expected) => {
    expect(canAccessReportsPage(role)).toBe(expected);
  });
});

describe("canAccessReportType", () => {
  it("super_admin acessa todos os tipos", () => {
    for (const type of ["logs", "companies", "routes", "users"] as const) {
      expect(canAccessReportType("super_admin", type)).toBe(true);
    }
  });

  it("admin acessa todos os tipos", () => {
    for (const type of ["logs", "companies", "routes", "users"] as const) {
      expect(canAccessReportType("admin", type)).toBe(true);
    }
  });

  it("manager acessa logs, companies, routes mas NÃO users", () => {
    expect(canAccessReportType("manager", "logs")).toBe(true);
    expect(canAccessReportType("manager", "companies")).toBe(true);
    expect(canAccessReportType("manager", "routes")).toBe(true);
    expect(canAccessReportType("manager", "users")).toBe(false);
  });

  it("viewer não acessa nada", () => {
    for (const type of ["logs", "companies", "routes", "users"] as const) {
      expect(canAccessReportType("viewer", type)).toBe(false);
    }
  });
});

describe("listAccessibleReportTypes", () => {
  it("super_admin vê 4 tipos", () => {
    expect(listAccessibleReportTypes("super_admin")).toHaveLength(4);
  });

  it("admin vê 4 tipos", () => {
    expect(listAccessibleReportTypes("admin")).toHaveLength(4);
  });

  it("manager vê 3 tipos (sem users)", () => {
    const types = listAccessibleReportTypes("manager");
    expect(types).toHaveLength(3);
    expect(types).not.toContain("users");
  });

  it("viewer vê 0 tipos", () => {
    expect(listAccessibleReportTypes("viewer")).toEqual([]);
  });
});
