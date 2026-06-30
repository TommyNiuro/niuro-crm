/** Shared CRM UI config mirroring the LeadFlow prototype (stages, channels, avatars). */
//
// ── SEMÁNTICA DE COLOR (única en toda la app) ──────────────────────────────
//  · primary (naranja Niuro)  → marca, navegación, botones, filtros activos, badges
//  · rojo / ámbar / gris      → SOLO temperatura del lead (hot/warm/cold):
//                               gauge, pills, anillo del avatar, score, urgencia
//  · esmeralda                → WhatsApp, dinero/montos, progreso positivo (desglose)
//  · celeste (sky)            → SOLO fuentes externas (GetOnBoard) y links
//  · violeta                  → SOLO el mensaje resaltado por deep-link del radar
//  · etapas del pipeline      → colores propios de STAGE_CFG (no reutilizar fuera)
// No introducir colores nuevos sin sumar su regla aquí.
// ───────────────────────────────────────────────────────────────────────────

// Playbook de Niuro: 7 etapas, cada una dispara una tarea obligatoria.
export const STAGES = [
  "Prospecto",
  "Discovery",
  "Propuesta",
  "Perfil",
  "Entrevistas",
  "Cierre",
  "Expansion",
] as const;
export type Stage = (typeof STAGES)[number];

// Columna virtual de perdidos (contactos archivados)
export const STAGE_PERDIDOS = "Perdidos" as const;

// probability: % de cierre por etapa, estilo HubSpot (auditoría 2026-06-09).
// Es la fuente única del pipeline ponderado: se aplica en save-lead, promote,
// cambio de etapa y drag-drop. El valor manual del contacto es la excepción.
export const STAGE_CFG: Record<
  string,
  { text: string; bg: string; order: number; task: string; sla: string; dueInDays: number; probability: number }
> = {
  Prospecto: { text: "#64748b", bg: "rgba(148,163,184,0.12)", order: 0, task: "Primer contacto", sla: "24h", dueInDays: 1, probability: 5 },
  Discovery: { text: "#3B5FE5", bg: "rgba(59,95,229,0.14)", order: 1, task: "Registrar dolor y BANT", sla: "2 dias", dueInDays: 2, probability: 15 },
  Propuesta: { text: "#D4940A", bg: "rgba(212,148,10,0.14)", order: 2, task: "Enviar propuesta", sla: "48h", dueInDays: 2, probability: 30 },
  Perfil: { text: "#06b6d4", bg: "rgba(6,182,212,0.14)", order: 3, task: "Enviar perfiles pre-vetted", sla: "48h", dueInDays: 2, probability: 50 },
  Entrevistas: { text: "#a855f7", bg: "rgba(168,85,247,0.14)", order: 4, task: "Seguimiento post-entrevista", sla: "1 dia", dueInDays: 1, probability: 65 },
  Cierre: { text: "#16A34A", bg: "rgba(22,163,74,0.14)", order: 5, task: "Contrato o Vendor Kit", sla: "", dueInDays: 5, probability: 80 },
  Expansion: { text: "#FFD166", bg: "rgba(255,209,102,0.14)", order: 6, task: "QBR de expansion", sla: "30 y 60 dias", dueInDays: 30, probability: 90 },
};

export const CHANNEL_CFG: Record<string, { label: string; color: string }> = {
  whatsapp: { label: "WhatsApp", color: "#25D366" },
  instagram: { label: "Instagram", color: "#E4405F" },
  messenger: { label: "Messenger", color: "#0084FF" },
};

export const AVATAR_COLORS: [string, string][] = [
  ["#3b82f6", "#dbeafe"],
  ["#8b5cf6", "#ede9fe"],
  ["#10b981", "#d1fae5"],
  ["#f59e0b", "#fef3c7"],
  ["#ec4899", "#fce7f3"],
  ["#06b6d4", "#cffafe"],
];

export function avatarColor(name: string): [string, string] {
  const code = (name || "?").charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = (name || "?").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
