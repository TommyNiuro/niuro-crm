// Helpers compartidos del módulo de Descripciones de Cargo (Job Descriptions).
//
// Espejo de src/lib/proposals.ts, más simple: la JD v1 no mueve el pipeline (no
// se "envía" con cambio de etapa), así que no lleva la maquinaria de
// applyStatusChange. La tabla job_descriptions guarda el contenido editorial
// como JSON en columnas TEXT; serializeJobDescription centraliza el parseo
// tolerante a null/JSON inválido para reusarlo en todos los GET.

import type { JobDescription } from "@/db/schema";
import type {
  JobDescriptionClient,
  JobDescriptionConditions,
  JobDescriptionProfile,
  JobDescriptionSuccessIndicator,
  JobDescriptionOnboarding,
  JobDescriptionViability,
  JobDescriptionStatus,
  JobDescriptionTemplate,
} from "@/types";

// Reusa el stringify genérico de propuestas (undefined = omitir, null =
// explícito, objeto = JSON.stringify, string = ya serializado).
export { stringifyJsonField } from "@/lib/proposals";

export const JOB_DESCRIPTION_STATUSES: JobDescriptionStatus[] = [
  "draft",
  "sent",
  "archived",
];

export const JOB_DESCRIPTION_TEMPLATES: JobDescriptionTemplate[] = [
  "compact",
  "intermediate",
  "full",
];

// Forma serializada: misma fila con los campos JSON ya parseados a objeto y los
// timestamps en epoch ms (lo que consume el cliente).
export interface SerializedJobDescription {
  id: string;
  contactId: string | null;
  dealId: string | null;
  status: string;
  template: string;
  client: JobDescriptionClient | null;
  roleTitle: string | null;
  transcript: string | null;
  notes: string | null;
  pitch: string | null;
  conditions: JobDescriptionConditions | null;
  about: string | null;
  roleObjective: string | null;
  responsibilities: string[] | null;
  profile: JobDescriptionProfile | null;
  powerSkills: string[] | null;
  notLookingFor: string[] | null;
  whyCompany: string | null;
  conditionsClosing: string | null;
  benefits: string | null;
  startDate: string | null;
  successIndicators: JobDescriptionSuccessIndicator[] | null;
  onboarding: JobDescriptionOnboarding | null;
  viability: JobDescriptionViability | null;
  generated: boolean;
  genStatus: string | null;
  genError: string | null;
  createdAt: number;
  updatedAt: number;
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toMs(value: Date | number | null): number | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.getTime() : value;
}

export function serializeJobDescription(
  row: JobDescription,
): SerializedJobDescription {
  return {
    id: row.id,
    contactId: row.contactId,
    dealId: row.dealId,
    status: row.status,
    template: row.template,
    client: parseJson<JobDescriptionClient>(row.client),
    roleTitle: row.roleTitle,
    transcript: row.transcript,
    notes: row.notes,
    pitch: row.pitch,
    conditions: parseJson<JobDescriptionConditions>(row.conditions),
    about: row.about,
    roleObjective: row.roleObjective,
    responsibilities: parseJson<string[]>(row.responsibilities),
    profile: parseJson<JobDescriptionProfile>(row.profile),
    powerSkills: parseJson<string[]>(row.powerSkills),
    notLookingFor: parseJson<string[]>(row.notLookingFor),
    whyCompany: row.whyCompany,
    conditionsClosing: row.conditionsClosing,
    benefits: row.benefits,
    startDate: row.startDate,
    successIndicators: parseJson<JobDescriptionSuccessIndicator[]>(
      row.successIndicators,
    ),
    onboarding: parseJson<JobDescriptionOnboarding>(row.onboarding),
    viability: parseJson<JobDescriptionViability>(row.viability),
    generated: row.generated,
    genStatus: row.genStatus,
    genError: row.genError,
    createdAt: toMs(row.createdAt) ?? 0,
    updatedAt: toMs(row.updatedAt) ?? 0,
  };
}
