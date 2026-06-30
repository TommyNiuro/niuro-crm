import { describe, it, expect } from "vitest";
import { csvCell, cellText } from "../RecordBulkActions";
import type { ColumnDef } from "../types";

describe("csvCell anti-injection + escaping", () => {
  it("prefija ' a celdas que arrancan con = + - @", () => {
    expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(csvCell("+1")).toBe('"\'+1"');
    expect(csvCell("-1")).toBe('"\'-1"');
    expect(csvCell("@cmd")).toBe('"\'@cmd"');
  });
  it("no toca celdas normales", () => {
    expect(csvCell("Ana")).toBe('"Ana"');
  });
  it("duplica comillas internas", () => {
    expect(csvCell('a "b" c')).toBe('"a ""b"" c"');
  });
});

describe("cellText por tipo", () => {
  const col = (type: ColumnDef["type"], extra: Partial<ColumnDef> = {}): ColumnDef =>
    ({ key: "k", label: "L", type, ...extra });
  it("currency: centavos -> unidades", () => {
    expect(cellText(col("currency"), { id: "1", k: 12345 })).toBe("123.45");
  });
  it("status: resuelve label desde options", () => {
    expect(cellText(col("status", { options: [{ value: "new", label: "Nueva" }] }), { id: "1", k: "new" })).toBe("Nueva");
  });
  it("boolean -> Sí/No", () => {
    expect(cellText(col("boolean"), { id: "1", k: true })).toBe("Sí");
    expect(cellText(col("boolean"), { id: "1", k: 0 })).toBe("No");
  });
  it("null/undefined -> vacío", () => {
    expect(cellText(col("text"), { id: "1", k: null })).toBe("");
  });
});
