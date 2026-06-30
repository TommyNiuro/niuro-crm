/**
 * promote-lead.ts — Promueve un lead_candidate a contact en stage Discovery.
 * Compartido entre el approve manual (PATCH) y la auto-promocion (POST ingest hot).
 */

import { db } from "@/db";
import { leadCandidates, contacts, activities, tasks, stepTransitions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMessages, dbExists } from "@/lib/whatsapp";
import { STAGE_CFG } from "@/lib/crm-ui";

type Candidate = typeof leadCandidates.$inferSelect;

export interface PromoteOptions {
  /** Si true, marca la actividad como "auto" para auditoria. */
  auto?: boolean;
  /** Stage destino. Default "Discovery". */
  stage?: string;
}

/**
 * Crea contacto a partir del candidato, importa los ultimos mensajes,
 * crea tarea del playbook y registra step_transition. Marca el candidate
 * como approved con contactId. Idempotente: si ya hay contacto con ese
 * whatsappJid lo reutiliza.
 */
export function promoteCandidate(candidate: Candidate, opts: PromoteOptions = {}) {
  const { auto = false, stage = "Discovery" } = opts;
  const now = new Date();

  // Transacción (auditoría 2026-06-09): contacto + tarea + transición + actividades
  // + aprobación del candidate, todo o nada.
  return db.transaction(() => {
  // Idempotencia: si ya existe contacto con ese jid, no duplicar.
  let contact = db
    .select()
    .from(contacts)
    .where(eq(contacts.whatsappJid, candidate.chatJid))
    .get();

  if (!contact) {
    contact = db
      .insert(contacts)
      .values({
        name: candidate.name,
        phone: candidate.phone || null,
        source: "whatsapp",
        temperature: candidate.temperature,
        score: candidate.score,
        stage,
        // Sin esto el contacto entraba con probability=0 y aportaba $0 al
        // pipeline ponderado (auditoría 2026-06-09)
        probability: STAGE_CFG[stage]?.probability ?? 15,
        whatsappJid: candidate.chatJid,
        notes: candidate.reason
          ? `${auto ? "Lead auto-promovido" : "Lead detectado"} por WhatsApp. ${candidate.reason}`
          : `${auto ? "Lead auto-promovido" : "Lead detectado"} por WhatsApp.`,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Tarea del playbook + step_transition (replica el flujo del PUT /contacts/[id])
    const cfg = STAGE_CFG[stage];
    if (cfg) {
      const due = new Date(now.getTime() + cfg.dueInDays * 86400000);
      db.insert(tasks)
        .values({
          contactId: contact.id,
          title: cfg.task,
          stepName: stage,
          dueAt: due,
          status: "open",
          createdAt: now,
        })
        .run();
      db.update(contacts)
        .set({ nextAction: cfg.task, nextStepDue: due, updatedAt: now })
        .where(eq(contacts.id, contact.id))
        .run();
    }
    db.insert(stepTransitions)
      .values({ contactId: contact.id, fromStep: null, toStep: stage, occurredAt: now })
      .run();

    // Importar mensajes recientes de WhatsApp como actividad
    if (dbExists()) {
      try {
        const msgs = getMessages({ chatJid: candidate.chatJid, limit: 12 }).filter(
          (m) => (m.content && m.content.trim()) || m.mediaType
        );
        if (msgs.length > 0) {
          const digest = msgs
            .map((m) => `${m.isFromMe ? "Yo" : "Lead"}: ${m.content?.trim() || `[${m.mediaType}]`}`)
            .join("\n");
          const last = msgs[msgs.length - 1].timestamp;
          const lastDate = last ? new Date(last) : now;
          db.insert(activities)
            .values({
              type: "note",
              description: `Conversacion de WhatsApp (${msgs.length} mensajes recientes):\n${digest}`,
              contactId: contact.id,
              dealId: null,
              scheduledAt: null,
              completedAt: !isNaN(lastDate.getTime()) ? lastDate : now,
              createdAt: !isNaN(lastDate.getTime()) ? lastDate : now,
            })
            .run();
        }
      } catch (err) {
        // no crítico, pero visible: el contacto se crea sin su historial de chat
        console.error("[promote-lead] no se pudo importar el historial de WhatsApp:", err);
      }
    }

    // Si fue auto, dejar nota para que el operador sepa
    if (auto) {
      db.insert(activities)
        .values({
          type: "note",
          description: `Lead auto-promovido (score ${candidate.score}, ${candidate.temperature}). ${candidate.reason ?? ""}`,
          contactId: contact.id,
          createdAt: now,
        })
        .run();
    }
  }

  // Marcar candidato como approved
  db.update(leadCandidates)
    .set({ status: "approved", contactId: contact.id, updatedAt: now })
    .where(eq(leadCandidates.id, candidate.id))
    .run();

  return contact;
  });
}

/** Umbral por defecto para auto-promocion. */
export const AUTO_PROMOTE_THRESHOLD = 85;
