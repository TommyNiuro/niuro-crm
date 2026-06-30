/**
 * scoreLead: rúbrica de calificación de leads de Niuro (TS).
 *
 * Puerto fiel del scanner Python (scripts/scan-leads.py). Es la fuente de
 * verdad on-demand para Conversaciones: cuando un chat no tiene candidate
 * cacheado en lead_candidates, esto corre sobre los últimos mensajes del
 * puente y produce el mismo desglose.
 *
 * Modo:
 *   - reglas (default): determinista, igual al scanner.
 *   - ai (T4, pendiente): cuando ANTHROPIC_API_KEY exista, las 5 dimensiones
 *     se podrían inferir con criterio. Se deja la rama lista, no cableada.
 */
import type { Temperature } from "@/types";
import { checkDisqualifier, detectCompanyToken } from "@/lib/disqualify";

export interface ScoreLeadMessage {
  content: string | null;
  isFromMe: boolean;
  timestamp: string | null;
  mediaType?: string | null;
}

export interface ScoreBreakdown {
  intencion: number; // 0..35
  autoridad: number; // 0..20
  necesidad: number; // 0..20
  urgencia: number; // 0..15
  presupuesto: number; // 0..10
}

export interface ScoreSignals {
  companyToken: boolean;
  companyTokenText: string | null;
  ownerSelling: boolean;
  ownerSellHits: number;
  docsSent: number;
  reciprocity: boolean;
  contactIntent: number; // contribución cruda de intención del contacto
  daysSinceLast: number | null;
  recencyFactor: number;
}

export interface ScoreLeadResult {
  score: number; // 0..100
  base: number; // antes del factor de recencia
  temperature: Temperature;
  breakdown: ScoreBreakdown;
  signals: ScoreSignals;
  reason: string;
  recommendation: "save" | "discard" | "review";
  disqualifier: string | null;
  mode: "rules" | "ai";
}

// ---- Configuracion de la rubrica (externalizable via crmSettings) ----

export interface RubricDimension {
  max: number;
  keywords: string[][];
}

export interface RubricConfig {
  intencion: RubricDimension;
  autoridad: RubricDimension;
  necesidad: RubricDimension;
  urgencia: RubricDimension;
  presupuesto: RubricDimension;
}

export const DEFAULT_RUBRIC_CONFIG: RubricConfig = {
  intencion: {
    max: 35,
    keywords: [
      ["entrevistas tecnicas", "entrevistas técnicas", "pasarte", "asignar", "asignarse",
       "alocar", "alocado", "onboarding", "arrancamos", "kickoff", "kick off"],
      ["propuesta", "cotiz", "agendar", "agendemos", "reunión", "reunion", "ver perfiles",
       "mándame perfiles", "mandame perfiles", "los perfiles", "demo", "firmar", "contrato", "avancemos"],
      ["cómo funciona", "como funciona", "cuánto cuesta", "cuanto cuesta", "que stack",
       "qué stack", "tarifa", "cuánto sale", "cuanto sale", "cobran", "qué precio", "que precio"],
      ["algún día", "algun dia", "más adelante", "mas adelante", "qué hacen", "que hacen",
       "me interesa", "interesad", "a futuro", "tengo una duda"],
    ],
  },
  autoridad: {
    max: 20,
    keywords: [
      ["cto", "ceo", "founder", "fundador", "co-founder", "cofounder", "cofundador",
       "dueño", "dueno", "director", " vp", "head of"],
      ["manager", "líder", "lider", "jefe", "gerente", "encargad", " lead", "lead ", " pm "],
    ],
  },
  necesidad: {
    max: 20,
    keywords: [
      ["vacante", "posición", "posicion", " rol", "rol ", "proyecto", "deadline",
       "board", "contratar", "contratación", "contratacion"],
      ["perfil", "senior", "semi senior", "ssr", "desarrollador", "programador",
       "ingenier", "dev"],
      ["falta gente", "nos falta", "crecer el equipo", "necesitamos", "sumar gente",
       "escalar el equipo", "armar equipo"],
    ],
  },
  urgencia: {
    max: 15,
    keywords: [
      ["urgente", "cuanto antes", "cuánto antes", "lo antes posible", "esta semana",
       "ya lo necesito", "asap", "ahora mismo", "para ya"],
      ["este mes", "próximas semanas", "proximas semanas", "pronto", "deadline", "plazo",
       "este trimestre", "en julio", "en agosto"],
      ["más adelante", "mas adelante", "viendo opciones", "explorando", "a futuro", "sin apuro"],
    ],
  },
  presupuesto: {
    max: 10,
    keywords: [
      ["presupuesto", "comparando", "ontop", "otro proveedor", "otra empresa", "negociar",
       "negociando", "budget", "tenemos para invertir"],
      ["levantamos", "ronda", "serie a", "seed", "inversión", "inversion", "funding", "respaldo"],
      ["precio", "cuánto cuesta", "cuanto cuesta", "costo", "tarifa", "cobran"],
    ],
  },
};


// ---- Rúbrica del contacto (niveles, mismo orden y valores que el scanner) ----
const INTENTION: [number, string[]][] = [
  [35, ["entrevistas tecnicas", "entrevistas técnicas", "pasarte", "asignar", "asignarse",
        "alocar", "alocado", "onboarding", "arrancamos", "kickoff", "kick off"]],
  [28, ["propuesta", "cotiz", "agendar", "agendemos", "reunión", "reunion", "ver perfiles",
        "mándame perfiles", "mandame perfiles", "los perfiles", "demo", "firmar", "contrato", "avancemos"]],
  [18, ["cómo funciona", "como funciona", "cuánto cuesta", "cuanto cuesta", "que stack",
        "qué stack", "tarifa", "cuánto sale", "cuanto sale", "cobran", "qué precio", "que precio"]],
  [10, ["algún día", "algun dia", "más adelante", "mas adelante", "qué hacen", "que hacen",
        "me interesa", "interesad", "a futuro", "tengo una duda"]],
];
const AUTHORITY: [number, string[]][] = [
  [20, ["cto", "ceo", "founder", "fundador", "co-founder", "cofounder", "cofundador",
        "dueño", "dueno", "director", " vp", "head of"]],
  [13, ["manager", "líder", "lider", "jefe", "gerente", "encargad", " lead", "lead ", " pm "]],
];
const URGENCY: [number, string[]][] = [
  [15, ["urgente", "cuanto antes", "cuánto antes", "lo antes posible", "esta semana",
        "ya lo necesito", "asap", "ahora mismo", "para ya"]],
  [10, ["este mes", "próximas semanas", "proximas semanas", "pronto", "deadline", "plazo",
        "este trimestre", "en julio", "en agosto"]],
  [5, ["más adelante", "mas adelante", "viendo opciones", "explorando", "a futuro", "sin apuro"]],
];
const BUDGET: [number, string[]][] = [
  [10, ["presupuesto", "comparando", "ontop", "otro proveedor", "otra empresa", "negociar",
        "negociando", "budget", "tenemos para invertir"]],
  [7, ["levantamos", "ronda", "serie a", "seed", "inversión", "inversion", "funding", "respaldo"]],
  [4, ["precio", "cuánto cuesta", "cuanto cuesta", "costo", "tarifa", "cobran"]],
];
const STACKS = ["react", "node", "python", "java", "golang", ".net", "php", "ruby", "angular", "vue",
                "backend", "frontend", "fullstack", "full-stack", "devops", " qa", "data", "mobile",
                "flutter", "ios", "android", "sre", "machine learning"];
const NEED_CONCRETE = ["vacante", "posición", "posicion", " rol", "rol ", "proyecto", "deadline",
                       "board", "contratar", "contratación", "contratacion"];
const NEED_PROFILE = ["perfil", "senior", "semi senior", "ssr", "desarrollador", "programador",
                      "ingenier", "dev"];
const NEED_VAGUE = ["falta gente", "nos falta", "crecer el equipo", "necesitamos", "sumar gente",
                    "escalar el equipo", "armar equipo"];

const OWNER_SELL_KW = ["niuro", "ingenier", "perfil", "candidat", "entrevista", "descripción de cargo",
                       "descripcion de cargo", "propuesta", "asignar", "staff", "talento", "semi senior",
                       "ssr", "matching", "developers", "desarrolladores"];

// Pitch de Niuro: si el operador mandó el pitch (menciona niuro.io o el mensaje tipo
// "proveemos más de 10.000 ingenieros senior en LATAM"), es señal fuerte de que
// la conversación es comercial — el chat se trató como prospecto.
const PITCH_TOKENS = ["niuro.io", "10.000 ingenieros", "10,000 ingenieros", "10000 ingenieros",
                      "staff augmentation"];

export function detectNiuroPitch(ownerText: string, contactText: string): boolean {
  return PITCH_TOKENS.some((t) => ownerText.includes(t)) || contactText.includes("niuro.io");
}

// Descalificadores y detección de empresa: viven en @/lib/disqualify (fuente única,
// auditoría 2026-06-09 — antes había copias divergentes aquí).

function bestLevel(text: string, levels: [number, string[]][]): { points: number; hits: string[] } {
  for (const [pts, pats] of levels) {
    const hits = pats.filter((p) => text.includes(p));
    if (hits.length) return { points: pts, hits };
  }
  return { points: 0, hits: [] };
}

function needLevel(text: string, rubric?: RubricConfig): { points: number; hits: string[] } {
  // Tiers de necesidad: [0]=concreta, [1]=perfil, [2]=vaga (editables en la rúbrica).
  const needConcrete = rubric?.necesidad.keywords[0] ?? NEED_CONCRETE;
  const needProfile = rubric?.necesidad.keywords[1] ?? NEED_PROFILE;
  const needVague = rubric?.necesidad.keywords[2] ?? NEED_VAGUE;
  const maxN = rubric?.necesidad.max ?? 20;
  const scale = (pts: number) => Math.max(1, Math.round((pts * maxN) / 20));

  const hasStack = STACKS.some((s) => text.includes(s));
  const concrete = needConcrete.filter((p) => text.includes(p));
  if (concrete.length && (hasStack || text.includes("deadline") || text.includes("board"))) {
    return { points: scale(20), hits: concrete };
  }
  const profile = needProfile.filter((p) => text.includes(p));
  if (hasStack || profile.length) {
    return { points: scale(13), hits: profile.length ? profile : ["stack"] };
  }
  const vague = needVague.filter((p) => text.includes(p));
  if (vague.length) return { points: scale(7), hits: vague };
  return { points: 0, hits: [] };
}

function recencyFactor(daysSinceLast: number): number {
  if (daysSinceLast <= 7) return 1.0;
  if (daysSinceLast <= 21) return 0.85;
  if (daysSinceLast <= 45) return 0.7;
  return 0.5;
}

function tempBucket(score: number, intention: number): Temperature {
  if (score >= 70 && intention >= 28) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

function daysSince(timestamp: string | null): number {
  if (!timestamp) return 999;
  const t = new Date(timestamp);
  if (isNaN(t.getTime())) return 999;
  return Math.max(0, Math.floor((Date.now() - t.getTime()) / (1000 * 60 * 60 * 24)));
}

export interface ScoreLeadOpts {
  ai?: boolean; // reservado para T4
  /** Rúbrica editada en Ajustes (crm_settings.rubric_config). Sin ella, defaults. */
  rubric?: RubricConfig;
}

// Puntos canónicos por tier de cada dimensión (los de la rúbrica default).
// Con rúbrica custom se escalan por max/maxDefault, así editar el max de una
// dimensión re-pondera sus tiers proporcionalmente.
const TIER_POINTS: Record<keyof RubricConfig, number[]> = {
  intencion: [35, 28, 18, 10],
  autoridad: [20, 13],
  necesidad: [20, 13, 7],
  urgencia: [15, 10, 5],
  presupuesto: [10, 7, 4],
};

function levelsFromRubric(dim: RubricDimension, key: keyof RubricConfig): [number, string[]][] {
  const base = TIER_POINTS[key];
  const defMax = DEFAULT_RUBRIC_CONFIG[key].max;
  return dim.keywords.map((kws, i) => {
    const pts = base[Math.min(i, base.length - 1)];
    return [Math.max(1, Math.round((pts * dim.max) / defMax)), kws] as [number, string[]];
  });
}

export function scoreLead(
  messages: ScoreLeadMessage[],
  chatName: string | null,
  opts: ScoreLeadOpts = {}
): ScoreLeadResult {
  const rub = opts.rubric;
  const INT = rub ? levelsFromRubric(rub.intencion, "intencion") : INTENTION;
  const AUT = rub ? levelsFromRubric(rub.autoridad, "autoridad") : AUTHORITY;
  const URG = rub ? levelsFromRubric(rub.urgencia, "urgencia") : URGENCY;
  const BUD = rub ? levelsFromRubric(rub.presupuesto, "presupuesto") : BUDGET;
  const maxInt = rub?.intencion.max ?? 35;
  const maxAut = rub?.autoridad.max ?? 20;
  const maxNec = rub?.necesidad.max ?? 20;
  const lastTs = messages.length ? messages[messages.length - 1].timestamp : null;
  const dsl = daysSince(lastTs);
  const factor = recencyFactor(dsl);

  const ownerText = messages.filter((m) => m.isFromMe).map((m) => (m.content || "").toLowerCase()).join(" \n ");
  const contactMsgs = messages.filter((m) => !m.isFromMe);
  const contactText = contactMsgs.map((m) => (m.content || "").toLowerCase()).join(" \n ");
  const combined = ownerText + " \n " + contactText;

  // Features ancla
  const { has: companyToken, text: companyTokenText } = detectCompanyToken(chatName);
  const sellHits = Array.from(new Set(OWNER_SELL_KW.filter((k) => ownerText.includes(k))));
  const pitchSent = detectNiuroPitch(ownerText, contactText);
  const ownerSelling = sellHits.length >= 2 || pitchSent;
  const ownerDocs = messages.filter((m) => m.isFromMe && m.mediaType === "document").length;

  // Overrides por densidad (idéntico al scanner). Si el chat trae token de
  // empresa (el operador ya lo calificó) o se mandó el pitch de Niuro.io, nada de
  // descartar por menciones sueltas: la conversación se trató como comercial.
  const disqualifier = companyToken || pitchSent
    ? null
    : checkDisqualifier(messages.map((m) => ({ content: m.content, isFromMe: m.isFromMe })));

  if (disqualifier) {
    return {
      score: 0,
      base: 0,
      temperature: "cold",
      breakdown: { intencion: 0, autoridad: 0, necesidad: 0, urgencia: 0, presupuesto: 0 },
      signals: {
        companyToken, companyTokenText, ownerSelling, ownerSellHits: sellHits.length,
        docsSent: ownerDocs, reciprocity: false, contactIntent: 0,
        daysSinceLast: lastTs ? dsl : null, recencyFactor: factor,
      },
      reason:
        disqualifier === "personal" ? "Conversación personal, no es negocio."
        : disqualifier === "evento" ? "Invitación a evento, no es negocio."
        : "Está buscando trabajo, no contrata.",
      recommendation: "discard",
      disqualifier,
      mode: "rules",
    };
  }

  // Dimensiones
  const ci = bestLevel(contactText, INT).points;
  const cn = needLevel(contactText, rub).points;
  const reciprocity = ownerSelling && ci >= 18;

  let authority = bestLevel((chatName || "").toLowerCase() + " " + contactText, AUT).points;
  if (companyToken) authority += 12;
  if (authority === 0 && (ci >= 18 || cn > 0 || ownerSelling)) authority = 6;
  authority = Math.min(maxAut, authority);

  let intencion = ci + (ownerSelling ? 20 : 0) + (ownerSelling && ownerDocs >= 1 ? 10 : 0);
  intencion = Math.min(maxInt, intencion);

  const necesidad = Math.min(maxNec, cn + (ownerSelling ? 7 : 0));
  const urgencia = bestLevel(combined, URG).points;
  const presupuesto = bestLevel(combined, BUD).points;

  const breakdown: ScoreBreakdown = { intencion, autoridad: authority, necesidad, urgencia, presupuesto };
  const base = intencion + authority + necesidad + urgencia + presupuesto;
  const score = Math.max(0, Math.min(100, Math.round(base * factor)));
  const temperature = tempBucket(score, intencion);

  const reasonParts: string[] = [];
  if (companyToken) reasonParts.push(`Empresa: ${companyTokenText}`);
  if (pitchSent) reasonParts.push("pitch Niuro.io enviado");
  if (ownerSelling && !pitchSent) reasonParts.push(`Operador vendiendo (${sellHits.length} señales)`);
  if (ownerSelling && ownerDocs >= 1) reasonParts.push(`propuesta o JD enviada (${ownerDocs})`);
  if (ci >= 18) reasonParts.push("el contacto pide info o acción");
  if (reciprocity) reasonParts.push("reciprocidad");
  if (urgencia >= 10) reasonParts.push("con urgencia");
  if (presupuesto >= 7) reasonParts.push("con presupuesto");
  const reason = reasonParts.length ? reasonParts.join(" · ") : "Señal de negocio débil.";

  // Recomendación: caliente => guardar. Tibio con token o reciprocidad => guardar.
  // Resto, revisar (no auto-descartar; el operador decide).
  const recommendation: "save" | "discard" | "review" =
    temperature === "hot" || (temperature === "warm" && (companyToken || reciprocity))
      ? "save"
      : score < 25
      ? "discard"
      : "review";

  return {
    score, base, temperature, breakdown,
    signals: {
      companyToken, companyTokenText, ownerSelling, ownerSellHits: sellHits.length,
      docsSent: ownerDocs, reciprocity, contactIntent: ci,
      daysSinceLast: lastTs ? dsl : null, recencyFactor: factor,
    },
    reason, recommendation, disqualifier: null, mode: "rules",
  };
}

// Topes por dimensión (para barras del panel y la ficha).
export const DIM_MAX: Record<keyof ScoreBreakdown, number> = {
  intencion: 35, autoridad: 20, necesidad: 20, urgencia: 15, presupuesto: 10,
};

export const DIM_LABEL: Record<keyof ScoreBreakdown, string> = {
  intencion: "Intención", autoridad: "Autoridad", necesidad: "Necesidad",
  urgencia: "Urgencia", presupuesto: "Presupuesto",
};
