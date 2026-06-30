/* Barrel + adaptador de datos para el modulo de propuestas.
 *
 * La tabla proposals guarda client/pricing/context/cards/roadmap/team/risks como
 * JSON serializado en TEXT (ver src/db/schema.ts). Segun como cada ruta API
 * devuelva la fila, esos campos pueden llegar como objeto ya parseado o como
 * string JSON. toRenderData normaliza ambos casos a ProposalRenderData, el
 * shape que consume el ProposalRenderer.
 */
import type {
  ProposalRenderData,
  ProposalMode,
  ProposalStatus,
  RenderPricing,
  Badge,
  TeamMember,
  Risk,
} from "./render-types";
import type {
  ProposalClient,
  ProposalContext,
  ProposalCards,
  ProposalRoadmapPhase,
} from "@/types";

export { ProposalRenderer } from "./ProposalRenderer";
export type { ProposalRendererProps } from "./ProposalRenderer";
export type { ProposalRenderData } from "./render-types";

/* Parsea un valor que puede venir como objeto ya hidratado o como string JSON.
 * Devuelve fallback ante null/undefined/JSON invalido (nunca tira). */
function parseMaybe<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/* Fila de propuesta tal como puede llegar desde la API: campos JSON como objeto
 * o como string. Deliberadamente laxo para no acoplar a una sola ruta. */
export interface ProposalRowLike {
  id?: string;
  mode?: string | null;
  status?: string | null;
  date?: string | null;
  client?: unknown;
  role?: string | null;
  duration?: string | null;
  pricing?: unknown;
  summary?: string | null;
  context?: unknown;
  cards?: unknown;
  roadmap?: unknown;
  team?: unknown;
  risks?: unknown;
  deliverablesShort?: string | null;
}

/* Normaliza una fila de proposals (parseada o cruda) a ProposalRenderData. */
export function toRenderData(row: ProposalRowLike): ProposalRenderData {
  const mode: ProposalMode = row.mode === "sprint" ? "sprint" : "staff-aug";

  const client = parseMaybe<ProposalClient>(row.client, { name: "" });
  const pricing = parseMaybe<RenderPricing>(row.pricing, {
    currency: mode === "sprint" ? "USD" : "CLP",
  });
  const context = parseMaybe<ProposalContext | undefined>(row.context, undefined);
  const cards = parseMaybe<ProposalCards | undefined>(row.cards, undefined);
  const roadmap = parseMaybe<ProposalRoadmapPhase[] | null>(row.roadmap, null);
  const team = parseMaybe<TeamMember[] | null>(row.team, null);
  const risks = parseMaybe<Risk[] | null>(row.risks, null);

  return {
    id: row.id,
    mode,
    status: (row.status as ProposalStatus | null) ?? undefined,
    date: row.date ?? undefined,
    client,
    role: row.role ?? undefined,
    duration: row.duration ?? undefined,
    pricing,
    summary: row.summary ?? undefined,
    context,
    badges: (cards as { badges?: Badge[] } | undefined)?.badges,
    cards,
    roadmap,
    team,
    risks,
    deliverablesShort: row.deliverablesShort ?? undefined,
  };
}
