/**
 * src/lib/proposals-ai/prompts/refine.ts · Prompt del chat de ajustes.
 *
 * A diferencia de full-generate (arma todo desde cero), refine recibe el
 * estado ACTUAL de la propuesta + una instrucción del vendedor ("subi el tono
 * competitivo", "acorta el resumen") y devuelve solo un PATCH: las claves que
 * cambian. Mismo naming plano que full-generate (objectiveCards, scopeCards,
 * contextParagraph, dataPoints, ...) para reusar los normalizadores existentes.
 *
 * La instrucción viene del vendedor (usuario interno autenticado), no de un
 * tercero: no hace falta la advertencia de "datos, no instrucciones" que sí
 * lleva el prompt de full-generate para transcript/notas.
 */
import { getVoiceRules } from "@/lib/proposals-ai/voice";
import type { FullGenerateMode } from "@/lib/proposals-ai/prompts/full-generate";

// Estado actual en el mismo shape "plano" que emite/consume full-generate.
export type FlatProposalState = {
  client?: { name?: string; industry?: string; country?: string; website?: string };
  role?: string;
  duration?: string;
  /** Fecha display de la propuesta, ej "Julio 2026". */
  date?: string;
  pricing?: unknown;
  summary?: string;
  contextParagraph?: string;
  dataPoints?: string[];
  objectiveCards?: unknown[];
  scopeCards?: unknown[];
  governanceCards?: unknown[];
  roadmap?: unknown[];
  team?: unknown[];
  risks?: unknown[];
};

function buildSystem(mode: FullGenerateMode, voiceRules: string): string {
  return `Sos el editor de propuestas comerciales de Niuro. ${voiceRules}

Se te da el JSON actual de una propuesta (modo ${mode === "staff-aug" ? "Staff Augmentation" : "Project Sprint"}) y una instrucción de cambio de un vendedor de Niuro (usuario interno, confiable).

Tu trabajo: aplicar SOLO el cambio pedido y devolver un PATCH minimo: unicamente las claves del JSON que cambiaron, con el MISMO formato/nombres que el estado actual. No repitas ni devuelvas claves que no cambiaron. No reescribas todo el documento salvo que la instruccion lo pida explicitamente.

Reglas de formato (igual que el resto de la propuesta):
- Cards: 22-35 palabras, sin frases huecas ni palabras prohibidas (potenciar, robusto, transformador, seamless, sinergias, leverage, empower, crucial). Sin guion largo (—).
- dataPoints: bullets con label en <strong>:</strong>.
- Si la instruccion pide algo que no aplica a esta propuesta (ej. "agrega pricing" sin datos reales), dejalo como esta y explicalo.

QUE controla cada campo en el documento renderizado (importante para no confundir al vendedor):
- La linea "Esquema final de presencialidad" de Condiciones comerciales LEE team[0].modality: si piden cambiar la modalidad/presencialidad, actualiza team[0].modality (ej. "Full-time dedicado · Remoto").
- "date" es la fecha display de la portada (ej. "Julio 2026").
- El RESTO de la tabla de Condiciones comerciales (duracion 12 meses, onboarding, facturacion via Niuro Chile/Mexico) es texto FIJO de plantilla: NO es editable por este chat. Si piden cambiar eso, decilo claro en explanation ("eso es texto fijo de la plantilla, se cambia en el codigo") y no devuelvas patch.

DEVUELVE SOLO ESTE JSON (sin texto antes ni despues):
{
  "patch": { "<claves que cambian, mismo formato que el estado actual>": "..." },
  "explanation": "Maximo 20 palabras, en español, contandole al vendedor que cambiaste."
}`;
}

function buildUser(currentState: FlatProposalState, instruction: string): string {
  return `ESTADO ACTUAL DE LA PROPUESTA (JSON):
═══════════════════════════════════════════════
${JSON.stringify(currentState, null, 2)}
═══════════════════════════════════════════════

INSTRUCCION DEL VENDEDOR: ${instruction}

Devolve el patch.`;
}

export function buildRefinePrompts(
  currentState: FlatProposalState,
  instruction: string,
  mode: FullGenerateMode,
): { system: string; user: string } {
  return {
    system: buildSystem(mode, getVoiceRules()),
    user: buildUser(currentState, instruction),
  };
}
