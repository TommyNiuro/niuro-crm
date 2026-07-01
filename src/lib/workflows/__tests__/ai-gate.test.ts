import { describe, it, expect } from "vitest";
import { referencesTainted } from "../engine";

describe("referencesTainted (gate de ai_step -> write steps)", () => {
  it("detecta {{aiOutput}} exacto", () => {
    expect(referencesTainted("{{aiOutput}}", ["aiOutput"])).toBe(true);
  });

  it("detecta una clave saveAs custom embebida en texto", () => {
    expect(referencesTainted("Resumen: {{summary}} fin", ["summary"])).toBe(true);
  });

  it("no marca un template que no referencia ninguna clave contaminada", () => {
    expect(referencesTainted("{{record.notes}}", ["aiOutput"])).toBe(false);
  });

  it("busca recursivo dentro de objetos y arrays de fields", () => {
    expect(referencesTainted({ stage: "{{aiOutput}}" }, ["aiOutput"])).toBe(true);
    expect(referencesTainted(["ok", { notes: "{{aiOutput}}" }], ["aiOutput"])).toBe(true);
    expect(referencesTainted({ stage: "Cierre" }, ["aiOutput"])).toBe(false);
  });

  it("sin claves contaminadas (workflow sin ai_step) nunca bloquea", () => {
    expect(referencesTainted("{{aiOutput}}", [])).toBe(false);
  });

  it("no revienta con un saveAs que tiene caracteres especiales de regex", () => {
    // Bug real encontrado por revisión adversarial: saveAs viene de la config del
    // workflow (no confiable) y se interpolaba sin escapar en un RegExp.
    expect(() => referencesTainted("{{resumen(1)}}", ["resumen(1)"])).not.toThrow();
    expect(referencesTainted("{{resumen(1)}}", ["resumen(1)"])).toBe(true);
    expect(() => referencesTainted("texto normal", ["resumen["])).not.toThrow();
    expect(() => referencesTainted("texto normal", ["a.b*c+d"])).not.toThrow();
  });
});
