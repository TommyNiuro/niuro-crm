/**
 * src/lib/jd-ai/index.ts · Generación de Descripciones de Cargo con IA (Claude CLI)
 *
 * Espejo de proposals-ai/index.ts. Reusa el mismo motor (callLLM -> runClaude
 * vía subprocess Claude), la estrategia de velocidad (3 bloques Haiku en
 * paralelo con fallback Sonnet single-call) y el patrón de sanitizado +
 * completitud. El contenido y el schema son de JD (ver prompts/generate.ts).
 *
 * NO guarda en DB: eso lo hace run-generation.ts. Devuelve el JSON listo.
 */
import { callLLM } from "@/lib/proposals-ai/client";
import { FAST_MODEL } from "@/lib/claude-subprocess";
import { getJdVoiceRules, cleanJdObject } from "@/lib/jd-ai/voice";
import {
  buildJdGeneratePrompts,
  buildJdGenerateChunkPrompts,
  type JdGenerateInput,
  type JdGenerateChunk,
} from "@/lib/jd-ai/prompts/generate";
import type {
  JobDescriptionClient,
  JobDescriptionConditions,
  JobDescriptionProfile,
  JobDescriptionSuccessIndicator,
  JobDescriptionOnboarding,
  JobDescriptionViability,
} from "@/types";

// Shape persistible que devuelve generateJobDescription (sin metadata de DB).
export type GeneratedJobDescription = {
  client: JobDescriptionClient;
  roleTitle: string;
  /** Gancho de una línea ("En resumen: buscamos..."). Puede traer <strong>. */
  pitch: string;
  conditions: JobDescriptionConditions;
  about: string;
  roleObjective: string;
  responsibilities: string[];
  profile: JobDescriptionProfile;
  powerSkills: string[];
  notLookingFor: string[];
  whyCompany: string;
  conditionsClosing: string;
  /** Beneficios como línea propia (herramientas de IA, mentoría). */
  benefits: string;
  /** Inicio esperado ("Septiembre 2026", "Lo antes posible", "(por confirmar)"). */
  startDate: string;
  /** Indicadores de éxito (ejes). Vacío si el material no permite inferirlos. */
  successIndicators: JobDescriptionSuccessIndicator[];
  /** Onboarding 30/60/90. Solo en plantilla full. null si no aplica. */
  onboarding: JobDescriptionOnboarding | null;
  /** Análisis Frankenstein. Interno: la UI lo muestra, el PDF nunca. */
  viability: JobDescriptionViability;
};

// Shape "plano" tal como lo emite el LLM (matchea el JSON del system prompt).
// Todo opcional: el modelo puede omitir o malformar campos; normalizamos abajo.
export type RawLLMJd = {
  client?: {
    name?: unknown;
    industry?: unknown;
    country?: unknown;
    website?: unknown;
  };
  roleTitle?: unknown;
  pitch?: unknown;
  conditions?: unknown;
  about?: unknown;
  roleObjective?: unknown;
  responsibilities?: unknown;
  profile?: unknown;
  powerSkills?: unknown;
  notLookingFor?: unknown;
  whyCompany?: unknown;
  conditionsClosing?: unknown;
  benefits?: unknown;
  startDate?: unknown;
  successIndicators?: unknown;
  onboarding?: unknown;
  viability?: unknown;
};

// ---------------------------------------------------------------------------
// Helpers de normalización (el LLM puede devolver tipos inesperados).
// ---------------------------------------------------------------------------

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asOptString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function normJdClient(v: RawLLMJd["client"]): JobDescriptionClient {
  const name = asString(v?.name) || "Empresa por confirmar";
  const client: JobDescriptionClient = { name };
  const industry = asOptString(v?.industry);
  const country = asOptString(v?.country);
  const website = asOptString(v?.website);
  if (industry) client.industry = industry;
  if (country) client.country = country;
  if (website) client.website = website;
  const initial = name.trim().charAt(0).toUpperCase();
  if (initial) client.initial = initial;
  return client;
}

export function normConditions(v: unknown): JobDescriptionConditions {
  if (!isRecord(v)) return {};
  const out: JobDescriptionConditions = {};
  const keys: (keyof JobDescriptionConditions)[] = [
    "location",
    "compensation",
    "dedication",
    "modality",
    "reportsTo",
    "teamSize",
  ];
  for (const k of keys) {
    const val = asOptString(v[k]);
    if (val) out[k] = val;
  }
  return out;
}

export function normProfile(v: unknown): JobDescriptionProfile {
  if (!isRecord(v)) return { experience: "", stackMust: [], stackNice: [] };
  return {
    experience: asString(v.experience),
    stackMust: asStringArray(v.stackMust),
    stackNice: asStringArray(v.stackNice),
  };
}

export function normOnboarding(v: unknown): JobDescriptionOnboarding | null {
  if (!isRecord(v)) return null;
  const d30 = asString(v.d30);
  const d60 = asString(v.d60);
  const d90 = asString(v.d90);
  if (!d30.trim() && !d60.trim() && !d90.trim()) return null;
  return { d30, d60, d90 };
}

export function normSuccessIndicators(v: unknown): JobDescriptionSuccessIndicator[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isRecord)
    .map((r) => ({ axis: asString(r.axis), meaning: asString(r.meaning) }))
    .filter((i) => i.axis.trim() || i.meaning.trim());
}

export function normViability(v: unknown): JobDescriptionViability {
  if (!isRecord(v)) return { status: "viable", note: "" };
  const status = v.status === "warning" ? "warning" : "viable";
  return { status, note: asString(v.note) };
}

// ---------------------------------------------------------------------------
// Completitud: el LLM puede devolver JSON válido pero PARCIAL (cortado por
// tokens). Sin este check, los normalizadores rellenan vacíos y se persiste una
// JD 'ready' a medias. viability y conditions NO se exigen (viability es interno
// y default 'viable'; conditions puede quedar con huecos '(por confirmar)').
// ---------------------------------------------------------------------------
// Solo el core UNIVERSAL (presente en todas las plantillas, incluida compact).
// pitch/powerSkills/notLookingFor/whyCompany/successIndicators/onboarding son
// condicionales por plantilla; conditionsClosing es legacy (ya no se genera, la
// Condiciones se arma de conditions+startDate+benefits). No se exigen.
export function findMissingJdFields(r: GeneratedJobDescription): string[] {
  const missing: string[] = [];
  if (!r.roleTitle.trim()) missing.push("roleTitle");
  if (!r.about.trim()) missing.push("about");
  if (!r.roleObjective.trim()) missing.push("roleObjective");
  if (!r.responsibilities.length) missing.push("responsibilities");
  if (!r.profile.experience.trim() && !r.profile.stackMust.length)
    missing.push("profile");
  return missing;
}

export type GenerateJobDescriptionArgs = JdGenerateInput;

/**
 * Genera el contenido editorial de una JD a partir de una transcripción.
 * No persiste nada. Camino rápido: 3 llamadas Haiku EN PARALELO (core / profile
 * / closing). Si falla por lo que sea, cae al camino Sonnet single-call.
 */
export async function generateJobDescription(
  args: GenerateJobDescriptionArgs,
): Promise<GeneratedJobDescription> {
  try {
    return await generateJdFast(args);
  } catch (e) {
    console.error(
      "[jd-ai] camino rápido (Haiku paralelo) falló, fallback a Sonnet:",
      e instanceof Error ? e.message : e,
    );
    return await generateJdSingle(args);
  }
}

async function generateJdFast(
  args: GenerateJobDescriptionArgs,
): Promise<GeneratedJobDescription> {
  const voiceRules = getJdVoiceRules();
  const chunks: JdGenerateChunk[] = ["core", "profile", "closing"];
  const parts = await Promise.all(
    chunks.map((chunk) => {
      const { system, user } = buildJdGenerateChunkPrompts(args, voiceRules, chunk);
      return callLLM<RawLLMJd>({ system, user, model: FAST_MODEL, timeoutMs: 240_000 });
    }),
  );
  // Merge de los 3 bloques (claves disjuntas por diseño del schema).
  const raw: RawLLMJd = { ...parts[0], ...parts[1], ...parts[2] };
  return postProcess(raw);
}

async function generateJdSingle(
  args: GenerateJobDescriptionArgs,
): Promise<GeneratedJobDescription> {
  const voiceRules = getJdVoiceRules();
  const { system, user } = buildJdGeneratePrompts(args, voiceRules);
  const raw = await callLLM<RawLLMJd>({ system, user });
  return postProcess(raw);
}

// Post-proceso compartido: sanitiza, mapea al shape persistible y chequea
// completitud. Preserva el rawContent caro en el error para no re-generar.
function postProcess(raw: RawLLMJd): GeneratedJobDescription {
  try {
    const clean = cleanJdObject(raw);
    const result: GeneratedJobDescription = {
      client: normJdClient(clean.client),
      roleTitle: asString(clean.roleTitle),
      pitch: asString(clean.pitch),
      conditions: normConditions(clean.conditions),
      about: asString(clean.about),
      roleObjective: asString(clean.roleObjective),
      responsibilities: asStringArray(clean.responsibilities),
      profile: normProfile(clean.profile),
      powerSkills: asStringArray(clean.powerSkills),
      notLookingFor: asStringArray(clean.notLookingFor),
      whyCompany: asString(clean.whyCompany),
      conditionsClosing: asString(clean.conditionsClosing),
      benefits: asString(clean.benefits),
      startDate: asString(clean.startDate),
      successIndicators: normSuccessIndicators(clean.successIndicators),
      onboarding: normOnboarding(clean.onboarding),
      viability: normViability(clean.viability),
    };

    const missing = findMissingJdFields(result);
    if (missing.length) {
      throw new Error(
        `La IA devolvió una JD incompleta (faltan: ${missing.join(", ")}). Reintenta la generación.`,
      );
    }
    return result;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    (err as Error & { rawContent?: unknown }).rawContent = raw;
    throw err;
  }
}

// Re-exports para el módulo de refine (merge granular de patches).
export { asString, asStringArray, asOptString };
export type { JdGenerateChunk };
