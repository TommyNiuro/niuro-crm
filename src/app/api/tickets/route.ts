import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(db.select().from(tickets).orderBy(desc(tickets.createdAt)).all());
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { subject, priority, status, sla, contactId } = body || {};
  if (!subject) return NextResponse.json({ error: "subject requerido" }, { status: 400 });
  // Código único por timestamp (auditoría 2026-06-09: count(*)+1 colisionaba
  // al borrar tickets y cargaba toda la tabla en cada alta)
  const code = `TK-${Date.now().toString(36).toUpperCase()}`;
  const row = db
    .insert(tickets)
    .values({
      code,
      subject,
      status: status || "open",
      priority: priority || "medium",
      sla: sla || null,
      agentId: "asistente",
      contactId: contactId || null,
      createdAt: new Date(),
    })
    .returning()
    .get();
  dispatchRecordEvent("tickets", "created", row as { id: string } & Record<string, unknown>);
  return NextResponse.json(row, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { id, status } = body || {};
  if (!id || !status) return NextResponse.json({ error: "id y status requeridos" }, { status: 400 });
  const VALID = ["open", "pending", "resolved"];
  if (!VALID.includes(status)) return NextResponse.json({ error: "status invalido" }, { status: 400 });
  const row = db.update(tickets).set({ status }).where(eq(tickets.id, id)).returning().get();
  if (!row) return NextResponse.json({ error: "ticket no encontrado" }, { status: 404 });
  dispatchRecordEvent("tickets", "updated", row as { id: string } & Record<string, unknown>);
  return NextResponse.json(row);
}
