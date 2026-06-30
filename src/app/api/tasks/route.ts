import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tasks, contacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/tasks?scope=today|open  &  ?contactId=
// Devuelve tareas abiertas con datos del contacto para ordenar por score.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");
  const scope = searchParams.get("scope") || "open";

  const rows = db
    .select({
      id: tasks.id,
      contactId: tasks.contactId,
      title: tasks.title,
      stepName: tasks.stepName,
      dueAt: tasks.dueAt,
      status: tasks.status,
      completedAt: tasks.completedAt,
      contactName: contacts.name,
      contactScore: contacts.score,
      whatsappJid: contacts.whatsappJid,
      stage: contacts.stage,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .where(contactId ? eq(tasks.contactId, contactId) : eq(tasks.status, "open"))
    .all();

  let out = rows;
  if (scope === "today" && !contactId) {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    out = rows.filter((t) => t.status === "open" && t.dueAt && new Date(t.dueAt) <= end);
  }
  out.sort((a, b) => (b.contactScore || 0) - (a.contactScore || 0));
  return NextResponse.json(out);
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { contactId, title, dueAt, stepName } = body || {};
  if (!contactId || !title) {
    return NextResponse.json({ error: "contactId y title son requeridos" }, { status: 400 });
  }
  const due = dueAt ? new Date(dueAt) : null;
  const now = new Date();
  const row = db
    .insert(tasks)
    .values({ contactId, title, stepName: stepName || null, dueAt: due, status: "open", createdAt: now })
    .returning()
    .get();
  // Reflejar como proximo paso del contacto.
  db.update(contacts)
    .set({ nextAction: title, nextStepDue: due, updatedAt: now })
    .where(and(eq(contacts.id, contactId)))
    .run();
  return NextResponse.json(row, { status: 201 });
}
