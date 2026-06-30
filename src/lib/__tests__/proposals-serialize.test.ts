import { describe, it, expect, vi } from "vitest";

// proposals.ts importa @/db (abre better-sqlite3 + corre migraciones al cargar
// el modulo). serializeProposal / stringifyJsonField / isStageAhead son puras y
// no usan db, asi que lo mockeamos para no tocar la DB real en los tests.
vi.mock("@/db", () => ({ db: {} }));

import { serializeProposal, stringifyJsonField, isStageAhead } from "../proposals";
import type { Proposal } from "@/db/schema";

// over: Record<string, unknown> a proposito: probamos serializeProposal con
// formas que el tipo estricto de Drizzle no permite (createdAt como number,
// timestamps null) pero que toMs/parseJson SI deben tolerar en runtime.
function makeRow(over: Record<string, unknown> = {}): Proposal {
  return {
    id: "p1",
    contactId: "c1",
    dealId: null,
    mode: "staff-aug",
    status: "draft",
    date: "2026-06-22",
    client: '{"name":"MIIDO","industry":"Fintech"}',
    role: "Backend",
    duration: null,
    transcript: "t",
    notes: "n",
    pricing: null,
    summary: "<strong>x</strong>",
    context: '{"paragraph":"p","dataPoints":["a"]}',
    cards: '{"objective":[]}',
    roadmap: "[]",
    team: "[]",
    risks: "[]",
    generated: true,
    priority: null,
    genStatus: "ready",
    genError: null,
    sentAt: null,
    signedAt: null,
    closedAt: null,
    createdAt: 1782174585,
    updatedAt: 1782174585,
    ...over,
  } as unknown as Proposal;
}

describe("serializeProposal", () => {
  it("parsea los campos JSON a objeto", () => {
    const s = serializeProposal(makeRow());
    expect(s.client).toEqual({ name: "MIIDO", industry: "Fintech" });
    expect(s.context).toEqual({ paragraph: "p", dataPoints: ["a"] });
    expect(s.cards).toEqual({ objective: [] });
    expect(Array.isArray(s.roadmap)).toBe(true);
  });

  it("JSON malformado -> null (no rompe el GET)", () => {
    const s = serializeProposal(makeRow({ client: "{not json", cards: "oops" }));
    expect(s.client).toBe(null);
    expect(s.cards).toBe(null);
  });

  it("null o '' -> null", () => {
    const s = serializeProposal(makeRow({ client: null, context: "" }));
    expect(s.client).toBe(null);
    expect(s.context).toBe(null);
  });

  it("toMs convierte Date a epoch ms, respeta numbers y cae a 0", () => {
    const s = serializeProposal(
      makeRow({ sentAt: new Date(1782174585000), createdAt: 123, updatedAt: null }),
    );
    expect(s.sentAt).toBe(1782174585000);
    expect(s.createdAt).toBe(123);
    expect(s.updatedAt).toBe(0); // fallback ?? 0
  });
});

describe("stringifyJsonField", () => {
  it("undefined -> undefined (se omite del update)", () => {
    expect(stringifyJsonField(undefined)).toBe(undefined);
  });
  it("null -> null explicito", () => {
    expect(stringifyJsonField(null)).toBe(null);
  });
  it("objeto -> string JSON", () => {
    expect(stringifyJsonField({ a: 1 })).toBe('{"a":1}');
  });
  it("string ya serializado se deja igual (no doble-stringify)", () => {
    expect(stringifyJsonField('{"a":1}')).toBe('{"a":1}');
  });
  it("valor circular -> null (catch)", () => {
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(stringifyJsonField(o)).toBe(null);
  });
});

describe("isStageAhead — nunca retrocede a un contacto", () => {
  const stages = new Map([
    ["Prospecto", { order: 0 }],
    ["Discovery", { order: 1 }],
    ["Propuesta", { order: 2 }],
    ["Cierre", { order: 5 }],
  ]);

  it("true si la candidata esta mas adelante", () => {
    expect(isStageAhead(2, "Discovery", stages)).toBe(true);
  });

  it("false si la candidata esta detras o igual", () => {
    expect(isStageAhead(2, "Cierre", stages)).toBe(false);
    expect(isStageAhead(2, "Propuesta", stages)).toBe(false);
  });

  it("etapa actual desconocida -> deja avanzar (true)", () => {
    expect(isStageAhead(2, "EtapaRara", stages)).toBe(true);
  });
});
