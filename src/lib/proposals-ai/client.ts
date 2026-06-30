/**
 * src/lib/proposals-ai/client.ts · Adaptador LLM para propuestas (Claude CLI)
 *
 * Reemplaza el cliente Groq/Llama de propuestas-niuro (src/lib/ai/client.ts) por
 * el subprocess Claude del CRM (src/lib/claude-subprocess.ts → runClaude).
 *
 * Contrato: callLLM({ system, user }) CONCATENA system + "\n\n" + user en un solo
 * prompt (la API de Claude CLI es un unico prompt, no roles separados), llama
 * runClaude con DEFAULT_MODEL y timeout de 120s, y parsea la respuesta como JSON
 * de forma robusta. runClaude ya quita los fences markdown, pero validamos igual:
 * intentamos JSON.parse del texto completo y, si falla, extraemos el primer
 * bloque {...} balanceado.
 */
import { runClaude, DEFAULT_MODEL } from "@/lib/claude-subprocess";

export type CallLLMOptions = {
  system: string;
  user: string;
  /** Override del modelo. Default DEFAULT_MODEL (sonnet) para calidad editorial. */
  model?: string;
  /**
   * Override del timeout. Default 600s (10 min): una propuesta completa (summary
   * + context + 5 dataPoints + 4+6+4 cards + roadmap + team + risks) es mucho
   * output para Sonnet vía subprocess (en la práctica ~4 min), y ademas compite
   * por el semaforo global (max 2) con los servicios background del CRM. 120s se
   * quedaba corto; 300s tambien rozaba el límite con el semaforo ocupado.
   */
  timeoutMs?: number;
};

/**
 * Extrae el primer objeto JSON balanceado de un texto que puede traer prosa
 * antes/despues. Cuenta llaves respetando strings y escapes para no cortar en
 * un "{" que viva dentro de un string del JSON. Devuelve null si no hay objeto.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parseo JSON defensivo. Replica el del cliente Groq del origen pero endurecido:
 *   1. JSON.parse del texto trimmeado.
 *   2. Si falla, extrae el primer bloque {...} balanceado y lo parsea.
 *   3. Si todo falla, lanza con un preview del texto para diagnostico.
 */
function parseJsonRobust<T>(text: string): T {
  const trimmed = (text || "").trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const block = extractFirstJsonObject(trimmed);
    if (block) {
      // Un segundo intento: el bloque balanceado puede seguir siendo invalido
      // (p.ej. el modelo corto la respuesta). Dejamos que el throw burbujee.
      return JSON.parse(block) as T;
    }
    throw new Error(
      "Respuesta del LLM no contiene JSON parseable: " + trimmed.slice(0, 200),
    );
  }
}

/**
 * Llama al modelo con el par {system, user} y devuelve el objeto tipado.
 * Concatena system + "\n\n" + user y delega en runClaude (semaforo global,
 * strip de fences, cleanup de tmp incluidos en el subprocess del CRM).
 */
export async function callLLM<T = unknown>(opts: CallLLMOptions): Promise<T> {
  const { system, user, model = DEFAULT_MODEL, timeoutMs = 600_000 } = opts;
  const prompt = `${system}\n\n${user}`;
  const raw = await runClaude(prompt, { model, timeoutMs });
  return parseJsonRobust<T>(raw);
}
