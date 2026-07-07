import { runClaude, DEFAULT_MODEL } from "@/lib/claude-subprocess";
import {
  query_records,
  get_record,
  count_records,
  search,
  propose_update,
  propose_create,
  describeSchema,
  type ProposedAction,
} from "./tools";

// Copiloto IA con tool-use sobre los datos del CRM (b6-chat-backend). No usa la
// API de tool-use de Anthropic (corremos el CLI de Claude Max via runClaude, que
// devuelve texto). Armamos el loop a mano: la IA responde un JSON con {tool,args}
// o {answer, actions?}; ejecutamos las read tools y reinyectamos el resultado,
// hasta {answer} o un tope de iteraciones.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface ToolTraceEntry {
  tool: string;
  args: unknown;
  result?: unknown;
  error?: string;
}

export interface CopilotResult {
  answer: string;
  actions: ProposedAction[];
  toolTrace: ToolTraceEntry[];
}

const MAX_ITERATIONS = 5;

// Nombres canonicos de tools. El checkbox de Settings > IA guardaba una restriccion
// que nunca se aplicaba en ningun lado (auditoria de arquitectura de agentes,
// hallazgo Medium) — ahora runCopilot la recibe y la hace cumplir de verdad.
export const ALL_TOOLS = ["query_records", "get_record", "count_records", "search", "propose_update", "propose_create"] as const;

function systemPrompt(allowedTools: readonly string[]): string {
  const restricted = allowedTools.length < ALL_TOOLS.length;
  return `Sos el copiloto IA de un CRM (Niuro). Respondes preguntas sobre los datos y propones cambios, SIEMPRE en espanol y sin guion largo.
${restricted ? `\nHerramientas habilitadas para este agente: ${allowedTools.join(", ")}. Cualquier otra herramienta no esta disponible y te va a devolver un error — no la intentes.\n` : ""}

Tenes estos objetos (tablas) con sus columnas:
${describeSchema()}

Notas de datos:
- "caliente" / "hot" = contacts.temperature = 'hot'; "tibio"/"warm"; "frio"/"cold".
- Montos en CENTAVOS: contacts.value_cents Y deals.value (ambos en centavos, misma escala). Para MOSTRAR o proponer un monto en pesos/dólares dividí por 100; al ESCRIBIR un monto multiplicá por 100 (ej. USD 5.000 -> value 500000). Nunca escribas el monto en unidad cruda.
- Fechas (created_at, updated_at, ...) son epoch en segundos.

Para responder usas HERRAMIENTAS. En cada turno respondes EXCLUSIVAMENTE un objeto JSON (sin texto fuera del JSON, sin markdown) con UNA de estas formas:

1) Llamar una herramienta de lectura:
{"tool":"count_records","args":{"objectName":"contacts","filters":{"temperature":"hot"}}}
{"tool":"query_records","args":{"objectName":"deals","filters":{"probability":{"op":"gte","value":50}},"limit":20}}
{"tool":"get_record","args":{"objectName":"contacts","id":"<id>"}}
{"tool":"search","args":{"text":"acme"}}

filters: un objeto {columna: valor} (igualdad) o {columna: {"op":"gte|lte|gt|lt|ne|like","value":...}}. Solo columnas legibles. Para buscar un registro por nombre, primero usa search para conseguir su id.

2) Proponer un cambio (NO se ejecuta solo; el usuario lo confirma):
{"tool":"propose_update","args":{"objectName":"contacts","id":"<id>","fields":{"temperature":"warm"}}}
{"tool":"propose_create","args":{"objectName":"contacts","fields":{"name":"Juan","email":"j@x.com"}}}

3) Responder al usuario (turno final):
{"answer":"Tenes 9 contactos calientes.","actions":[]}

Reglas:
- Responde SOLO el JSON, nada mas.
- No inventes datos: si necesitas un numero o un registro, usa una herramienta primero.
- Cuando ya tengas la info, devolve {"answer":...}. Si propusiste cambios, incluilos en "actions" (array de las acciones propuestas que hiciste) ademas de explicarlos en "answer".
- Maximo ${MAX_ITERATIONS} pasos: se eficiente.`;
}

// Ejecuta una read tool por nombre. Las write tools (propose_*) no se ejecutan
// aca: devuelven una accion que se acumula y se entrega al usuario.
// Valida y filtra las actions que la IA declaro en un turno final ({"answer":...,
// "actions":[...]}). Es una via DISTINTA a la del tool-call explicito
// ({"tool":"propose_update",...}) para proponer un write, asi que necesita el
// MISMO gate de tools o un agente restringido a solo-lectura podia igual
// proponer cambios saltandose la restriccion (auditoria adversarial).
export function filterDeclaredActions(declared: unknown[], allowedTools: readonly string[]): ProposedAction[] {
  const out: ProposedAction[] = [];
  for (const a of declared) {
    try {
      const obj = a as Record<string, unknown>;
      const kind = obj.kind ?? (obj.id ? "update" : "create");
      const toolName = kind === "update" ? "propose_update" : "propose_create";
      if (!allowedTools.includes(toolName)) continue;
      out.push(
        kind === "update"
          ? propose_update(String(obj.objectName), String(obj.id), obj.fields)
          : propose_create(String(obj.objectName), obj.fields)
      );
    } catch {
      // accion mal formada: la ignoramos en silencio (no rompe la respuesta)
    }
  }
  return out;
}

export function runReadTool(tool: string, args: Record<string, unknown>, allowedTools: readonly string[]): unknown {
  if (!allowedTools.includes(tool)) throw new Error(`herramienta no habilitada para este agente: ${tool}`);
  switch (tool) {
    case "count_records":
      return count_records(String(args.objectName), args.filters);
    case "query_records":
      return query_records(String(args.objectName), args.filters, args.limit as number | undefined);
    case "get_record":
      return get_record(String(args.objectName), String(args.id));
    case "search":
      return search(String(args.text));
    default:
      throw new Error(`tool de lectura desconocida: ${tool}`);
  }
}

// Extrae el primer objeto JSON del texto de la IA. runClaude ya hace strip de
// fences markdown, pero la IA a veces antepone prosa: tomamos del primer { al
// ultimo } balanceado-ish. Lanza si no hay JSON parseable.
function parseModelJSON(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("la IA no devolvio JSON valido");
  }
}

// systemOverride: si se pasa, se antepone al system prompt base (lo usa el
// "Probar agente" de Settings IA para inyectar el rol/prompt de un ai_agent).
export async function runCopilot(
  messages: ChatMessage[],
  systemOverride?: string,
  allowedTools?: string[]
): Promise<CopilotResult> {
  const toolTrace: ToolTraceEntry[] = [];
  const actions: ProposedAction[] = [];
  const tools: readonly string[] =
    allowedTools && allowedTools.length > 0 ? allowedTools.filter((t) => (ALL_TOOLS as readonly string[]).includes(t)) : ALL_TOOLS;

  // Historial de conversacion + scratchpad del loop, todo en un solo prompt de
  // texto (el CLI no tiene roles de tool nativos). Reinyectamos resultados como
  // texto "RESULTADO DE LA HERRAMIENTA".
  const history = messages
    .map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`)
    .join("\n");

  const sys = systemOverride ? `${systemOverride}\n\n${systemPrompt(tools)}` : systemPrompt(tools);
  let scratch = `${sys}\n\n--- Conversacion ---\n${history}\n\nResponde el siguiente paso (solo JSON):`;

  let badJsonRetries = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let raw: string;
    try {
      raw = await runClaude(scratch, { model: DEFAULT_MODEL });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return { answer: `No pude consultar a la IA: ${detail}`, actions, toolTrace };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = parseModelJSON(raw);
    } catch {
      // JSON invalido: un reintento pidiendo correccion, despues nos rendimos
      // con la respuesta cruda para no crashear ni colgar el loop.
      if (badJsonRetries++ < 1) {
        scratch += `\n\n[Tu ultima respuesta no fue JSON valido. Responde SOLO un objeto JSON con {tool,args} o {answer,actions}.]`;
        continue;
      }
      return { answer: raw.trim() || "No pude generar una respuesta valida.", actions, toolTrace };
    }

    // Turno final.
    if ("answer" in parsed) {
      // Si la IA adjunto actions estructuradas, validalas via propose_* (re-filtra
      // columnas y respeta el gate de tools); si no, usamos las que ya acumulamos.
      const declared = parsed.actions;
      if (Array.isArray(declared) && declared.length > 0) {
        actions.push(...filterDeclaredActions(declared, tools));
      }
      return { answer: String(parsed.answer ?? ""), actions, toolTrace };
    }

    const tool = String(parsed.tool ?? "");
    const args = (parsed.args ?? {}) as Record<string, unknown>;

    // Write tools: generan una accion propuesta, no ejecutan. Las acumulamos y
    // le decimos a la IA que quedo registrada para que pase a {answer}.
    if (tool === "propose_update" || tool === "propose_create") {
      if (!tools.includes(tool)) {
        toolTrace.push({ tool, args, error: "herramienta no habilitada para este agente" });
        scratch += `\n\nAsistente: ${raw.trim()}\nRESULTADO DE LA HERRAMIENTA: error -> herramienta '${tool}' no habilitada para este agente. Elegi otra o responde con {"answer":...}.`;
        continue;
      }
      try {
        const action =
          tool === "propose_update"
            ? propose_update(String(args.objectName), String(args.id), args.fields)
            : propose_create(String(args.objectName), args.fields);
        actions.push(action);
        toolTrace.push({ tool, args, result: action });
        scratch += `\n\nAsistente: ${raw.trim()}\nRESULTADO DE LA HERRAMIENTA: accion propuesta registrada (pendiente de confirmar). Ahora responde al usuario con {"answer":...,"actions":[...]}.`;
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        toolTrace.push({ tool, args, error: detail });
        scratch += `\n\nAsistente: ${raw.trim()}\nRESULTADO DE LA HERRAMIENTA: error -> ${detail}. Corregi o responde con {"answer":...}.`;
      }
      continue;
    }

    // Read tools.
    try {
      const result = runReadTool(tool, args, tools);
      toolTrace.push({ tool, args, result });
      scratch += `\n\nAsistente: ${raw.trim()}\nRESULTADO DE LA HERRAMIENTA (${tool}): ${JSON.stringify(result)}\nContinua (solo JSON):`;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      toolTrace.push({ tool, args, error: detail });
      scratch += `\n\nAsistente: ${raw.trim()}\nRESULTADO DE LA HERRAMIENTA: error -> ${detail}. Corregi la llamada o responde con {"answer":...}.`;
    }
  }

  // Se acabo el presupuesto de iteraciones sin {answer}: pedimos un cierre forzado.
  try {
    const closing = await runClaude(
      `${scratch}\n\n[Se acabaron los pasos. Responde AHORA al usuario con la info que tengas, solo JSON {"answer":...,"actions":[]}.]`,
      { model: DEFAULT_MODEL },
    );
    const parsed = parseModelJSON(closing);
    return { answer: String(parsed.answer ?? closing.trim()), actions, toolTrace };
  } catch {
    return { answer: "No pude completar la consulta en los pasos disponibles.", actions, toolTrace };
  }
}
