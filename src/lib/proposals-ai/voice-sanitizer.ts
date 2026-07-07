/**
 * src/lib/proposals-ai/voice-sanitizer.ts · Post-procesa output de IA para limpiar voz
 *
 * Portado literal de propuestas-niuro/src/lib/ai/voice-sanitizer.ts. Aplica:
 *   - Diccionario de reemplazos (potenciar->mejorar, robusto->solido, etc.)
 *   - Guion largo (—) -> coma o dos puntos segun contexto
 *   - cleanObject(obj): recorre recursivamente strings dentro de objetos/arrays
 *
 * REGLA INVIOLABLE: cero guiones largos en output. Es bug critico.
 */

/**
 * Diccionario de reemplazos. Las keys son `word boundary` insensitive case
 * (regex `\b`). Para "soluciones innovadoras" usa frase completa.
 */
export const REPLACEMENTS: Record<string, string> = {
  potenciar: "mejorar",
  potenciamos: "mejoramos",
  robusto: "sólido",
  robusta: "sólida",
  transformador: "profundo",
  transformadora: "profunda",
  sinergias: "alineación",
  sinergia: "alineación",
  leverage: "aprovechar",
  empower: "habilitar",
  empoderar: "habilitar",
  crucial: "clave",
  holístico: "integral",
  holistico: "integral",
  "soluciones innovadoras": "soluciones concretas",
  "sin lugar a dudas": "claramente",
  profundamente: "mucho",
  seamless: "fluido",
  adicionalmente: "además",
  fundamental: "esencial",
  panorama: "contexto",
  outsourcing: "colaboración",
  reclutamiento: "búsqueda de talento",
  reclutador: "especialista en talento",
};

/**
 * Reemplaza palabras prohibidas y guiones largos en un string.
 * - "x — y" -> "x: y" (con espacios)
 * - "x—y" -> "x,y" (sin espacios)
 * - Palabras del dict: case-insensitive, word-boundary
 */
export function cleanVoice(text: string): string {
  if (!text || typeof text !== "string") return text;
  let cleaned = text;
  for (const [bad, good] of Object.entries(REPLACEMENTS)) {
    const re = new RegExp("\\b" + bad + "\\b", "gi");
    cleaned = cleaned.replace(re, good);
  }
  cleaned = cleaned.replace(/\s—\s/g, ": ").replace(/—/g, ",");
  // Negrita markdown -> <strong>: el renderer espera HTML inline. Haiku a veces
  // devuelve **texto** aunque el prompt pida <strong>, y los asteriscos
  // aparecian literales en el documento (detectado 2026-07-05 con la
  // generacion rapida en paralelo).
  cleaned = cleaned.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return cleaned;
}

/**
 * Recorre un objeto/array recursivamente aplicando cleanVoice a todos los
 * strings. Util para sanitizar respuestas JSON completas del LLM antes de
 * persistir.
 */
export function cleanObject<T>(obj: T): T {
  if (obj == null) return obj;
  if (typeof obj === "string") return cleanVoice(obj) as unknown as T;
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanObject(item)) as unknown as T;
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      out[k] = cleanObject((obj as Record<string, unknown>)[k]);
    }
    return out as unknown as T;
  }
  return obj;
}
