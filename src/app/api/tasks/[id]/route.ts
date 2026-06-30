import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tasks, contacts } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";

// PATCH /api/tasks/[id] { status?, title?, completedAt? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

  const now = new Date();
  const patch: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (t) patch.title = t;
  }
  if (body.status !== undefined) {
    const s = String(body.status);
    if (!["open", "completed", "cancelled"].includes(s)) {
      return NextResponse.json({ error: "status invalido" }, { status: 400 });
    }
    patch.status = s;
    patch.completedAt = s === "completed" ? now : null;
  }
  if (body.dueAt !== undefined) {
    const d = new Date(body.dueAt as string | number);
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "dueAt invalido" }, { status: 400 });
    }
    patch.dueAt = d;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Sin campos para actualizar" }, { status: 400 });
  }

  db.update(tasks).set(patch).where(eq(tasks.id, id)).run();

  // Limpiar proximo paso del contacto cuando la tarea se cierra — SOLO si no
  // quedan otras tareas abiertas (auditoría 2026-06-09: cerrar cualquier tarea
  // borraba el próximo paso aunque hubiera otras pendientes). Si queda alguna,
  // el próximo paso pasa a ser la más próxima a vencer.
  const finalStatus = (patch.status as string | undefined) ?? task.status;
  if (finalStatus === "open" && patch.dueAt !== undefined) {
    // La tarea sigue abierta pero cambió de fecha (snooze): recalcular el
    // próximo paso del contacto desde la tarea abierta más próxima a vencer.
    const nextOpen = db
      .select({ title: tasks.title, dueAt: tasks.dueAt })
      .from(tasks)
      .where(and(eq(tasks.contactId, task.contactId), eq(tasks.status, "open")))
      .all()
      .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))[0];
    if (nextOpen) {
      db.update(contacts)
        .set({ nextAction: nextOpen.title, nextStepDue: nextOpen.dueAt, updatedAt: now })
        .where(eq(contacts.id, task.contactId))
        .run();
    }
  }
  if (finalStatus !== "open") {
    const nextOpen = db
      .select({ title: tasks.title, dueAt: tasks.dueAt })
      .from(tasks)
      .where(and(eq(tasks.contactId, task.contactId), eq(tasks.status, "open"), ne(tasks.id, id)))
      .all()
      .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))[0];
    db.update(contacts)
      .set({
        nextAction: nextOpen?.title ?? null,
        nextStepDue: nextOpen?.dueAt ?? null,
        lastInteractionAt: now,
        updatedAt: now,
      })
      .where(eq(contacts.id, task.contactId))
      .run();
  }
  return NextResponse.json({ ok: true });
}
