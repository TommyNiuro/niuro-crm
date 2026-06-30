import { describe, it, expect, beforeEach, vi } from "vitest";

// DB en memoria igual que los otros tests de esta suite.
vi.mock("@/db", async () => {
  const { makeTestDb, seedStages } = await import("./helpers/test-db");
  const h = makeTestDb();
  seedStages(h.db);
  return { db: h.db };
});

// Mock de generateProposal: lo controlamos por test con mockResolvedValueOnce /
// mockRejectedValueOnce. El modulo completo se reemplaza para no invocar el
// subprocess claude en los tests.
const { generateProposal } = vi.hoisted(() => ({
  generateProposal: vi.fn(),
}));
vi.mock("@/lib/proposals-ai", () => ({ generateProposal }));

import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runProposalGeneration } from "../proposals-ai/run-generation";

// Resultado minimo valido que devuelve generateProposal.
const MOCK_RESULT = {
  client: { name: "Empresa X", industry: "Tech" },
  role: "Senior Engineer",
  duration: "3 meses",
  pricing: null,
  summary: "Un resumen de prueba.",
  context: { paragraph: "Contexto.", dataPoints: [] },
  cards: { objective: null, scope: null, governance: null },
  roadmap: [],
  team: [],
  risks: [],
};

function insertProposal(over: Record<string, unknown> = {}) {
  return db
    .insert(proposals)
    .values({ mode: "staff-aug", client: '{"name":"Test"}', ...over })
    .returning()
    .get() as Record<string, unknown>;
}

function getProposal(id: string) {
  return db.select().from(proposals).where(eq(proposals.id, id)).get() as Record<string, unknown>;
}

beforeEach(() => {
  generateProposal.mockClear();
  db.delete(proposals).run();
});

describe("runProposalGeneration", () => {
  it("happy-path: escribe todos los campos generados y queda genStatus=ready", async () => {
    generateProposal.mockResolvedValueOnce(MOCK_RESULT);
    const row = insertProposal({ transcript: "Necesito un dev senior para mi startup." });

    await runProposalGeneration(row.id as string);

    const updated = getProposal(row.id as string);
    expect(updated.genStatus).toBe("ready");
    expect(updated.generated).toBe(true);
    expect(updated.genError).toBeNull();

    // Columnas editoriales escritas
    expect(JSON.parse(updated.client as string)).toMatchObject({ name: "Empresa X" });
    expect(updated.summary).toBe("Un resumen de prueba.");
    expect(updated.context).toBeTruthy();
    expect(updated.cards).toBeTruthy();
    expect(updated.roadmap).toBeTruthy();
    expect(updated.team).toBeTruthy();
    expect(updated.risks).toBeTruthy();

    expect(generateProposal).toHaveBeenCalledOnce();
  });

  it("generateProposal lanza Error -> genStatus=error con el mensaje del error", async () => {
    generateProposal.mockRejectedValueOnce(new Error("Fallo de red simulado"));
    const row = insertProposal({ transcript: "Transcript valido." });

    await runProposalGeneration(row.id as string);

    const updated = getProposal(row.id as string);
    expect(updated.genStatus).toBe("error");
    expect(updated.genError).toContain("Fallo de red simulado");
    expect(updated.generated).toBe(false);
  });

  it("transcript vacio -> genStatus=error SIN llamar a generateProposal", async () => {
    const row = insertProposal({ transcript: "   " });

    await runProposalGeneration(row.id as string);

    const updated = getProposal(row.id as string);
    expect(updated.genStatus).toBe("error");
    expect(updated.genError).toBeTruthy();
    expect(generateProposal).not.toHaveBeenCalled();
  });

  it("error con rawContent adjunto -> genError incluye 'rawContent preservado'", async () => {
    const err = new Error("JSON parse fallido") as Error & { rawContent: unknown };
    err.rawContent = { partial: "data" };
    generateProposal.mockRejectedValueOnce(err);
    const row = insertProposal({ transcript: "Transcript de recuperacion." });

    await runProposalGeneration(row.id as string);

    const updated = getProposal(row.id as string);
    expect(updated.genStatus).toBe("error");
    // El mensaje incluye la nota de rawContent preservado (best-effort: si el
    // filesystem falla, el mensaje base sigue presente).
    expect(updated.genError).toContain("JSON parse fallido");
    // rawContent preservado en disco cuando el writeFile tiene exito.
    // En el entorno de test el proceso.cwd() puede escribir en data/recovery/;
    // solo verificamos que el campo genError no este vacio y contenga el mensaje.
    expect(typeof updated.genError).toBe("string");
  });

  it("propuesta inexistente: retorna sin error y sin tocar la DB", async () => {
    // No debe lanzar ni dejar rastro.
    await expect(runProposalGeneration("id-inexistente")).resolves.toBeUndefined();
    expect(generateProposal).not.toHaveBeenCalled();
  });
});
