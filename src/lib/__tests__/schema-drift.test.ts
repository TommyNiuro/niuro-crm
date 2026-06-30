import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import * as schema from "@/db/schema";
import { makeTestDb } from "./helpers/test-db";

// Guard de drift entre el harness :memory: y el schema Drizzle.
// Si el schema de produccion agrega una columna y el harness no se actualiza,
// los tests de integracion fallarian con errores crípticos de "column not found".
// Este test los hace fallar de forma clara y temprana.

function harnessCols(table: string): Set<string> {
  const { sqlite } = makeTestDb();
  const rows = sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
  sqlite.close();
  return new Set(rows.map((r) => r.name));
}

function schemaCols(drizzleTable: Parameters<typeof getTableColumns>[0]): Set<string> {
  const cols = getTableColumns(drizzleTable);
  // getTableColumns devuelve {camelCase: ColumnDef}; el nombre de columna real
  // (snake_case) esta en col.name.
  return new Set(Object.values(cols).map((col) => col.name));
}

describe("schema drift: harness vs Drizzle schema", () => {
  it("proposals: el harness tiene todas las columnas del schema", () => {
    const expected = schemaCols(schema.proposals);
    const actual = harnessCols("proposals");
    const missing = [...expected].filter((c) => !actual.has(c));
    expect(missing).toEqual([]);
  });

  it("contacts: el harness tiene todas las columnas del schema", () => {
    const expected = schemaCols(schema.contacts);
    const actual = harnessCols("contacts");
    const missing = [...expected].filter((c) => !actual.has(c));
    expect(missing).toEqual([]);
  });

  it("deals: el harness tiene todas las columnas del schema", () => {
    const expected = schemaCols(schema.deals);
    const actual = harnessCols("deals");
    const missing = [...expected].filter((c) => !actual.has(c));
    expect(missing).toEqual([]);
  });

  it("pipeline_stages: el harness tiene todas las columnas del schema", () => {
    const expected = schemaCols(schema.pipelineStages);
    const actual = harnessCols("pipeline_stages");
    const missing = [...expected].filter((c) => !actual.has(c));
    expect(missing).toEqual([]);
  });
});
