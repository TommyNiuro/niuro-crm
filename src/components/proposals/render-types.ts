/* Tipos de render para el ProposalRenderer portado de propuestas-niuro.
 *
 * El CRM modela el contenido de la propuesta en src/types/index.ts con shapes
 * conservadores (ProposalCard, ProposalRisk, ProposalRoadmapPhase, etc.) que se
 * guardan como JSON serializado en la tabla proposals (TEXT). El renderer del
 * origen usaba un ProposalShape mas rico. Para no inventar columnas ni tocar el
 * schema, definimos aca un shape de SOLO RENDER que:
 *
 *   1. Reusa los tipos canonicos del CRM (@/types) donde existen.
 *   2. Extiende, de forma opcional, los campos que el origen pintaba y el CRM
 *      no modela todavia (badges, deliverablesShort, valores de equipo, hitos
 *      de pago, clausula de absorcion). Si la IA no los llena, los defaults
 *      portados rellenan el preview sin romper el layout.
 *
 * Los datos entran YA parseados (objetos, no strings JSON). El componente es
 * puro: no hace fetch ni mantiene estado.
 */
import type {
  ProposalMode,
  ProposalStatus,
  ProposalClient,
  ProposalContext,
  ProposalCard,
  ProposalCards,
  ProposalRoadmapPhase,
  ProposalTeamMember,
  ProposalRisk,
} from "@/types";

export type { ProposalMode, ProposalStatus } from "@/types";

/* Card editorial. Base = tipo del CRM (title, body, pill?) + icon ASCII legacy
 * opcional que traen los defaults portados (el renderer usa Lucide por orden,
 * no este campo, pero lo aceptamos para no perder el dato). */
export interface Card extends ProposalCard {
  /** Icono ASCII legacy de los defaults; el render lo ignora. */
  icon?: string;
}

/* Riesgo de render: el CRM lo modela como {title, body}; aceptamos tambien el
 * icon ASCII de los defaults (ignorado por el render). */
export interface Risk extends ProposalRisk {
  icon?: string;
}

/* Tramo de roadmap: el shape del CRM ya calza con el del renderer. */
export type RoadmapPhase = ProposalRoadmapPhase;

/* Integrante de equipo de render. Base = tipo del CRM (rol, stack, modalidad,
 * responsabilidades). Campos extra opcionales que el origen pintaba por modo:
 *  - staff-aug: valores mensuales (valueMain / valueAlt + notas).
 *  - sprint: nombre real, email y tipo de participacion.
 * Si no vienen, los defaults o el render los omiten. */
export interface TeamMember
  extends Omit<ProposalTeamMember, "responsibilities" | "stack" | "modality"> {
  /** El CRM tipa responsibilities como string[]; el render acepta tambien un
   * string plano (sprint suele venir como parrafo unico). */
  responsibilities: string[] | string;
  /** stack/modality son obligatorios en el tipo del CRM, pero el equipo sprint
   * (con nombre real) no los usa: aca son opcionales. */
  stack?: string;
  modality?: string;
  name?: string;
  email?: string;
  valueMain?: string | null;
  valueMainNote?: string | null;
  valueAlt?: string | null;
  valueAltNote?: string | null;
  participation?: string;
  participationNote?: string;
}

/* Hito de pago del sprint. No esta en el schema del CRM (pricing es
 * discriminado por modo): es opcional y solo se usa en el render del sprint. */
export interface Milestone {
  date: string | null;
  amount: number | null;
  note: string;
}

/* Clausula de incorporacion directa al payroll (staff-aug). Opcional. */
export interface Absorption {
  enabled: boolean;
  installments: 1 | 3 | 5;
}

/* Pricing de render: union por modo + extras opcionales (milestones,
 * absorption) que el render usa pero el schema no modela como columna. */
export type RenderPricing = {
  currency: string;
  iva?: boolean;
  monthlyMin?: number | null;
  monthlyMax?: number | null;
  total?: number | null;
  startDate?: string | null;
  milestones?: Milestone[];
  absorption?: Absorption;
};

/* Badge translucido sobre el blue-box. No esta en el schema: opcional. */
export interface Badge {
  icon: string;
  text: string;
}

/* Shape unico que consume el ProposalRenderer. Se construye desde una fila
 * Proposal ya parseada (helper toRenderData en index.ts). */
export interface ProposalRenderData {
  id?: string;
  mode: ProposalMode;
  status?: ProposalStatus;
  /** "Mayo 2026", human-readable. */
  date?: string;

  client: ProposalClient;

  /** Staff-aug: rol exacto con stack. */
  role?: string;
  /** Sprint: duracion total. */
  duration?: string;

  pricing: RenderPricing;

  summary?: string;
  context?: ProposalContext;
  badges?: Badge[];
  cards?: ProposalCards;
  roadmap?: RoadmapPhase[] | null;
  team?: TeamMember[] | null;
  risks?: Risk[] | null;

  /** Sprint: resumen corto de entregables para el highlight / pricing-box. */
  deliverablesShort?: string;
}
