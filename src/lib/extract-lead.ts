/**
 * extract-lead.ts — Extracción IA de leads desde conversaciones de WhatsApp.
 *
 * Extraído de /api/whatsapp/extract-lead (auditoría 2026-06-09, Fase 3) para
 * que reanalyze y cualquier otro consumidor llamen la función DIRECTO en vez
 * de hacer fetch HTTP a localhost (auto-llamada sin timeout que podía colgar
 * el request hasta 180s).
 *
 * Dos llamadas IA EN PARALELO (basic + intel) vía subprocess de claude con
 * cache de 6h; el semáforo global (máx 2) vive en claude-subprocess.ts.
 * Modelo: FAST_MODEL (haiku) — interactivo, la latencia importa (~18s vs ~90s).
 */
import crypto from "crypto";

import { getMessages, dbExists } from "@/lib/whatsapp";
import { estimateMonthlyRate, findRoleEntry, type Seniority } from "@/lib/rate-cards";
import { runClaudeCached, FAST_MODEL } from "@/lib/claude-subprocess";
import { getOperator } from "@/lib/operator";

// Hash del transcript COMPLETO para la cache key (auditoria de seguridad
// 2026-06-23). La key vieja usaba length + prefijo (slice 0,200): dos
// conversaciones distintas con el mismo inicio (ej. "Hola, quiero info...")
// colisionaban y se servia la extraccion de otro chat. Hashear todo el
// transcript elimina la colision sin tener que propagar chatJid por las firmas.
function transcriptHash(transcript: string): string {
  return crypto.createHash("sha1").update(transcript).digest("hex").slice(0, 16);
}

const STAGES = ["Prospecto", "Discovery", "Propuesta", "Perfil", "Entrevistas", "Cierre", "Expansion"] as const;
const SENIORITIES: Seniority[] = ["junior", "mid", "senior", "lead", "principal"];

export interface BasicLead {
  name: string | null;
  email: string | null;
  company: string | null;
  role: string | null;
  seniority: Seniority | null;
  stack: string[];
  stage: typeof STAGES[number];
  urgency: "low" | "medium" | "high" | null;
  headcount: number;
  notes: string;
  nextStep: string | null;
  followUpDate: string | null;
  jobDescription: string | null;
}

export interface IntelLead {
  painPoints: string[];
  budgetSignal: string | null;
  decisionMaker: boolean | null;
  keyObjections: string[];
  openQuestions: string[];
  responseStrategy: string | null;
  salesSignals: { positive: string[]; negative: string[] };
  objectionHandling: { objection: string; counterArg: string }[];
  competitor: { name: string; positioning: string[] } | null;
  stageMismatch: { declaredStage: string; realStage: string; reason: string } | null;
}

export type ExtractedLead = BasicLead & IntelLead;

export interface ExtractResult extends ExtractedLead {
  estimatedMonthly: { min: number; max: number; perPerson: { min: number; max: number }; role: string } | null;
  messageCount: number;
  mode: "ai" | "fallback";
  activity: {
    firstContactAt: string | null;
    lastContactAt: string | null;
    lastFromLeadAt: string | null;
    lastFromMeAt: string | null;
    daysSinceLastContact: number | null;
    daysSinceLastLeadReply: number | null;
    conversationSpanDays: number;
    msgsFromLead: number;
    msgsFromMe: number;
  };
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asStringArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

async function extractBasic(transcript: string, today: string): Promise<BasicLead | null> {
  const operator = getOperator();
  const prompt = `Sos ${operator.name}, de ${operator.company} (${operator.pitch}). Analizá esta conversación de WhatsApp. Hoy es ${today}.

CONVERSACION:
${transcript}

Devolvé UN ÚNICO JSON (sin markdown):
{
  "name": "nombre del prospecto. Buscá en: presentaciones ('Hola soy X', 'me llamo X'), firmas al final del mensaje, menciones de '@X' o '-X' al cierre. Si solo hay número de teléfono o no se identifica, null. NUNCA inventes",
  "email": "email del prospecto si lo compartió (formato xxx@yyy.zz). Buscá literal en los mensajes. null si no aparece. NO inventes el local-part de un email aunque conozcas el dominio",
  "company": "nombre de la empresa/proyecto/startup del prospecto. Esto incluye: (a) empresa donde trabaja ('trabajo en X', 'soy de X', mail @x.com), (b) si es founder/emprendedor, el nombre de su STARTUP es la empresa ('mi proyecto se llama Mushnik' → 'Mushnik', 'estoy levantando una idea llamada X' → 'X', 'estamos construyendo Acme' → 'Acme'), (c) cualquier proyecto/marca/idea con nombre propio que mencione como suya. Solo null si REALMENTE no aparece ningún nombre propio asociable a él",
  "role": "rol que busca contratar. Incluí roles técnicos ('Backend Dev', 'Data Eng'), roles de liderazgo ('CTO', 'Head of Eng') y roles de co-fundador ('CTO Co-fundador', 'Cofounder Técnico'). Si no es explícito pero hay señales indirectas (necesita 'armar la app' → Fullstack Dev, 'automatizar con IA' → AI Eng), poné tu mejor hipótesis. null solo si NADA sugiere un rol",
  "seniority": "junior|mid|senior|lead|principal. Inferí cuando no es explícito: CTO/Co-founder/Head → principal, Tech Lead/Staff → lead, '5+ años' o 'senior' → senior. null solo si no hay señales",
  "stack": ["TODAS las tecnologías mencionadas: lenguajes (Python, JS, Go), frameworks (React, Django, Next.js), cloud (AWS, GCP), DBs (Postgres, Mongo), herramientas (Docker, K8s), dominios (AI/ML, Data, Blockchain). Inferí: 'modelo de IA' → 'AI/ML', 'webapp' → 'React' si no especifica"],
  "stage": "Prospecto|Discovery|Propuesta|Perfil|Entrevistas|Cierre|Expansion",
  "urgency": "low|medium|high. high='urgente|ya|asap|esta semana|necesito YA'. medium='pronto|este mes|próximas semanas|prontamente'. low=sin urgencia clara o plazo largo. Inferí 'ando buscando hace tiempo' → medium",
  "headcount": "número entero. Default 1. Si menciona '2-3 personas' → 2, 'un equipo de 5' → 5, 'varios' → 2",
  "notes": "resumen ejecutivo en 2-3 frases concretas: quién es (rol/empresa/contexto), qué necesita (rol+seniority+urgencia), dónde está parado el deal (qué falta para cerrar)",
  "nextStep": "acción concreta y específica que ${operator.name} debe hacer ahora. Ej: 'Pedir descripción de cargo detallada' o 'Enviar one-pager de ${operator.company}' o 'Confirmar presupuesto antes de proponer perfiles'. null solo si literalmente no hay nada por hacer",
  "followUpDate": "YYYY-MM-DD. Inferí: si mencionó 'la próxima semana' calculá desde hoy ${today}. Si no hay señal clara, sugerí 2-3 días desde hoy para mantener momentum (calculá la fecha real)",
  "jobDescription": "descripción detallada del cargo en 3-5 frases. Incluí: responsabilidades concretas, requisitos técnicos (stack, años de experiencia, seniority), contexto del equipo (tamaño, etapa, fully-remote/híbrido), tipo de relación (full-time, equity, contractor). Sintetizá TODO lo que el prospecto haya dicho del rol incluso si está disperso en varios mensajes. Si el rol no se discutió explícitamente pero la NECESIDAD de negocio es clara, armá un borrador de descripción desde esa necesidad y terminalo con '(borrador, confirmar con el prospecto)'. null solo si la conversación no tiene ninguna señal de contratación"
}

REGLAS GENERALES DE EXTRACCIÓN:
- Sé MÁXIMAMENTE proactivo. Tu trabajo es ahorrarle a ${operator.name} el trabajo de rellenar el formulario.
- Releé los mensajes 2 veces antes de poner null en cualquier campo.
- Para 'company': si el prospecto es founder y tiene un proyecto con nombre, ESE nombre es la empresa, aunque sea una startup en idea.
- Para 'jobDescription' y 'notes': sintetizá agresivamente, no copies literal — extraé la esencia.
- NUNCA inventes datos que no estén en la conversación (especialmente emails y nombres).
- Si el lead solo dice "Hola, quiero info" sin más contexto, todos los campos van null/vacíos excepto name si lo dijo.

Solo el JSON, sin texto adicional ni markdown.`;

  try {
    const raw = await runClaudeCached(prompt, {
      model: FAST_MODEL,
      // Haiku vía subprocess es inconsistente: la cola de respuestas reales
      // llega a 50-61s (ver logs). 45s cortaba demasiado pronto y la extracción
      // caía en "fallback" sin datos. 90s captura casi toda la distribución.
      timeoutMs: 90_000,
      ttlMs: 6 * 60 * 60 * 1000,
      cacheKey: `extract-basic:v6:${transcriptHash(transcript)}`,
    });
    const p = parseJson(raw);
    if (!p) return null;
    const stage = STAGES.includes(p.stage as typeof STAGES[number]) ? (p.stage as typeof STAGES[number]) : "Prospecto";
    const seniority = SENIORITIES.includes(p.seniority as Seniority) ? (p.seniority as Seniority) : null;
    const urgency = ["low", "medium", "high"].includes(p.urgency as string) ? (p.urgency as "low" | "medium" | "high") : null;
    const rawEmail = asString(p.email);
    const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail.toLowerCase() : null;
    return {
      name: asString(p.name),
      email,
      company: asString(p.company),
      role: asString(p.role),
      seniority,
      stack: asStringArr(p.stack),
      stage,
      urgency,
      headcount: Number.isFinite(p.headcount) && (p.headcount as number) > 0 ? Math.floor(p.headcount as number) : 1,
      notes: asString(p.notes) ?? "",
      nextStep: asString(p.nextStep),
      followUpDate: typeof p.followUpDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.followUpDate) ? p.followUpDate : null,
      jobDescription: asString(p.jobDescription),
    };
  } catch (err) {
    console.error("[extract-lead] extractBasic error:", err);
    return null;
  }
}

async function extractIntel(transcript: string, today: string, declaredStage: string): Promise<IntelLead | null> {
  const operator = getOperator();
  const prompt = `Sos ${operator.name}, de ${operator.company} (${operator.pitch}). Hoy es ${today}.

CONVERSACION:
${transcript}

Etapa declarada: ${declaredStage}

Devolvé UN ÚNICO JSON con inteligencia de ventas (sin markdown):
{
  "painPoints": ["dolor 1", "dolor 2"],
  "budgetSignal": "qué dijo sobre presupuesto o null",
  "decisionMaker": true|false|null,
  "keyObjections": ["objeción explícita 1"],
  "openQuestions": ["pregunta clave sin responder que ${operator.name} debería hacer. SIEMPRE al menos 1: si el deal está completo, la pregunta que asegura el cierre o el siguiente rol"],
  "responseStrategy": "cómo responder próximo mensaje: tono, qué preguntar, cómo manejar objeciones (2-3 frases)",
  "salesSignals": { "positive": ["señal de compra"], "negative": ["riesgo o señal negativa"] },
  "objectionHandling": [
    {
      "objection": "objeción literal o paráfrasis",
      "counterArg": "respuesta usando diferenciales Niuro: 48h matching, ingenieros pre-vetted, casos de éxito, 17% conv vs 20-25% recruiter, sin costo reclutamiento interno"
    }
  ],
  "competitor": { "name": "Ontop|recruiter|in-house|null", "positioning": ["diferenciador Niuro vs competidor"] } | null,
  "stageMismatch": { "declaredStage": "${declaredStage}", "realStage": "la etapa real, OBLIGATORIAMENTE una de: Prospecto|Discovery|Propuesta|Perfil|Entrevistas|Cierre|Expansion (nada inventado tipo 'Early Engagement')", "reason": "qué señales muestran la etapa real" } | null
}

Si no hay objeciones, objectionHandling=[]. Si no hay competidor, competitor=null. Si la etapa calza, stageMismatch=null.
BREVEDAD OBLIGATORIA (la velocidad importa): máx 2 items por lista, cada string máx 15 palabras, responseStrategy máx 2 frases. Sé concreto. No inventes. Solo el JSON.`;

  try {
    const raw = await runClaudeCached(prompt, {
      model: FAST_MODEL,
      timeoutMs: 90_000,
      ttlMs: 6 * 60 * 60 * 1000,
      cacheKey: `extract-intel:v6:${transcriptHash(transcript)}:${declaredStage}`,
    });
    const p = parseJson(raw);
    if (!p) return null;
    const sm = p.stageMismatch as { realStage?: string; declaredStage?: string; reason?: string } | null | undefined;
    const cp = p.competitor as { name?: string; positioning?: unknown } | null | undefined;
    return {
      painPoints: asStringArr(p.painPoints),
      budgetSignal: asString(p.budgetSignal),
      decisionMaker: typeof p.decisionMaker === "boolean" ? p.decisionMaker : null,
      keyObjections: asStringArr(p.keyObjections),
      openQuestions: asStringArr(p.openQuestions),
      responseStrategy: asString(p.responseStrategy),
      salesSignals: {
        positive: asStringArr((p.salesSignals as { positive?: unknown })?.positive),
        negative: asStringArr((p.salesSignals as { negative?: unknown })?.negative),
      },
      objectionHandling: Array.isArray(p.objectionHandling)
        ? (p.objectionHandling as { objection?: unknown; counterArg?: unknown }[])
            .filter((o) => typeof o?.objection === "string")
            .map((o) => ({ objection: String(o.objection).trim(), counterArg: String(o.counterArg ?? "").trim() }))
        : [],
      competitor: cp?.name
        ? { name: String(cp.name), positioning: asStringArr(cp.positioning) }
        : null,
      stageMismatch: sm?.realStage && sm.realStage !== sm.declaredStage
        ? { declaredStage: String(sm.declaredStage ?? declaredStage), realStage: String(sm.realStage), reason: String(sm.reason ?? "") }
        : null,
    };
  } catch (err) {
    // Fallo visible (auditoría 2026-06-09): este catch mudo escondía los
    // timeouts de la llamada de intel y el brief se perdía sin rastro.
    console.error("[extract-lead] extractIntel error:", err);
    return null;
  }
}

// Heurística: priorizá últimos 15 + primeros 5 + mensajes largos del lead.
// Reduce prompt en ~40% sin perder contexto crítico de la negociación.
function buildTranscript(msgs: Array<{ content: string | null; isFromMe: boolean; mediaType: string | null }>): string {
  const operator = getOperator();
  const filtered = msgs.filter((m) => (m.content && m.content.trim()) || m.mediaType);
  if (filtered.length <= 25) {
    return filtered
      .map((m) => `${m.isFromMe ? operator.name : "Lead"}: ${m.content?.trim() || `[${m.mediaType}]`}`)
      .join("\n");
  }
  const recent = filtered.slice(-15);
  const early = filtered.slice(0, 5);
  const middle = filtered.slice(5, -15);
  const longLeadMsgs = middle
    .filter((m) => !m.isFromMe && (m.content?.length ?? 0) > 50)
    .slice(0, 5);
  const seen = new Set<typeof filtered[number]>();
  const ordered = filtered.filter((m) => {
    if (early.includes(m) || recent.includes(m) || longLeadMsgs.includes(m)) {
      if (seen.has(m)) return false;
      seen.add(m);
      return true;
    }
    return false;
  });
  return ordered
    .map((m) => `${m.isFromMe ? operator.name : "Lead"}: ${m.content?.trim() || `[${m.mediaType}]`}`)
    .join("\n");
}

function emptyBasic(): BasicLead {
  return {
    name: null,
    email: null,
    company: null,
    role: null,
    seniority: null,
    stack: [],
    stage: "Prospecto",
    urgency: null,
    headcount: 1,
    notes: "No se pudo extraer automaticamente. Revisa la conversacion.",
    nextStep: null,
    followUpDate: null,
    jobDescription: null,
  };
}

function emptyIntel(): IntelLead {
  return {
    painPoints: [],
    budgetSignal: null,
    decisionMaker: null,
    keyObjections: [],
    openQuestions: [],
    responseStrategy: null,
    salesSignals: { positive: [], negative: [] },
    objectionHandling: [],
    competitor: null,
    stageMismatch: null,
  };
}

/**
 * Extrae el lead completo (basic + intel + actividad + tarifa estimada) de un
 * chat de WhatsApp. Devuelve null solo si el chat no existe o está vacío.
 */
export async function extractLeadFromChat(
  chatJid: string,
  declaredStage?: string | null
): Promise<ExtractResult | null> {
  if (!dbExists()) return null;

  const messages = getMessages({ chatJid, limit: 50 });
  const validMsgs = messages.filter((m) => (m.content && m.content.trim()) || m.mediaType);
  if (validMsgs.length === 0) return null;

  // Actividad: timeline de contacto
  const timestamps = validMsgs
    .map((m) => (m.timestamp ? new Date(m.timestamp).getTime() : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  const firstContactAt = timestamps.length ? new Date(timestamps[0]).toISOString() : null;
  const lastContactAt = timestamps.length ? new Date(timestamps[timestamps.length - 1]).toISOString() : null;
  const lastFromLead = [...validMsgs].reverse().find((m) => !m.isFromMe && m.timestamp);
  const lastFromMe = [...validMsgs].reverse().find((m) => m.isFromMe && m.timestamp);
  const lastFromLeadAt = lastFromLead?.timestamp ? new Date(lastFromLead.timestamp).toISOString() : null;
  const lastFromMeAt = lastFromMe?.timestamp ? new Date(lastFromMe.timestamp).toISOString() : null;
  const daysSinceLastContact = lastContactAt
    ? Math.floor((Date.now() - new Date(lastContactAt).getTime()) / 86400000)
    : null;
  const daysSinceLastLeadReply = lastFromLeadAt
    ? Math.floor((Date.now() - new Date(lastFromLeadAt).getTime()) / 86400000)
    : null;
  const conversationSpanDays = firstContactAt && lastContactAt
    ? Math.max(0, Math.floor((new Date(lastContactAt).getTime() - new Date(firstContactAt).getTime()) / 86400000))
    : 0;
  const msgsFromLead = validMsgs.filter((m) => !m.isFromMe).length;
  const msgsFromMe = validMsgs.filter((m) => m.isFromMe).length;

  const transcript = buildTranscript(messages);
  const today = new Date().toISOString().slice(0, 10);
  const stageHint = declaredStage || "Prospecto";

  // En paralelo: el semáforo global (máx 2) ya gobierna la concurrencia de
  // subprocessos. Serializarlas duplicaba la espera del usuario (~48s → ~25s).
  const [basic, intel] = await Promise.all([
    extractBasic(transcript, today),
    extractIntel(transcript, today, stageHint),
  ]);

  const aiSucceeded = basic !== null;

  const extracted: ExtractedLead = basic
    ? { ...basic, ...(intel ?? emptyIntel()) }
    : { ...emptyBasic(), ...emptyIntel() };

  let estimatedMonthly: ExtractResult["estimatedMonthly"] = null;
  if (extracted.role) {
    const range = estimateMonthlyRate(extracted.role, extracted.seniority);
    if (range) {
      const entry = findRoleEntry(extracted.role);
      estimatedMonthly = {
        perPerson: range,
        min: range.min * extracted.headcount,
        max: range.max * extracted.headcount,
        role: entry?.role || extracted.role,
      };
    }
  }

  return {
    ...extracted,
    estimatedMonthly,
    messageCount: validMsgs.length,
    mode: aiSucceeded ? "ai" : "fallback",
    activity: {
      firstContactAt,
      lastContactAt,
      lastFromLeadAt,
      lastFromMeAt,
      daysSinceLastContact,
      daysSinceLastLeadReply,
      conversationSpanDays,
      msgsFromLead,
      msgsFromMe,
    },
  };
}
