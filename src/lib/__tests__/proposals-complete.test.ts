/* Tests del check de completitud del output de IA (M4 del audit final).
 * Cubre findMissingFields: una propuesta JSON-valida pero PARCIAL no debe
 * pasar como completa (run-generation la marca 'error' en vez de 'ready'). */
import { describe, it, expect } from "vitest";
import { findMissingFields, type GeneratedProposal } from "@/lib/proposals-ai";

function completeProposal(): GeneratedProposal {
  return {
    client: { name: "Acme" },
    pricing: null,
    summary: "Resumen ejecutivo con contenido real.",
    context: {
      paragraph: "Contexto de negocio del cliente.",
      dataPoints: ["<strong>Industria:</strong> SaaS"],
    },
    cards: {
      objective: [{ title: "Objetivo 1", body: "Cuerpo del objetivo." }],
      scope: [{ title: "Alcance 1", body: "Cuerpo del alcance." }],
      governance: [{ title: "Gov 1", body: "Cuerpo de governance." }],
    },
    roadmap: [
      { period: "Semanas 1-2", label: "Onboarding", focus: "Setup", activities: ["A"], milestone: "Base" },
    ],
    team: [
      { role: "Senior Engineer", stack: "TS", modality: "Full-time", responsibilities: ["Construir"] },
    ],
    risks: [{ title: "Riesgo 1", body: "Mitigacion: ..." }],
  };
}

describe("findMissingFields", () => {
  it("no reporta nada en una propuesta completa", () => {
    expect(findMissingFields(completeProposal())).toEqual([]);
  });

  it("detecta summary vacio", () => {
    const p = completeProposal();
    p.summary = "   ";
    expect(findMissingFields(p)).toContain("summary");
  });

  it("detecta context.paragraph vacio", () => {
    const p = completeProposal();
    p.context.paragraph = "";
    expect(findMissingFields(p)).toContain("context.paragraph");
  });

  it("detecta secciones de cards ausentes (array vacio)", () => {
    const p = completeProposal();
    p.cards.objective = [];
    p.cards.scope = [];
    const missing = findMissingFields(p);
    expect(missing).toContain("objectiveCards");
    expect(missing).toContain("scopeCards");
  });

  it("trata cards con title y body vacios como ausentes (no solo length)", () => {
    const p = completeProposal();
    p.cards.objective = [{ title: "", body: "" }];
    expect(findMissingFields(p)).toContain("objectiveCards");
  });

  it("detecta roadmap, team y risks vacios", () => {
    const p = completeProposal();
    p.roadmap = [];
    p.team = [];
    p.risks = [];
    const missing = findMissingFields(p);
    expect(missing).toEqual(
      expect.arrayContaining(["roadmap", "team", "risks"]),
    );
  });

  it("no exige pricing (la IA lo deja null a proposito)", () => {
    const p = completeProposal();
    p.pricing = null;
    expect(findMissingFields(p)).toEqual([]);
  });

  it("acumula todos los faltantes de un shape truncado", () => {
    const truncated: GeneratedProposal = {
      client: { name: "Acme" },
      pricing: null,
      summary: "Solo llego hasta aca.",
      context: { paragraph: "", dataPoints: [] },
      cards: { objective: [], scope: [], governance: [] },
      roadmap: [],
      team: [],
      risks: [],
    };
    const missing = findMissingFields(truncated);
    expect(missing).toEqual(
      expect.arrayContaining([
        "context.paragraph",
        "objectiveCards",
        "scopeCards",
        "roadmap",
        "team",
        "risks",
      ]),
    );
    expect(missing).not.toContain("summary");
  });
});
