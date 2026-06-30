/**
 * src/lib/proposals-ai/index.ts · Generacion de propuestas con IA (Claude CLI)
 *
 * Punto de entrada de la capa IA de propuestas. Porta el flujo de
 * propuestas-niuro (full-generate) cambiando el motor Groq/Llama por el
 * subprocess Claude del CRM (callLLM -> runClaude).
 *
 * generateProposal({ transcript, notes, mode }):
 *   1. Compone {system, user} con buildFullGeneratePrompts + voz Niuro.
 *   2. Llama al modelo (callLLM concatena system+user y parsea JSON robusto).
 *   3. Sanitiza el output con cleanObject (cero guiones largos, dict de reemplazos).
 *   4. Mapea el shape "plano" del LLM (objectiveCards/scopeCards/...,
 *      contextParagraph, dataPoints) al shape persistible del CRM
 *      (cards:{objective,scope,governance}, context:{paragraph,dataPoints})
 *      usando los tipos de src/types.
 *
 * NO guarda en DB: eso lo hace el modulo API (Agente B). Devuelve el JSON listo.
 */
import { callLLM } from "@/lib/proposals-ai/client";
import { getVoiceRules } from "@/lib/proposals-ai/voice";
import { cleanObject } from "@/lib/proposals-ai/voice-sanitizer";
import {
  buildFullGeneratePrompts,
  calcMilestones,
  compressIfNeeded,
  type FullGenerateMode,
  type Milestone,
} from "@/lib/proposals-ai/prompts/full-generate";
import type {
  ProposalCard,
  ProposalCards,
  ProposalClient,
  ProposalContext,
  ProposalPricing,
  ProposalRisk,
  ProposalRoadmapPhase,
  ProposalTeamMember,
} from "@/types";

// Tipo del shape que devuelve generateProposal. Espejo del contenido editorial
// de una propuesta (sin metadata de DB: id, status, fechas). role/duration son
// excluyentes por mode (staff-aug -> role, sprint -> duration).
export type GeneratedProposal = {
  client: ProposalClient;
  role?: string;
  duration?: string;
  pricing: ProposalPricing | null;
  summary: string;
  context: ProposalContext;
  cards: ProposalCards;
  roadmap: ProposalRoadmapPhase[];
  team: ProposalTeamMember[];
  risks: ProposalRisk[];
  /** Hitos de pago calculados (solo sprint con total + startDate). */
  milestones?: Milestone[];
};

export type GenerateProposalArgs = {
  transcript: string;
  notes?: string;
  mode: FullGenerateMode;
};

// Shape "plano" tal como lo emite el LLM (matchea el JSON del system prompt).
// Todo opcional: el modelo puede omitir o malformar campos; normalizamos abajo.
type RawLLMProposal = {
  client?: {
    name?: unknown;
    industry?: unknown;
    country?: unknown;
    website?: unknown;
  };
  role?: unknown;
  duration?: unknown;
  pricing?: unknown;
  summary?: unknown;
  contextParagraph?: unknown;
  dataPoints?: unknown;
  objectiveCards?: unknown;
  scopeCards?: unknown;
  governanceCards?: unknown;
  team?: unknown;
  roadmap?: unknown;
  risks?: unknown;
};

// ---------------------------------------------------------------------------
// Helpers de normalizacion (el LLM puede devolver tipos inesperados).
// ---------------------------------------------------------------------------

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asOptString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

function asNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Normaliza una card {title, body, pill?} descartando ruido.
function normCard(v: unknown): ProposalCard {
  if (!isRecord(v)) return { title: "", body: "" };
  const card: ProposalCard = {
    title: asString(v.title),
    body: asString(v.body),
  };
  const pill = asOptString(v.pill);
  if (pill) card.pill = pill;
  return card;
}

function normCards(v: unknown): ProposalCard[] {
  return Array.isArray(v) ? v.map(normCard) : [];
}

function normRisk(v: unknown): ProposalRisk {
  if (!isRecord(v)) return { title: "", body: "" };
  return { title: asString(v.title), body: asString(v.body) };
}

function normRoadmapPhase(v: unknown): ProposalRoadmapPhase {
  if (!isRecord(v)) {
    return { period: "", label: "", focus: "", activities: [], milestone: "" };
  }
  return {
    period: asString(v.period),
    label: asString(v.label),
    focus: asString(v.focus),
    activities: asStringArray(v.activities),
    milestone: asString(v.milestone),
  };
}

function normTeamMember(v: unknown): ProposalTeamMember {
  if (!isRecord(v)) {
    return { role: "", stack: "", modality: "", responsibilities: [] };
  }
  return {
    role: asString(v.role),
    stack: asString(v.stack),
    modality: asString(v.modality),
    responsibilities: asStringArray(v.responsibilities),
  };
}

// Pricing discriminado por mode. Solo numeros reales del LLM; null si no hay.
function normPricing(
  v: unknown,
  mode: FullGenerateMode,
): ProposalPricing | null {
  if (!isRecord(v)) return null;
  const currency = asString(v.currency) || "USD";
  if (mode === "staff-aug") {
    return {
      currency,
      monthlyMin: asNumberOrNull(v.monthlyMin),
      monthlyMax: asNumberOrNull(v.monthlyMax),
      iva: asBool(v.iva),
    };
  }
  return {
    currency,
    total: asNumberOrNull(v.total),
    iva: asBool(v.iva),
    startDate: asOptString(v.startDate) ?? null,
  };
}

function normClient(v: RawLLMProposal["client"]): ProposalClient {
  const name = asString(v?.name) || "Cliente por confirmar";
  const client: ProposalClient = { name };
  const industry = asOptString(v?.industry);
  const country = asOptString(v?.country);
  const website = asOptString(v?.website);
  if (industry) client.industry = industry;
  if (country) client.country = country;
  if (website) client.website = website;
  // initial: primera letra del nombre, util para el avatar del cliente en la UI.
  const initial = name.trim().charAt(0).toUpperCase();
  if (initial) client.initial = initial;
  return client;
}

// ---------------------------------------------------------------------------
// Validacion de completitud del output (el LLM puede devolver JSON valido pero
// PARCIAL: cortado por tokens o detenido antes de tiempo). Sin este check, los
// normalizadores rellenan vacios y se persiste una propuesta 'ready' a medias
// sin aviso. findMissingFields devuelve la lista de secciones core ausentes
// (vacio = completa). Exportada para tests. Pricing NO se exige: la IA lo deja
// null a proposito y se completa con el editor de montos.
// ---------------------------------------------------------------------------
function cardHasContent(c: ProposalCard): boolean {
  return !!(c.title.trim() || c.body.trim());
}
function riskHasContent(r: ProposalRisk): boolean {
  return !!(r.title.trim() || r.body.trim());
}
function phaseHasContent(p: ProposalRoadmapPhase): boolean {
  return !!(
    p.period.trim() ||
    p.label.trim() ||
    p.focus.trim() ||
    p.activities.length
  );
}
function memberHasContent(m: ProposalTeamMember): boolean {
  return !!(m.role.trim() || (Array.isArray(m.responsibilities) && m.responsibilities.length));
}

export function findMissingFields(result: GeneratedProposal): string[] {
  const missing: string[] = [];
  if (!result.summary.trim()) missing.push("summary");
  if (!result.context.paragraph.trim()) missing.push("context.paragraph");
  if (!result.cards.objective.some(cardHasContent)) missing.push("objectiveCards");
  if (!result.cards.scope.some(cardHasContent)) missing.push("scopeCards");
  if (!result.roadmap.some(phaseHasContent)) missing.push("roadmap");
  if (!result.team.some(memberHasContent)) missing.push("team");
  if (!result.risks.some(riskHasContent)) missing.push("risks");
  return missing;
}

/**
 * Genera el contenido editorial de una propuesta a partir de una transcripcion.
 * No persiste nada: devuelve el shape tipado listo para que el modulo API lo guarde.
 */
export async function generateProposal(
  args: GenerateProposalArgs,
): Promise<GeneratedProposal> {
  const { transcript, notes, mode } = args;

  // 1. Compresion: passthrough en este repo (Claude maneja contextos grandes).
  const compressed = await compressIfNeeded(transcript, notes);

  // 2. Voz Niuro (constante en este repo, no hay voz por org).
  const voiceRules = getVoiceRules();

  // 3. Prompts.
  const { system, user } = buildFullGeneratePrompts(
    {
      transcript: compressed.transcript,
      notes: compressed.notes,
      mode,
      compressed: compressed.compressed,
    },
    voiceRules,
  );

  // 4. Llamada al modelo (Claude CLI, JSON robusto).
  const rawContent = await callLLM<RawLLMProposal>({ system, user });

  // 5-8. Post-proceso. Si algo falla (sanitizado, normalizacion o el check de
  // completitud), preservamos el rawContent caro (varios minutos de Sonnet)
  // adjuntandolo al error: run-generation lo escribe a disco para no perder el
  // trabajo y poder re-parsear sin re-generar.
  try {
    // 5. Sanitizado de voz recursivo (cero guiones largos, dict de reemplazos).
    const clean = cleanObject(rawContent);

    // 6. Mapeo al shape persistible del CRM (cards agrupadas, context anidado).
    const result: GeneratedProposal = {
      client: normClient(clean.client),
      pricing: normPricing(clean.pricing, mode),
      summary: asString(clean.summary),
      context: {
        paragraph: asString(clean.contextParagraph),
        dataPoints: asStringArray(clean.dataPoints),
      },
      cards: {
        objective: normCards(clean.objectiveCards),
        scope: normCards(clean.scopeCards),
        governance: normCards(clean.governanceCards),
      },
      roadmap: Array.isArray(clean.roadmap)
        ? clean.roadmap.map(normRoadmapPhase)
        : [],
      team: Array.isArray(clean.team) ? clean.team.map(normTeamMember) : [],
      risks: Array.isArray(clean.risks) ? clean.risks.map(normRisk) : [],
    };

    // role (staff-aug) / duration (sprint) son excluyentes segun el mode.
    if (mode === "staff-aug") {
      const role = asOptString(clean.role);
      if (role) result.role = role;
    } else {
      const duration = asOptString(clean.duration);
      if (duration) result.duration = duration;
    }

    // 7. Milestones de pago: solo sprint con total + startDate concretos.
    if (mode === "sprint" && result.pricing && "total" in result.pricing) {
      const { total, startDate } = result.pricing;
      if (total && startDate) {
        result.milestones = calcMilestones(total, startDate);
      }
    }

    // 8. Check de completitud: si el LLM devolvio un shape parcial, fallar fuerte
    // para que run-generation marque genStatus='error' (reintenta-ble) en vez de
    // persistir una propuesta 'ready' mutilada en silencio.
    const missing = findMissingFields(result);
    if (missing.length) {
      throw new Error(
        `La IA devolvio una propuesta incompleta (faltan: ${missing.join(", ")}). Reintenta la generacion.`,
      );
    }

    return result;
  } catch (e) {
    // Preservar el rawContent caro: lo adjuntamos al error para que el
    // orquestador (run-generation) lo persista a disco antes de marcar error.
    const err = e instanceof Error ? e : new Error(String(e));
    (err as Error & { rawContent?: unknown }).rawContent = rawContent;
    throw err;
  }
}

// Re-exports utiles para el modulo API y otros consumidores.
export { calcMilestones } from "@/lib/proposals-ai/prompts/full-generate";
export type {
  FullGenerateMode,
  Milestone,
} from "@/lib/proposals-ai/prompts/full-generate";
