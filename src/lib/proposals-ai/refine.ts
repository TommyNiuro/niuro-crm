/**
 * src/lib/proposals-ai/refine.ts · Chat de ajustes (patch parcial).
 *
 * A diferencia de generateProposal (arma todo desde cero), refineProposal
 * parte de una propuesta YA generada + una instruccion del vendedor, y pide al
 * LLM solo el patch de lo que cambia. Es mas rapido que regenerar todo (menos
 * output) y evita perder ediciones manuales en secciones no tocadas.
 *
 * Merge GRANULAR: si el LLM solo devuelve `dataPoints`, no pisa
 * `contextParagraph` (y viceversa); igual con las 3 sub-listas de cards. Sin
 * esto, un patch parcial de `cards` volaria las otras dos categorias.
 */
import { callLLM } from "@/lib/proposals-ai/client";
import {
  normClient,
  normCards,
  normRoadmapPhase,
  normTeamMember,
  normRisk,
  normPricing,
  asString,
  asStringArray,
  asOptString,
  type RawLLMProposal,
  type FullGenerateMode,
} from "@/lib/proposals-ai";
import { cleanObject } from "@/lib/proposals-ai/voice-sanitizer";
import { buildRefinePrompts, type FlatProposalState } from "@/lib/proposals-ai/prompts/refine";
import type { SerializedProposal } from "@/lib/proposals";

export type RefineResult = {
  /** Columnas a persistir (ya serializadas a JSON donde corresponde). Solo trae
   * las claves que efectivamente cambiaron. */
  dbPatch: Record<string, string | null>;
  /** Top-level keys que cambiaron (para toast/telemetria). */
  changedFields: string[];
  /** Mensaje corto para mostrar en el chat. */
  explanation: string;
};

function toFlatState(p: SerializedProposal): FlatProposalState {
  return {
    client: p.client ?? undefined,
    role: p.role ?? undefined,
    duration: p.duration ?? undefined,
    date: p.date ?? undefined,
    pricing: p.pricing ?? undefined,
    summary: p.summary ?? undefined,
    contextParagraph: p.context?.paragraph,
    dataPoints: p.context?.dataPoints,
    objectiveCards: p.cards?.objective,
    scopeCards: p.cards?.scope,
    governanceCards: p.cards?.governance,
    roadmap: p.roadmap ?? undefined,
    team: p.team ?? undefined,
    risks: p.risks ?? undefined,
  };
}

type RawPatch = RawLLMProposal & { explanation?: unknown; date?: unknown };

export async function refineProposal(
  existing: SerializedProposal,
  instruction: string,
): Promise<RefineResult> {
  const mode = (existing.mode as FullGenerateMode) || "staff-aug";
  const currentState = toFlatState(existing);
  const { system, user } = buildRefinePrompts(currentState, instruction, mode);

  // Timeout mas corto que full-generate: el patch es mucho menos output que
  // la propuesta completa (4 min), no compite tanto con el semaforo global.
  const raw = await callLLM<{ patch?: RawPatch; explanation?: unknown }>({
    system,
    user,
    timeoutMs: 180_000,
  });

  const patch = cleanObject((raw.patch ?? {}) as RawPatch);
  const explanation = asString(raw.explanation) || "Listo, apliqué el cambio.";

  const dbPatch: Record<string, string | null> = {};
  const changedFields: string[] = [];

  if (patch.client !== undefined) {
    dbPatch.client = JSON.stringify(normClient(patch.client));
    changedFields.push("client");
  }
  if (mode === "staff-aug" && patch.role !== undefined) {
    const role = asOptString(patch.role);
    if (role) {
      dbPatch.role = role;
      changedFields.push("role");
    }
  }
  if (mode === "sprint" && patch.duration !== undefined) {
    const duration = asOptString(patch.duration);
    if (duration) {
      dbPatch.duration = duration;
      changedFields.push("duration");
    }
  }
  if (patch.date !== undefined) {
    const date = asOptString(patch.date);
    if (date) {
      dbPatch.date = date;
      changedFields.push("date");
    }
  }
  if (patch.pricing !== undefined) {
    dbPatch.pricing = JSON.stringify(normPricing(patch.pricing, mode));
    changedFields.push("pricing");
  }
  if (patch.summary !== undefined) {
    dbPatch.summary = asString(patch.summary);
    changedFields.push("summary");
  }
  if (patch.contextParagraph !== undefined || patch.dataPoints !== undefined) {
    dbPatch.context = JSON.stringify({
      paragraph:
        patch.contextParagraph !== undefined
          ? asString(patch.contextParagraph)
          : (existing.context?.paragraph ?? ""),
      dataPoints:
        patch.dataPoints !== undefined
          ? asStringArray(patch.dataPoints)
          : (existing.context?.dataPoints ?? []),
    });
    changedFields.push("context");
  }
  if (
    patch.objectiveCards !== undefined ||
    patch.scopeCards !== undefined ||
    patch.governanceCards !== undefined
  ) {
    dbPatch.cards = JSON.stringify({
      objective:
        patch.objectiveCards !== undefined
          ? normCards(patch.objectiveCards)
          : (existing.cards?.objective ?? []),
      scope:
        patch.scopeCards !== undefined
          ? normCards(patch.scopeCards)
          : (existing.cards?.scope ?? []),
      governance:
        patch.governanceCards !== undefined
          ? normCards(patch.governanceCards)
          : (existing.cards?.governance ?? []),
    });
    changedFields.push("cards");
  }
  if (patch.roadmap !== undefined) {
    dbPatch.roadmap = JSON.stringify(
      Array.isArray(patch.roadmap) ? patch.roadmap.map(normRoadmapPhase) : [],
    );
    changedFields.push("roadmap");
  }
  if (patch.team !== undefined) {
    dbPatch.team = JSON.stringify(Array.isArray(patch.team) ? patch.team.map(normTeamMember) : []);
    changedFields.push("team");
  }
  if (patch.risks !== undefined) {
    dbPatch.risks = JSON.stringify(Array.isArray(patch.risks) ? patch.risks.map(normRisk) : []);
    changedFields.push("risks");
  }

  return { dbPatch, changedFields, explanation };
}
