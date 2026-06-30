export type Temperature = "cold" | "warm" | "hot";

export type ActivityType = "call" | "email" | "meeting" | "note" | "follow_up";

export type LeadSource =
  | "website"
  | "whatsapp"
  | "referido"
  | "redes_sociales"
  | "llamada_fria"
  | "email"
  | "formulario"
  | "evento"
  | "import"
  | "webhook"
  | "otro";

export type LeadCandidateStatus = "pending" | "approved" | "dismissed" | "rejected";
export type TaskStatus = "open" | "completed" | "cancelled";

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  temperature: Temperature;
  score: number;
  notes: string | null;
  whatsappJid: string | null;
  stage: string;
  channel: string;
  probability: number;
  valueCents: number;
  country: string | null;
  tags: string | null;
  agentId: string | null;
  nextAction: string | null;
  nextStepDue: Date | null;
  online: boolean;
  lastInteractionAt: Date | null;
  archived: boolean;
  disqualifyReason: string | null;
  scoreBreakdown: string | null;
  jobDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  contactId: string;
  title: string;
  stepName: string | null;
  dueAt: Date | null;
  status: TaskStatus;
  completedAt: Date | null;
  createdAt: Date;
}

export interface StepTransition {
  id: string;
  contactId: string;
  fromStep: string | null;
  toStep: string;
  durationDays: number | null;
  occurredAt: Date;
}

export interface LeadCandidate {
  id: string;
  name: string;
  phone: string | null;
  chatJid: string;
  score: number;
  temperature: Temperature;
  reason: string | null;
  nextAction: string | null;
  breakdown: string | null;
  source: string;
  status: LeadCandidateStatus;
  contactId: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Deal {
  id: string;
  title: string;
  value: number; // in cents
  stageId: string;
  contactId: string;
  expectedClose: Date | null;
  probability: number; // 0-100
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string;
  isWon: boolean;
  isLost: boolean;
}

export interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  contactId: string;
  dealId: string | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface CrmConfig {
  business: {
    type: string;
    industry: string;
    teamSize: string;
  };
  pipeline: {
    stages: Array<{
      name: string;
      order: number;
      color: string;
      isWon: boolean;
      isLost: boolean;
    }>;
  };
  leadSources: string[];
  preferences: {
    language: "es" | "en";
    theme: "light" | "dark" | "auto";
  };
}

// API response types
export interface DealWithContact extends Deal {
  contact?: Contact;
  stage?: PipelineStage;
  contactName?: string | null;
  contactTemperature?: string | null;
}

export interface ContactWithDeals extends Contact {
  deals?: Deal[];
  activities?: Activity[];
}

export interface PipelineColumn extends PipelineStage {
  deals: DealWithContact[];
}

export interface DashboardStats {
  totalContacts: number;
  activeDeals: number;
  totalPipelineValue: number;
  wonDealsValue: number;
  conversionRate: number;
  hotLeads: number;
}

// ============================================================
// Propuestas comerciales (shapes JSON compartidos UI <-> IA)
// Portado de propuestas-niuro (src/lib/proposal/types.ts + prompts).
// Estos tipos describen el contenido que la columna proposals.* guarda
// como JSON serializado en TEXT. La IA (full-generate) devuelve este shape.
// ============================================================

export type ProposalMode = "staff-aug" | "sprint";

export type ProposalStatus =
  | "draft"
  | "sent"
  | "in-review"
  | "negotiation"
  | "signed"
  | "lost"
  | "archived";

// Datos del cliente. Guardado en proposals.client (JSON, NOT NULL).
export interface ProposalClient {
  name: string;
  industry?: string;
  country?: string;
  initial?: string;
  logoColor?: string;
  logoSrc?: string;
  website?: string;
}

// Pricing discriminado por mode. Guardado en proposals.pricing (JSON).
// staff-aug: rango mensual. sprint: total cerrado con fecha de inicio.
export type ProposalPricing =
  | {
      currency: string; // CLP | USD | MXN | ...
      monthlyMin: number | null;
      monthlyMax: number | null;
      iva: boolean;
    }
  | {
      currency: string;
      total: number | null;
      iva: boolean;
      startDate: string | null; // YYYY-MM-DD
    };

// Contexto de negocio. Guardado en proposals.context (JSON).
export interface ProposalContext {
  paragraph: string;
  dataPoints: string[];
}

// Card editorial (objetivo / scope / governance / riesgo). El body puede
// contener HTML inline (<strong>) ya sanitizado.
export interface ProposalCard {
  title: string;
  body: string;
  pill?: string;
}

// Bloque de cards agrupado. Guardado en proposals.cards (JSON).
export interface ProposalCards {
  objective: ProposalCard[];
  scope: ProposalCard[];
  governance: ProposalCard[];
}

// Tramo del roadmap. proposals.roadmap es ProposalRoadmapPhase[] (JSON).
export interface ProposalRoadmapPhase {
  period: string; // ej "Semanas 1-2"
  label: string;
  focus: string;
  activities: string[];
  milestone: string;
}

// Integrante del equipo propuesto. proposals.team es ProposalTeamMember[] (JSON).
export interface ProposalTeamMember {
  role: string;
  stack: string;
  modality: string;
  responsibilities: string[];
}

// Riesgo + mitigación. proposals.risks es ProposalRisk[] (JSON).
// El body empieza con "Mitigación:" por convención editorial.
export interface ProposalRisk {
  title: string;
  body: string;
}
