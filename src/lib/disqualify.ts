/**
 * disqualify.ts — FUENTE ÚNICA de descalificadores y detección de empresa
 * (unificado en auditoría 2026-06-09; antes había 2 copias TS con listas y
 * umbrales divergentes que tomaban decisiones distintas sobre el mismo chat).
 *
 * Detectan que un chat NO es un lead de negocio. Por densidad, nunca por una
 * sola mención. Umbrales y listas idénticos al scanner Python
 * (scripts/scan-leads.py), que es la especificación de referencia.
 *
 * Consumidores: score-lead.ts (override del scoring) y contacts/recalc.
 */

export const ROMANTIC = [
  "te amo", "te quiero", "mi amor", "mi vida", "amor mío", "amor mio", " amor", "bebé",
  "tqm", "te extraño", "te extrano", "cariño", "mi cielo", "mi rey", "mi reina", "beso",
  "abrazo apretado",
];
export const EVENT = [
  "boda", "matrimonio", "lista de invitados", "los invitados", "cumpleaños", "cumpleanos",
  "bautizo", " misa", "parroquia", "graduación", "despedida de solter", "voluntariado",
  "aiesec",
];
export const JOBSEEKER = [
  "busco trabajo", "busco pega", "busco empleo", "estoy buscando trabajo",
  "te dejo mi cv", "te mando mi cv", "alguna oportunidad para mi",
  "alguna oportunidad para mí", "estoy postulando", "busco oportunidad laboral",
];

const NONCOMPANY = new Set(["MX", "CHILE", "COLOMBIA", "MEXICO", "MÉXICO", "ARGENTINA", "PERU",
                            "PERÚ", "X", "VOLUNTARIOS", "ONG", "IGLESIA", "FAMILIA", "CASA"]);
const ROLE_TOKENS = new Set(["CEO", "CTO", "CPO", "COO", "CFO", "VP", "CMO", "CRO", "CISO"]);

/**
 * El nombre del chat suele traer la empresa cuando el operador lo califica
 * ("Juan Pérez ACME"). Port fiel del scanner Python: separa por espacios y
 * limpia puntuación por token. El puerto anterior eliminaba los espacios ANTES
 * de separar, por lo que NUNCA detectaba empresa (bug de auditoría 2026-06-09:
 * ni el +12 de autoridad ni la protección anti-descalificación funcionaban).
 */
export function detectCompanyToken(name: string | null): { has: boolean; text: string | null } {
  if (!name) return { has: false, text: null };
  const tokens = name
    .split(/\s+/)
    .map((t) => t.replace(/^[.,|-]+|[.,|-]+$/g, ""))
    .filter(Boolean);
  if (tokens.length < 3) return { has: false, text: null };
  const company: string[] = [];
  for (const t of tokens.slice(2)) {
    // tras nombre + apellido
    const up = t.toUpperCase();
    if (ROLE_TOKENS.has(up) || NONCOMPANY.has(up)) continue;
    if (/^[A-ZÁÉÍÓÚÑ0-9]{2,}$/.test(t) || /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}$/.test(t)) {
      company.push(t);
    }
  }
  return company.length ? { has: true, text: company.join(" ") } : { has: false, text: null };
}

function count(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

export interface DisqMsg {
  content: string | null;
  isFromMe: boolean;
}

/**
 * Devuelve la razón de descarte o null si el chat sí es un lead potencial.
 * Si se pasa chatName y trae token de empresa (el operador ya calificó el chat),
 * NUNCA se descarta por menciones personales incidentales.
 * Umbrales del scanner Python: romantic >= 8 menciones o densidad >= 0.10
 * por mensaje del contacto; evento >= 5.
 */
export function checkDisqualifier(msgs: DisqMsg[], chatName?: string | null): string | null {
  if (chatName && detectCompanyToken(chatName).has) return null;

  const all = msgs.map((m) => (m.content || "").toLowerCase()).join(" \n ");
  const contactMsgs = msgs.filter((m) => !m.isFromMe);
  const cm = contactMsgs.length;
  const contactText = contactMsgs.map((m) => (m.content || "").toLowerCase()).join(" \n ");

  if (JOBSEEKER.some((j) => contactText.includes(j))) return "busca-trabajo";

  // rom >= 2 en la vía de densidad: honra el "nunca por una sola mención" del
  // spec — en chats cortos (<10 mensajes) una mención incidental daba >= 0.10.
  const rom = ROMANTIC.reduce((n, k) => n + count(all, k), 0);
  if (rom >= 8 || (cm > 0 && rom >= 2 && rom / cm >= 0.1)) return "personal";

  const evt = EVENT.reduce((n, k) => n + count(all, k), 0);
  if (evt >= 5) return "evento";

  return null;
}

export const DISQ_LABEL: Record<string, string> = {
  personal: "Conversacion personal, no es negocio",
  evento: "Invitacion a evento, no es negocio",
  "busca-trabajo": "Busca trabajo, no contrata",
};
