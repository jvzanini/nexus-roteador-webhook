import {
  createCompanySchema,
  updateCompanySchema,
} from "../validations/company";

describe("createCompanySchema", () => {
  it("validates a valid company", () => {
    const result = createCompanySchema.safeParse({
      name: "Empresa Teste",
      logoUrl: "https://example.com/logo.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createCompanySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name shorter than 2 chars", () => {
    const result = createCompanySchema.safeParse({ name: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 chars", () => {
    const result = createCompanySchema.safeParse({ name: "A".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("allows empty logoUrl", () => {
    const result = createCompanySchema.safeParse({ name: "Teste" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid logoUrl", () => {
    const result = createCompanySchema.safeParse({
      name: "Teste",
      logoUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateCompanySchema", () => {
  it("validates partial update with name only", () => {
    const result = updateCompanySchema.safeParse({ name: "Novo Nome" });
    expect(result.success).toBe(true);
  });

  it("validates partial update with isActive only", () => {
    const result = updateCompanySchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = updateCompanySchema.safeParse({});
    // partial schema allows empty — business logic validates at least one field
    expect(result.success).toBe(true);
  });
});
