import { describe, it, expect } from "vitest";
import { runReadTool, filterDeclaredActions, ALL_TOOLS } from "../copilot";

describe("runReadTool (enforcement del subset de tools por agente)", () => {
  it("rechaza una tool fuera del allowedTools ANTES de tocar la DB", () => {
    expect(() => runReadTool("count_records", { objectName: "contacts" }, ["search"])).toThrow(
      /no habilitada/
    );
  });

  it("rechaza una tool inexistente igual que una no habilitada", () => {
    expect(() => runReadTool("delete_everything", {}, [...ALL_TOOLS])).toThrow();
  });

  it("con el set completo de ALL_TOOLS no rechaza por falta de permiso", () => {
    // count_records SÍ está en ALL_TOOLS: no debe tirar el error de "no habilitada"
    // (puede fallar más adelante por DB, pero no por el gate de permisos).
    expect(() => {
      try {
        runReadTool("count_records", { objectName: "contacts" }, ALL_TOOLS);
      } catch (e) {
        if (e instanceof Error && /no habilitada/.test(e.message)) throw e;
      }
    }).not.toThrow();
  });
});

describe("filterDeclaredActions (gate del turno final {answer, actions:[...]})", () => {
  it("descarta un update declarado si el agente no tiene propose_update, aunque venga en 'answer' en vez de un tool-call explicito", () => {
    const declared = [{ kind: "update", objectName: "contacts", id: "abc", fields: { temperature: "warm" } }];
    // Bug real encontrado por revisión adversarial: antes esto pasaba de largo
    // sin chequear tools porque el gate solo vivía en la rama de tool-call.
    expect(filterDeclaredActions(declared, ["query_records", "get_record"])).toEqual([]);
  });

  it("acepta el update si propose_update SÍ está en el allowedTools", () => {
    const declared = [{ kind: "update", objectName: "contacts", id: "abc", fields: { temperature: "warm" } }];
    const out = filterDeclaredActions(declared, ["propose_update"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "update", objectName: "contacts", id: "abc" });
  });

  it("infiere 'create' cuando no hay id, y lo gatea contra propose_create", () => {
    const declared = [{ objectName: "contacts", fields: { name: "Juan" } }];
    expect(filterDeclaredActions(declared, ["propose_update"])).toEqual([]);
    expect(filterDeclaredActions(declared, ["propose_create"])).toHaveLength(1);
  });

  it("una acción mal formada no rompe el resto del batch", () => {
    const declared = [{ kind: "update", objectName: "contacts", fields: {} }, { kind: "update", objectName: "contacts", id: "ok", fields: { temperature: "hot" } }];
    // la primera no tiene id -> propose_update tira -> se ignora; la segunda sigue.
    const out = filterDeclaredActions(declared, ["propose_update"]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("ok");
  });
});
