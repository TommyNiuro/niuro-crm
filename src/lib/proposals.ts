// Helpers compartidos del modulo de propuestas comerciales.
//
// La tabla proposals guarda el contenido editorial (client, pricing, context,
// cards, roadmap, team, risks) como JSON serializado en columnas TEXT. La UI y
// la IA trabajan con objetos, asi que al leer hay que parsear y al escribir hay
// que stringificar. serializeProposal centraliza el parseo (tolerante a null y
// a JSON invalido) para reusarlo en todos los GET.

import { db } from "@/db";
import {
  proposals,
  contacts,
  deals,
  pipelineStages,
  stepTransitions,
  activities,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Proposal } from "@/db/schema";
import type {
  ProposalClient,
  ProposalPricing,
  ProposalContext,
  ProposalCards,
  ProposalRoadmapPhase,
  ProposalTeamMember,
  ProposalRisk,
  ProposalMode,
  ProposalStatus,
} from "@/types";

// Estados validos del ciclo de vida de una propuesta (coincide con
// ProposalStatus en src/types). archived = soft delete.
export const PROPOSAL_STATUSES: ProposalStatus[] = [
  "draft",
  "sent",
  "in-review",
  "negotiation",
  "signed",
  "lost",
  "archived",
];

export const PROPOSAL_MODES: ProposalMode[] = ["staff-aug", "sprint"];

// Forma serializada de una propuesta: misma fila pero con los campos JSON ya
// parseados a objeto y los timestamps como epoch ms (lo que consume el cliente).
export interface SerializedProposal {
  id: string;
  contactId: string | null;
  dealId: string | null;
  mode: string;
  status: string;
  date: string | null;
  client: ProposalClient | null;
  role: string | null;
  duration: string | null;
  transcript: string | null;
  notes: string | null;
  pricing: ProposalPricing | null;
  summary: string | null;
  context: ProposalContext | null;
  cards: ProposalCards | null;
  roadmap: ProposalRoadmapPhase[] | null;
  team: ProposalTeamMember[] | null;
  risks: ProposalRisk[] | null;
  generated: boolean;
  priority: string | null;
  genStatus: string | null;
  genError: string | null;
  sentAt: number | null;
  signedAt: number | null;
  closedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// Parseo tolerante: null/"" -> null, JSON invalido -> null (no rompe el GET).
function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// Date | number | null -> epoch ms | null.
function toMs(value: Date | number | null): number | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.getTime() : value;
}

// Convierte una fila de proposals a la forma que consume el cliente: campos
// JSON parseados a objeto, timestamps en epoch ms. Reusado por todos los GET.
export function serializeProposal(row: Proposal): SerializedProposal {
  return {
    id: row.id,
    contactId: row.contactId,
    dealId: row.dealId,
    mode: row.mode,
    status: row.status,
    date: row.date,
    client: parseJson<ProposalClient>(row.client),
    role: row.role,
    duration: row.duration,
    transcript: row.transcript,
    notes: row.notes,
    pricing: parseJson<ProposalPricing>(row.pricing),
    summary: row.summary,
    context: parseJson<ProposalContext>(row.context),
    cards: parseJson<ProposalCards>(row.cards),
    roadmap: parseJson<ProposalRoadmapPhase[]>(row.roadmap),
    team: parseJson<ProposalTeamMember[]>(row.team),
    risks: parseJson<ProposalRisk[]>(row.risks),
    generated: row.generated,
    priority: row.priority,
    genStatus: row.genStatus,
    genError: row.genError,
    sentAt: toMs(row.sentAt),
    signedAt: toMs(row.signedAt),
    closedAt: toMs(row.closedAt),
    createdAt: toMs(row.createdAt) ?? 0,
    updatedAt: toMs(row.updatedAt) ?? 0,
  };
}

// Stringifica un campo JSON para guardarlo en TEXT. undefined => no tocar
// (devuelve undefined para omitirlo del update); null => null explicito en DB;
// objeto => JSON.stringify; string => se asume ya serializado y se deja igual.
export function stringifyJsonField(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

// ── Mapeo de status de propuesta -> etapa del pipeline ─────────────────────
// El pipeline de Niuro (pipeline_stages, ver src/db/index.ts) tiene 7 etapas:
//   Prospecto, Discovery, Propuesta, Perfil, Entrevistas, Cierre(isWon), Expansion.
// No existe etapa con isLost=1: en esta app un lead perdido se marca con
// contacts.archived=true (columna virtual "Perdidos", ver whatsapp/lost-lead).
//
// Decisiones de mapeo (status de la propuesta -> a donde llevamos al contacto):
//   'sent'   -> etapa "Propuesta" (literalmente la etapa "Enviar propuesta" del
//               playbook). Solo avanzamos si el contacto esta antes; nunca lo
//               retrocedemos de una etapa mas avanzada.
//   'signed' -> etapa con isWon=1 ("Cierre"). Es ganar el negocio.
//   'lost'   -> no hay etapa isLost: se archiva el contacto (archived=true).
//
// El nombre de etapa para 'sent' se resuelve por nombre, tolerante a variantes.
export const PROPOSAL_SENT_STAGE_NAMES = ["Propuesta", "Propuesta enviada", "Proposal"];

// Devuelve true si la etapa "candidata" esta mas adelante (mayor order) que la
// etapa "actual" del contacto. Sirve para no retroceder a un contacto.
export function isStageAhead(
  candidateOrder: number,
  currentName: string,
  stagesByName: Map<string, { order: number }>
): boolean {
  const current = stagesByName.get(currentName);
  if (!current) return true; // etapa actual desconocida: dejamos avanzar
  return candidateOrder > current.order;
}

// Estados que disparan movimiento de pipeline (el resto solo cambia el status).
const PIPELINE_STATUSES = new Set(["sent", "signed", "lost"]);

// Resultado de aplicar un cambio de status: la propuesta actualizada + que paso
// con el pipeline (para que la ruta lo devuelva y se vea en la UI).
export interface StatusChangeResult {
  proposal: Proposal;
  pipeline:
    | { moved: false; reason: string }
    | { moved: true; type: "sent" | "signed" | "lost"; contactId: string; toStage: string | null; archived: boolean };
}

// Aplica un cambio de status a una propuesta y, si corresponde, MUEVE el
// pipeline del contacto/deal ligado. Todo en una sola db.transaction() para que
// el cambio de status + el movimiento sean atomicos (mismo patron que
// image-leads/approve). Si la propuesta no tiene contacto ni deal, solo cambia
// el status. Reusado por PUT /api/proposals/[id] y POST .../[id]/status.
//
// Reglas de pipeline:
//   sent   -> sentAt=now; contacto avanza a "Propuesta" (si esta antes) y se
//             registra step_transition. Si hay deal, mueve deal.stageId tambien.
//   signed -> signedAt=now; contacto/deal a la etapa isWon=1; step_transition +
//             activity 'note'.
//   lost   -> closedAt=now; no hay etapa isLost, asi que se archiva el contacto
//             (archived=true) como "Perdidos"; step_transition + activity 'note'.
export function applyStatusChange(proposal: Proposal, status: string): StatusChangeResult {
  const now = new Date();

  return db.transaction((tx): StatusChangeResult => {
    // 1) Timestamps segun el nuevo status + persistir status en la propuesta.
    const patch: Record<string, unknown> = { status, updatedAt: now };
    if (status === "sent") patch.sentAt = now;
    if (status === "signed") patch.signedAt = now;
    if (status === "lost") patch.closedAt = now;

    const updated = tx
      .update(proposals)
      .set(patch)
      .where(eq(proposals.id, proposal.id))
      .returning()
      .get();

    // 2) Sin movimiento de pipeline para estados intermedios.
    if (!PIPELINE_STATUSES.has(status)) {
      return { proposal: updated, pipeline: { moved: false, reason: "status sin movimiento de pipeline" } };
    }

    // 3) Resolver el contacto: directo (contactId) o via el deal ligado.
    let contactId = proposal.contactId;
    const deal = proposal.dealId
      ? tx.select().from(deals).where(eq(deals.id, proposal.dealId)).get()
      : undefined;
    if (!contactId && deal) contactId = deal.contactId;

    if (!contactId) {
      return { proposal: updated, pipeline: { moved: false, reason: "propuesta sin contacto ni deal ligado" } };
    }

    const contact = tx.select().from(contacts).where(eq(contacts.id, contactId)).get();
    if (!contact) {
      return { proposal: updated, pipeline: { moved: false, reason: "contacto ligado no existe" } };
    }

    const allStages = tx.select().from(pipelineStages).all();
    const stagesByName = new Map(allStages.map((s) => [s.name, s] as const));

    // ── status = lost: no hay etapa isLost. Archivamos el contacto. ──────────
    if (status === "lost") {
      const reason = "Propuesta marcada como perdida";
      tx.update(contacts)
        .set({ archived: true, disqualifyReason: contact.disqualifyReason ?? reason, updatedAt: now })
        .where(eq(contacts.id, contact.id))
        .run();
      tx.insert(stepTransitions)
        .values({ contactId: contact.id, fromStep: contact.stage, toStep: "Perdidos", occurredAt: now })
        .run();
      tx.insert(activities)
        .values({
          type: "note",
          description: reason,
          contactId: contact.id,
          dealId: deal?.id ?? null,
          completedAt: now,
          createdAt: now,
        })
        .run();
      return {
        proposal: updated,
        pipeline: { moved: true, type: "lost", contactId: contact.id, toStage: null, archived: true },
      };
    }

    // ── status = signed: mover a la etapa ganada (isWon=1). ──────────────────
    if (status === "signed") {
      const won = allStages.find((s) => s.isWon);
      if (!won) {
        return { proposal: updated, pipeline: { moved: false, reason: "no existe etapa isWon en el pipeline" } };
      }
      if (contact.stage !== won.name) {
        tx.update(contacts)
          .set({ stage: won.name, archived: false, updatedAt: now })
          .where(eq(contacts.id, contact.id))
          .run();
        tx.insert(stepTransitions)
          .values({ contactId: contact.id, fromStep: contact.stage, toStep: won.name, occurredAt: now })
          .run();
      }
      if (deal && deal.stageId !== won.id) {
        tx.update(deals).set({ stageId: won.id, updatedAt: now }).where(eq(deals.id, deal.id)).run();
      }
      tx.insert(activities)
        .values({
          type: "note",
          description: "Propuesta firmada: negocio ganado",
          contactId: contact.id,
          dealId: deal?.id ?? null,
          completedAt: now,
          createdAt: now,
        })
        .run();
      return {
        proposal: updated,
        pipeline: { moved: true, type: "signed", contactId: contact.id, toStage: won.name, archived: false },
      };
    }

    // ── status = sent: avanzar a la etapa de "propuesta enviada". ────────────
    // Buscamos por nombre (tolerante a variantes). Si ninguno matchea, caemos a
    // la etapa "Propuesta" del playbook por order (order=2). Solo avanzamos si
    // el contacto esta en una etapa anterior: nunca lo retrocedemos.
    let target =
      PROPOSAL_SENT_STAGE_NAMES.map((n) => stagesByName.get(n)).find((s) => s !== undefined) ?? undefined;
    if (!target) {
      target = [...allStages].sort((a, b) => a.order - b.order).find((s) => s.order >= 2);
    }
    if (!target) {
      return { proposal: updated, pipeline: { moved: false, reason: "no se encontro etapa de propuesta enviada" } };
    }

    if (isStageAhead(target.order, contact.stage, stagesByName)) {
      tx.update(contacts)
        .set({ stage: target.name, updatedAt: now })
        .where(eq(contacts.id, contact.id))
        .run();
      tx.insert(stepTransitions)
        .values({ contactId: contact.id, fromStep: contact.stage, toStep: target.name, occurredAt: now })
        .run();
      if (deal && deal.stageId !== target.id) {
        tx.update(deals).set({ stageId: target.id, updatedAt: now }).where(eq(deals.id, deal.id)).run();
      }
    }
    return {
      proposal: updated,
      pipeline: { moved: true, type: "sent", contactId: contact.id, toStage: target.name, archived: false },
    };
  });
}
