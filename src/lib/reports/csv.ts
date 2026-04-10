/**
 * Helpers de serialização CSV com:
 * - Escape RFC 4180 (aspas, vírgulas, quebras de linha)
 * - Proteção contra CSV Formula Injection (CWE-1236)
 * - BOM UTF-8 para compatibilidade com Excel BR
 */

export const CSV_BOM = "\uFEFF";

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let str = typeof value === "string" ? value : String(value);

  if (str.length > 0 && FORMULA_TRIGGERS.has(str[0])) {
    str = "'" + str;
  }

  const needsQuoting =
    str.includes(",") || str.includes('"') || str.includes("\n");

  if (needsQuoting) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function buildCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(",") + "\r\n";
}
