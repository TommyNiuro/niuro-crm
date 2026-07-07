/**
 * src/lib/jd-ai/voice.ts · Voz + sanitizado para Descripciones de Cargo
 *
 * Espejo de proposals-ai/voice.ts pero con las reglas de la skill
 * niuro-descripcion-cargo (spec de contenido). Diferencias con la voz de
 * propuestas: el entregable lo lee un CANDIDATO (no un founder cliente), es un
 * documento sobrio tipo CER, y tiene su propia lista de palabras/fórmulas
 * prohibidas.
 *
 * El sanitizado reusa cleanObject de propuestas (garantía crítica: cero guiones
 * largos + swaps compartidos) y le suma las palabras que solo prohíbe la JD.
 */
import { cleanObject } from "@/lib/proposals-ai/voice-sanitizer";

// Reemplazos que la skill de JD prohíbe y que no cubre el dict de propuestas.
// Se aplican DESPUÉS de cleanObject (que ya mata guiones largos y el resto).
const JD_EXTRA_REPLACEMENTS: Record<string, string> = {
  innovador: "concreto",
  innovadora: "concreta",
  intrincado: "complejo",
  intrincada: "compleja",
  valioso: "útil",
  valiosa: "útil",
  vibrante: "activo",
};

export const NIURO_JD_VOICE = `Voz Niuro para Descripciones de Cargo (no negociable). Actúas como un consultor senior de Tech Recruitment escribiendo un documento que va a leer un candidato:
- Español completo siempre: tildes (á é í ó ú), ñ, diéresis y signos de apertura ¿ ¡. Una tilde que falta es un defecto.
- Tono sobrio, pedagógico y concreto. Founder a founder cuando cabe, pero profesional: el candidato lo lee.
- NUNCA guion largo (—). Usa coma, dos puntos o paréntesis.
- Palabras PROHIBIDAS (rechaza tu propia respuesta si las usas): adicionalmente, crucial, fundamental, robusto, seamless, transformador, innovador, panorama, intrincado, valioso, vibrante, outsourcing, reclutamiento, reclutador.
- Fórmulas PROHIBIDAS: "No es X, es Y", "En un mundo donde...", "La clave está en...", "Llevar al siguiente nivel", cierres genéricos de reclutamiento.
- No lideres con "staff augmentation" como concepto. La relación laboral se describe como hecho contractual (Niuro gestiona contrato, nómina, vacaciones y compliance; el talento se integra 100% al equipo del cliente).
- Concreto y específico de ESTA empresa: datos reales del material (años de operación, tracción, stack, stakeholders). Nada que sirva para cualquier startup.
- Si falta un dato material, escribe "(por confirmar)". NUNCA inventes montos, nombres, fechas ni URLs.
- Coffee test: ¿lo diría un consultor senior tomando café? Si suena a corporativo o a IA, reescríbelo.`;

/** Snippet de voz para inyectar en el system prompt de generación/refine. */
export function getJdVoiceRules(): string {
  return NIURO_JD_VOICE;
}

/**
 * Sanitiza el output del LLM: cleanObject de propuestas (cero guiones largos +
 * dict compartido) y luego los reemplazos extra propios de la JD.
 */
export function cleanJdObject<T>(obj: T): T {
  const base = cleanObject(obj);
  return applyExtra(base);
}

function applyExtra<T>(obj: T): T {
  if (obj == null) return obj;
  if (typeof obj === "string") {
    let s = obj as string;
    for (const [bad, good] of Object.entries(JD_EXTRA_REPLACEMENTS)) {
      s = s.replace(new RegExp("\\b" + bad + "\\b", "gi"), good);
    }
    return s as unknown as T;
  }
  if (Array.isArray(obj)) return obj.map((x) => applyExtra(x)) as unknown as T;
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      out[k] = applyExtra((obj as Record<string, unknown>)[k]);
    }
    return out as unknown as T;
  }
  return obj;
}
