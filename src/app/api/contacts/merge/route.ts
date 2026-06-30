import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  contacts,
  deals,
  activities,
  tasks,
  stepTransitions,
  leadCandidates,
  proposals,
  notes,
  attachments,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logActivity } from "@/lib/timeline";

// Campos del contacto que el dialog puede elegir mantener del perdedor.
// (whitelist espeja el PUT de /api/contacts/[id]; deja fuera ids/timestamps/stage,
//  porque mover de etapa dispara efectos secundarios y no es lo que se fusiona.)
const MERGEABLE = [
  "name", "email", "phone", "company", "country", "source", "temperature",
  "score", "notes", "channel", "probability", "valueCents", "nextAction",
  "agentId", "tags", "whatsappJid",
] as const;

// POST /api/contacts/merge { survivorId, loserId, fields? }
//  - fields: overrides del registro superviviente (valor elegido por campo).
//  - re-apunta deals/proposals/notes/tasks/attachments/activities/transitions/
//    leadCandidates del perdedor al superviviente.
//  - soft-deletea el perdedor (deleted_at = ahora).
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const survivorId = String(body?.survivorId ?? "").trim();
  const loserId = String(body?.loserId ?? "").trim();
  if (!survivorId || !loserId) {
    return NextResponse.json({ error: "survivorId y loserId son requeridos" }, { status: 400 });
  }
  if (survivorId === loserId) {
    return NextResponse.json({ error: "No se puede fusionar un contacto consigo mismo" }, { status: 400 });
  }

  const survivor = db.select().from(contacts).where(eq(contacts.id, survivorId)).get();
  const loser = db.select().from(contacts).where(eq(contacts.id, loserId)).get();
  if (!survivor || !loser) {
    return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  }

  // Overrides elegidos en el dialog: solo keys de la whitelist.
  const overrides: Record<string, unknown> = {};
  const raw = (body?.fields ?? {}) as Record<string, unknown>;
  for (const k of MERGEABLE) {
    if (k in raw) {
      overrides[k] = k === "tags" && Array.isArray(raw[k]) ? JSON.stringify(raw[k]) : raw[k];
    }
  }

  db.transaction(() => {
    // Re-apuntar relaciones del perdedor al superviviente.
    db.update(deals).set({ contactId: survivorId }).where(eq(deals.contactId, loserId)).run();
    db.update(proposals).set({ contactId: survivorId }).where(eq(proposals.contactId, loserId)).run();
    db.update(activities).set({ contactId: survivorId }).where(eq(activities.contactId, loserId)).run();
    db.update(tasks).set({ contactId: survivorId }).where(eq(tasks.contactId, loserId)).run();
    db.update(stepTransitions).set({ contactId: survivorId }).where(eq(stepTransitions.contactId, loserId)).run();
    db.update(leadCandidates).set({ contactId: survivorId }).where(eq(leadCandidates.contactId, loserId)).run();
    // notes / attachments: target_type='contacts' + target_id genérico.
    db.update(notes).set({ targetId: survivorId })
      .where(and(eq(notes.targetType, "contacts"), eq(notes.targetId, loserId))).run();
    db.update(attachments).set({ targetId: survivorId })
      .where(and(eq(attachments.targetType, "contacts"), eq(attachments.targetId, loserId))).run();

    // Aplicar los valores elegidos al superviviente (si hay overrides).
    if (Object.keys(overrides).length) {
      db.update(contacts).set({ ...overrides, updatedAt: new Date() }).where(eq(contacts.id, survivorId)).run();
    }

    // Soft-delete del perdedor (queda en papelera, no se purga).
    db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, loserId)).run();
  });

  logActivity("contacts", survivorId, "updated", { fusion: { from: loser.name, to: survivor.name } });
  logActivity("contacts", loserId, "deleted");

  const result = db.select().from(contacts).where(eq(contacts.id, survivorId)).get();
  return NextResponse.json(result);
}
