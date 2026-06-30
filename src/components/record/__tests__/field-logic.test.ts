import { describe, it, expect } from "vitest";
import {
  numericEditorInitial,
  normalizeNumericInput,
  compareRows,
} from "../field-logic";
import type { ColumnDef, RecordRow } from "../types";

// Capa mas reutilizada del record-view, sin tests hasta ahora. Cubre la
// conversion de moneda (centavos USD <-> unidades) y el comparador de sort.

describe("numericEditorInitial", () => {
  it("currency: divide centavos por 100 para editar en unidades USD", () => {
    expect(numericEditorInitial("currency", 150000)).toBe("1500"); // $1500.00
    expect(numericEditorInitial("currency", 99)).toBe("0.99");
  });
  it("currency: null/undefined -> '0' (no NaN)", () => {
    expect(numericEditorInitial("currency", null)).toBe("0");
    expect(numericEditorInitial("currency", undefined)).toBe("0");
  });
  it("number/amount/score: muestra el valor crudo sin dividir", () => {
    expect(numericEditorInitial("number", 42)).toBe("42");
    expect(numericEditorInitial("score", 80)).toBe("80");
    expect(numericEditorInitial("amount", 3)).toBe("3");
  });
});

describe("normalizeNumericInput", () => {
  it("currency: unidades USD -> centavos (x100, redondeado, >=0)", () => {
    expect(normalizeNumericInput("currency", "1500")).toBe(150000);
    expect(normalizeNumericInput("currency", "0.99")).toBe(99);
    expect(normalizeNumericInput("currency", "-5")).toBe(0); // clamp a 0
  });
  it("currency: round-trip centavos -> editor -> centavos es estable", () => {
    const cents = 150000;
    const back = normalizeNumericInput("currency", numericEditorInitial("currency", cents));
    expect(back).toBe(cents);
  });
  it("score: clamp 0..100, entero", () => {
    expect(normalizeNumericInput("score", "150")).toBe(100);
    expect(normalizeNumericInput("score", "-10")).toBe(0);
    expect(normalizeNumericInput("score", "73.6")).toBe(74);
  });
  it("amount: entero no negativo", () => {
    expect(normalizeNumericInput("amount", "3.7")).toBe(4);
    expect(normalizeNumericInput("amount", "-2")).toBe(0);
  });
  it("number: pasa tal cual (permite negativos y decimales)", () => {
    expect(normalizeNumericInput("number", "-12.5")).toBe(-12.5);
  });
  it("input no numerico -> null (el caller cancela)", () => {
    expect(normalizeNumericInput("currency", "abc")).toBeNull();
    expect(normalizeNumericInput("number", "")).toBe(0); // "" -> Number("") = 0, no null
    expect(normalizeNumericInput("score", "x1")).toBeNull();
  });
});

describe("compareRows", () => {
  const row = (id: string, extra: Record<string, unknown>): RecordRow => ({ id, ...extra });
  const numCol = { key: "value", label: "Valor", type: "currency" } as ColumnDef;
  const txtCol = { key: "name", label: "Nombre", type: "text" } as ColumnDef;

  it("numerico: ordena por valor, no lexicograficamente", () => {
    const rows = [row("a", { value: 1000 }), row("b", { value: 90 }), row("c", { value: 200 })];
    const asc = [...rows].sort((x, y) => compareRows(x, y, "value", numCol, 1));
    expect(asc.map((r) => r.id)).toEqual(["b", "c", "a"]); // 90 < 200 < 1000
  });

  it("texto: localeCompare (es), case-insensitive razonable", () => {
    const rows = [row("a", { name: "Zeta" }), row("b", { name: "alfa" }), row("c", { name: "Beta" })];
    const asc = [...rows].sort((x, y) => compareRows(x, y, "name", txtCol, 1));
    expect(asc.map((r) => r.id)).toEqual(["b", "c", "a"]); // alfa, Beta, Zeta
  });

  it("nulls SIEMPRE al final en asc", () => {
    const rows = [row("a", { value: null }), row("b", { value: 50 }), row("c", { value: 10 })];
    const asc = [...rows].sort((x, y) => compareRows(x, y, "value", numCol, 1));
    expect(asc.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("nulls SIEMPRE al final tambien en desc (no se invierten)", () => {
    const rows = [row("a", { value: null }), row("b", { value: 50 }), row("c", { value: 10 })];
    const desc = [...rows].sort((x, y) => compareRows(x, y, "value", numCol, -1));
    expect(desc.map((r) => r.id)).toEqual(["b", "c", "a"]); // 50, 10, null
  });

  it("undefined cuenta como null (campo ausente al final)", () => {
    const rows = [row("a", {}), row("b", { value: 5 })];
    const asc = [...rows].sort((x, y) => compareRows(x, y, "value", numCol, 1));
    expect(asc.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
