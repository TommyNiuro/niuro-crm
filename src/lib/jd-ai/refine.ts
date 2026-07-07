/**
 * src/lib/jd-ai/refine.ts · Chat de ajustes de una JD (patch parcial).
 *
 * Espejo de proposals-ai/refine.ts. Parte de una JD YA generada + una
 * instrucción de Tomás y pide al LLM solo el patch de lo que cambia. Merge
 * granular: solo se pisan las columnas cuyas claves vinieron en el patch.
 */
import { callLLM } from "@/lib/proposals-ai/client";
import {
  normJdClient,
  normConditions,
  normProfile,
  normSuccessIndicators,
  normOnboarding,
  normViability,
  asString,
  asStringArray,
  asOptString,
  type RawLLMJd,
} from "@/lib/jd-ai";
import { cleanJdObject } from "@/lib/jd-ai/voice";
import { buildJdRefinePrompts, type FlatJdState } from "@/lib/jd-ai/prompts/refine";
import type { SerializedJobDescription } from "@/lib/job-descriptions";

export type JdRefineResult = {
  /** Columnas a persistir (ya serializadas donde corresponde). Solo las que cambiaron. */
  dbPatch: Record<string, string | null>;
  changedFields: string[];
  explanation: string;
};

function toFlatState(jd: SerializedJobDescription): FlatJdState {
  return {
    client: jd.client ?? undefined,
    roleTitle: jd.roleTitle ?? undefined,
    pitch: jd.pitch ?? undefined,
    conditions: jd.conditions ?? undefined,
    about: jd.about ?? undefined,
    roleObjective: jd.roleObjective ?? undefined,
    responsibilities: jd.responsibilities ?? undefined,
    profile: jd.profile ?? undefined,
    powerSkills: jd.powerSkills ?? undefined,
    notLookingFor: jd.notLookingFor ?? undefined,
    whyCompany: jd.whyCompany ?? undefined,
    conditionsClosing: jd.conditionsClosing ?? undefined,
    benefits: jd.benefits ?? undefined,
    startDate: jd.startDate ?? undefined,
    successIndicators: jd.successIndicators ?? undefined,
    onboarding: jd.onboarding ?? undefined,
    viability: jd.viability ?? undefined,
  };
}

type RawJdPatch = RawLLMJd;

export async function refineJobDescription(
  existing: SerializedJobDescription,
  instruction: string,
): Promise<JdRefineResult> {
  const { system, user } = buildJdRefinePrompts(toFlatState(existing), instruction);

  const raw = await callLLM<{ patch?: RawJdPatch; explanation?: unknown }>({
    system,
    user,
    timeoutMs: 180_000,
  });

  const patch = cleanJdObject((raw.patch ?? {}) as RawJdPatch);
  const explanation = asString(raw.explanation) || "Listo, apliqué el cambio.";

  const dbPatch: Record<string, string | null> = {};
  const changedFields: string[] = [];

  if (patch.client !== undefined) {
    dbPatch.client = JSON.stringify(normJdClient(patch.client));
    changedFields.push("client");
  }
  if (patch.roleTitle !== undefined) {
    const rt = asOptString(patch.roleTitle);
    if (rt) {
      dbPatch.roleTitle = rt;
      changedFields.push("roleTitle");
    }
  }
  if (patch.pitch !== undefined) {
    dbPatch.pitch = asString(patch.pitch);
    changedFields.push("pitch");
  }
  if (patch.conditions !== undefined) {
    dbPatch.conditions = JSON.stringify(normConditions(patch.conditions));
    changedFields.push("conditions");
  }
  if (patch.about !== undefined) {
    dbPatch.about = asString(patch.about);
    changedFields.push("about");
  }
  if (patch.roleObjective !== undefined) {
    dbPatch.roleObjective = asString(patch.roleObjective);
    changedFields.push("roleObjective");
  }
  if (patch.responsibilities !== undefined) {
    dbPatch.responsibilities = JSON.stringify(asStringArray(patch.responsibilities));
    changedFields.push("responsibilities");
  }
  if (patch.profile !== undefined) {
    dbPatch.profile = JSON.stringify(normProfile(patch.profile));
    changedFields.push("profile");
  }
  if (patch.powerSkills !== undefined) {
    dbPatch.powerSkills = JSON.stringify(asStringArray(patch.powerSkills));
    changedFields.push("powerSkills");
  }
  if (patch.notLookingFor !== undefined) {
    dbPatch.notLookingFor = JSON.stringify(asStringArray(patch.notLookingFor));
    changedFields.push("notLookingFor");
  }
  if (patch.whyCompany !== undefined) {
    dbPatch.whyCompany = asString(patch.whyCompany);
    changedFields.push("whyCompany");
  }
  if (patch.conditionsClosing !== undefined) {
    dbPatch.conditionsClosing = asString(patch.conditionsClosing);
    changedFields.push("conditionsClosing");
  }
  if (patch.benefits !== undefined) {
    dbPatch.benefits = asString(patch.benefits);
    changedFields.push("benefits");
  }
  if (patch.startDate !== undefined) {
    dbPatch.startDate = asString(patch.startDate);
    changedFields.push("startDate");
  }
  if (patch.successIndicators !== undefined) {
    dbPatch.successIndicators = JSON.stringify(normSuccessIndicators(patch.successIndicators));
    changedFields.push("successIndicators");
  }
  if (patch.onboarding !== undefined) {
    dbPatch.onboarding = JSON.stringify(normOnboarding(patch.onboarding));
    changedFields.push("onboarding");
  }
  if (patch.viability !== undefined) {
    dbPatch.viability = JSON.stringify(normViability(patch.viability));
    changedFields.push("viability");
  }

  return { dbPatch, changedFields, explanation };
}
