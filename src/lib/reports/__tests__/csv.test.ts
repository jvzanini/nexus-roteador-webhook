import { escapeCsvCell, buildCsvRow, CSV_BOM } from "../csv";

describe("escapeCsvCell", () => {
  it("retorna string vazia para null/undefined", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("retorna valor simples sem aspas", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
  });

  it("envolve em aspas e duplica aspas internas (RFC 4180)", () => {
    expect(escapeCsvCell('contém "aspas"')).toBe('"contém ""aspas"""');
  });

  it("envolve em aspas quando tem vírgula", () => {
    expect(escapeCsvCell("a, b, c")).toBe('"a, b, c"');
  });

  it("envolve em aspas quando tem quebra de linha", () => {
    expect(escapeCsvCell("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });

  it("previne CSV formula injection prefixando com aspa simples", () => {
    expect(escapeCsvCell("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(escapeCsvCell("+cmd|calc")).toBe("'+cmd|calc");
    expect(escapeCsvCell("-1+1")).toBe("'-1+1");
    expect(escapeCsvCell("@import")).toBe("'@import");
    expect(escapeCsvCell("\tfoo")).toBe("'\tfoo");
    expect(escapeCsvCell("\rfoo")).toBe("'\rfoo");
  });

  it("aplica formula guard antes do escape de aspas", () => {
    expect(escapeCsvCell('=HYPERLINK("x","y")')).toBe(
      `"'=HYPERLINK(""x"",""y"")"`
    );
  });

  it("serializa números", () => {
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(3.14)).toBe("3.14");
  });

  it("serializa booleans", () => {
    expect(escapeCsvCell(true)).toBe("true");
    expect(escapeCsvCell(false)).toBe("false");
  });
});

describe("buildCsvRow", () => {
  it("junta células com vírgula e termina em CRLF", () => {
    expect(buildCsvRow(["a", "b", "c"])).toBe("a,b,c\r\n");
  });

  it("aplica escape em cada célula", () => {
    expect(buildCsvRow(["a", "b, c", '"d"'])).toBe('a,"b, c","""d"""\r\n');
  });

  it("aceita valores mistos (texto, número, null, undefined, bool)", () => {
    expect(buildCsvRow(["texto", 42, null, undefined, true])).toBe(
      "texto,42,,,true\r\n"
    );
  });
});

describe("CSV_BOM", () => {
  it("é o BOM UTF-8", () => {
    expect(CSV_BOM).toBe("\uFEFF");
  });
});
