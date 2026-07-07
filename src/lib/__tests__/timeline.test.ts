import { describe, it, expect } from "vitest";
import { diffChanges } from "../timeline";

describe("diffChanges", () => {
  it("reporta un campo que cambio de valor", () => {
    expect(diffChanges({ name: "a" }, { name: "b" }, ["name"])).toEqual({
      name: { from: "a", to: "b" },
    });
  });

  it("no reporta un campo que no cambio", () => {
    expect(diffChanges({ name: "a" }, { name: "a" }, ["name"])).toEqual({});
  });

  it("reporta un campo que paso de valor a null", () => {
    expect(diffChanges({ name: "a" }, { name: null }, ["name"])).toEqual({
      name: { from: "a", to: null },
    });
  });

  it("reporta un campo Date que cambio", () => {
    const before = new Date("2026-01-01T00:00:00Z");
    const after = new Date("2026-02-01T00:00:00Z");
    expect(diffChanges({ due: before }, { due: after }, ["due"])).toEqual({
      due: { from: before, to: after },
    });
  });

  it("no reporta una Date con el mismo instante aunque sea otra instancia", () => {
    const before = new Date("2026-01-01T00:00:00Z");
    const after = new Date(before.getTime());
    expect(diffChanges({ due: before }, { due: after }, ["due"])).toEqual({});
  });

  it("ignora una key que no esta presente en 'after'", () => {
    expect(diffChanges({ x: 1 }, {}, ["x"])).toEqual({});
  });

  it("norm() trata objetos por contenido (JSON.stringify), no por referencia", () => {
    // mismo contenido, distinta instancia -> sin cambio
    expect(diffChanges({ meta: { a: 1 } }, { meta: { a: 1 } }, ["meta"])).toEqual({});
    // contenido distinto -> cambio, reportando los objetos crudos
    expect(diffChanges({ meta: { a: 1 } }, { meta: { a: 2 } }, ["meta"])).toEqual({
      meta: { from: { a: 1 }, to: { a: 2 } },
    });
  });

  it("norm() trata null y undefined como equivalentes", () => {
    expect(diffChanges({ x: null }, { x: undefined }, ["x"])).toEqual({});
    expect(diffChanges({ x: undefined }, { x: null }, ["x"])).toEqual({});
  });
});
