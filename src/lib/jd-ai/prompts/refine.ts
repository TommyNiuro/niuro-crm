/**
 * src/lib/jd-ai/prompts/refine.ts · Prompt del chat de ajustes de una JD.
 *
 * Espejo de proposals-ai/prompts/refine.ts. Recibe el estado ACTUAL de la JD +
 * una instrucción de Tomás ("acortá responsabilidades", "el sueldo es CLP 5M",
 * "aterrizá el rol a Fullstack") y devuelve solo un PATCH: las claves que
 * cambian, con los mismos nombres del estado actual.
 *
 * La instrucción viene de Tomás (usuario interno), no de un tercero: no hace
 * falta la advertencia de "datos, no instrucciones".
 */
import { getJdVoiceRules } from "@/lib/jd-ai/voice";

// Estado actual en el shape "plano" que consume/emite el motor de JD.
export type FlatJdState = {
  client?: { name?: string; industry?: string; country?: string; website?: string };
  roleTitle?: string;
  pitch?: string;
  conditions?: unknown;
  about?: string;
  roleObjective?: string;
  responsibilities?: string[];
  profile?: unknown;
  powerSkills?: string[];
  notLookingFor?: string[];
  whyCompany?: string;
  conditionsClosing?: string;
  benefits?: string;
  startDate?: string;
  successIndicators?: unknown;
  onboarding?: unknown;
  viability?: unknown;
};

function buildSystem(voiceRules: string): string {
  return `Sos el editor de Descripciones de Cargo de Niuro. ${voiceRules}

Se te da el JSON actual de una JD y una instrucción de cambio de Tomás (usuario interno, confiable).

Tu trabajo: aplicar SOLO el cambio pedido y devolver un PATCH mínimo: únicamente las claves del JSON que cambiaron, con el MISMO formato/nombres que el estado actual. No repitas claves que no cambiaron. No reescribas todo el documento salvo que la instrucción lo pida.

Reglas de formato (mismas que la generación):
- Español con tildes completas. Sin guion largo (—).
- Sin palabras prohibidas (adicionalmente, crucial, fundamental, robusto, seamless, transformador, innovador, panorama, intrincado, valioso, vibrante) ni fórmulas prohibidas.
- Moneda explícita por país: Chile CLP (típico "líquidos mensuales"), México u otros "USD X,XXX" aclarando dólares. Si no hay dato, "(por confirmar)". Nunca inventes montos.
- Si Tomás pide aterrizar o cambiar el rol (viabilidad Frankenstein), actualizá roleTitle y lo que dependa, y de paso actualizá viability.status/note.

QUÉ es texto fijo (NO editable por este chat):
- La línea de relación laboral con Niuro (contrato, nómina, vacaciones y compliance gestionados por Niuro; el talento se integra 100% al equipo del cliente) es texto FIJO de plantilla en el documento. Si piden cambiarla, decilo en explanation y no devuelvas patch para eso.
- conditionsClosing SÍ es editable (compensación, modalidad, inicio, beneficios).

DEVUELVE SOLO ESTE JSON (sin texto antes ni después):
{
  "patch": { "<claves que cambian, mismo formato que el estado actual>": "..." },
  "explanation": "Máximo 20 palabras, en español, contándole a Tomás qué cambiaste."
}`;
}

function buildUser(currentState: FlatJdState, instruction: string): string {
  return `ESTADO ACTUAL DE LA JD (JSON):
═══════════════════════════════════════════════
${JSON.stringify(currentState, null, 2)}
═══════════════════════════════════════════════

INSTRUCCIÓN DE TOMÁS: ${instruction}

Devolvé el patch.`;
}

export function buildJdRefinePrompts(
  currentState: FlatJdState,
  instruction: string,
): { system: string; user: string } {
  return {
    system: buildSystem(getJdVoiceRules()),
    user: buildUser(currentState, instruction),
  };
}
