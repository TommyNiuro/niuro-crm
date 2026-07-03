import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, deals, activities, tasks, stepTransitions, leadCandidates, proposals } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { stageCfgFor } from "@/lib/stages";
import { contactUpdateSchema, validate } from "@/lib/validation";
import { mergeCustomFields, applyCustomFieldsFromBody } from "@/lib/custom-fields";
import { logActivity, diffChanges } from "@/lib/timeline";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";

/** Saca el nombre legible del cliente desde la columna 'client' (JSON o string). */
function parseClientName(raw: unknown): string {
  if (typeof raw !== "string") return "Propuesta";
  try {
    const obj = JSON.parse(raw);
    return typeof obj?.name === "string" ? obj.name : "Propuesta";
  } catch {
    return raw || "Propuesta";
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const contact = db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .get();

  if (!contact) {
    return NextResponse.json(
      { error: "Contacto no encontrado" },
      { status: 404 }
    );
  }

  const contactDeals = db
    .select()
    .from(deals)
    .where(eq(deals.contactId, id))
    .all();

  const contactActivities = db
    .select()
    .from(activities)
    .where(eq(activities.contactId, id))
    .all();

  // Propuestas vinculadas (capa relacional): liviano, solo lo que el panel muestra.
  const contactProposals = db
    .select({ id: proposals.id, client: proposals.client, role: proposals.role, status: proposals.status })
    .from(proposals)
    .where(eq(proposals.contactId, id))
    .all()
    .map((p) => ({ ...p, clientName: parseClientName(p.client) }));

  const [withCustom] = mergeCustomFields("contacts", [contact]);
  return NextResponse.json({
    ...withCustom,
    deals: contactDeals,
    proposals: contactProposals,
    activities: contactActivities,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = validate(contactUpdateSchema, raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  const existing = db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .get();

  if (!existing) {
    return NextResponse.json(
      { error: "Contacto no encontrado" },
      { status: 404 }
    );
  }

  // Only allow updating specific fields
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.company !== undefined) updateData.company = body.company;
  if (body.country !== undefined) updateData.country = body.country;
  if (body.source !== undefined) updateData.source = body.source;
  if (body.temperature !== undefined) updateData.temperature = body.temperature;
  if (body.score !== undefined) updateData.score = Math.max(0, Math.min(100, body.score));
  if (body.notes !== undefined) updateData.notes = body.notes;
  // Campos del modelo Niuro
  if (body.channel !== undefined) updateData.channel = body.channel;
  if (body.probability !== undefined) updateData.probability = Math.max(0, Math.min(100, body.probability));
  if (body.valueCents !== undefined) updateData.valueCents = Math.max(0, body.valueCents);
  if (body.nextAction !== undefined) updateData.nextAction = body.nextAction;
  if (body.agentId !== undefined) updateData.agentId = body.agentId;
  if (body.archived !== undefined) updateData.archived = !!body.archived;
  if (body.disqualifyReason !== undefined) updateData.disqualifyReason = body.disqualifyReason;
  if (body.deletedAt === null) updateData.deletedAt = null; // restaurar desde papelera (b7)
  if (body.tags !== undefined)
    updateData.tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : body.tags;

  const now = new Date();
  const stageChanged = body.stage !== undefined && body.stage !== existing.stage;
  if (body.stage !== undefined) updateData.stage = body.stage;

  // Transacción (auditoría 2026-06-09): transición + tarea + actividad + update
  // del contacto son una unidad — antes eran 4 escrituras sueltas.
  const result = db.transaction(() => {

  // Mover de etapa dispara: registrar transicion + crear la tarea del playbook
  // + fijar el proximo paso con fecha (ejecucion obligatoria).
  if (stageChanged) {
    const stage = body.stage as string; // stageChanged garantiza definido
    const cfg = stageCfgFor(stage, 0);
    // Registrar transición de etapa
    const lastTransition = db.select({ occurredAt: stepTransitions.occurredAt })
      .from(stepTransitions)
      .where(eq(stepTransitions.contactId, id))
      .orderBy(desc(stepTransitions.occurredAt))
      .all()
      .pop();
    const durationDays = lastTransition?.occurredAt
      ? Math.max(0, Math.round((now.getTime() - new Date(lastTransition.occurredAt).getTime()) / 86400000))
      : null;
    db.insert(stepTransitions)
      .values({ contactId: id, fromStep: existing.stage, toStep: stage, durationDays, occurredAt: now })
      .run();
    // Crear tarea del playbook
    if (cfg) {
      const due = new Date(now.getTime() + cfg.dueInDays * 86400000);
      db.insert(tasks)
        .values({ contactId: id, title: cfg.task, stepName: stage, dueAt: due, status: "open", createdAt: now })
        .run();
      updateData.nextAction = cfg.task;
      updateData.nextStepDue = due;
      // La etapa define la probabilidad (estilo HubSpot); el valor manual del
      // request es la excepción (auditoría 2026-06-09)
      if (body.probability === undefined) updateData.probability = cfg.probability;
    }
    // Loguear en la timeline del contacto
    db.insert(activities)
      .values({
        contactId: id,
        type: "note",
        description: `Movido de ${existing.stage} a ${stage}${cfg ? `. Tarea creada: ${cfg.task}` : ""}`,
        createdAt: now,
      })
      .run();
  }

  return db
    .update(contacts)
    .set(updateData)
    .where(eq(contacts.id, id))
    .returning()
    .get();
  });

  // Campos custom: las keys del body crudo que sean fields custom de 'contacts'
  // se guardan en custom_field_values (no son columnas reales). El resto ya lo
  // manejo el whitelist de arriba.
  if (raw && typeof raw === "object") applyCustomFieldsFromBody("contacts", id, raw as Record<string, unknown>);

  if (body.deletedAt === null && existing.deletedAt) {
    logActivity("contacts", id, "restored");
  } else {
    logActivity("contacts", id, "updated", diffChanges(existing, updateData, Object.keys(updateData).filter((k) => k !== "updatedAt")));
  }

  // Dispara workflows 'record_event updated en contacts' (b4-engine). Fire-and-forget:
  // no await, no rompe la respuesta si un workflow falla.
  if (result) dispatchRecordEvent("contacts", "updated", result as { id: string } & Record<string, unknown>);

  const [merged] = mergeCustomFields("contacts", [result]);
  return NextResponse.json(merged);
}

// DELETE soft por defecto (papelera b7): marca deleted_at = ahora. El borrado
// físico (con su cascada a tasks/activities/deals) queda solo tras ?hard=1,
// que es lo que dispara "Borrar definitivo" desde la papelera.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const hard = new URL(request.url).searchParams.get("hard") === "1";

  const existing = db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .get();

  if (!existing) {
    return NextResponse.json(
      { error: "Contacto no encontrado" },
      { status: 404 }
    );
  }

  if (!hard) {
    db.update(contacts).set({ deletedAt: new Date() }).where(eq(contacts.id, id)).run();
    logActivity("contacts", id, "deleted");
    dispatchRecordEvent("contacts", "deleted", existing as { id: string } & Record<string, unknown>);
    return NextResponse.json({ success: true });
  }

  db.transaction(() => {
    db.delete(tasks).where(eq(tasks.contactId, id)).run();
    db.delete(stepTransitions).where(eq(stepTransitions.contactId, id)).run();
    db.delete(activities).where(eq(activities.contactId, id)).run();
    db.delete(deals).where(eq(deals.contactId, id)).run();
    db.update(leadCandidates).set({ contactId: null }).where(eq(leadCandidates.contactId, id)).run();
    db.delete(contacts).where(eq(contacts.id, id)).run();
  });
  dispatchRecordEvent("contacts", "deleted", existing as { id: string } & Record<string, unknown>);
  return NextResponse.json({ success: true });
}
