import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(db.select().from(events).orderBy(asc(events.date)).all());
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { title, type, date, time, contactId, agentId } = body || {};
  if (!title || !date) {
    return NextResponse.json({ error: "title y date son requeridos" }, { status: 400 });
  }
  const row = db
    .insert(events)
    .values({
      title,
      type: type || "meeting",
      date,
      time: time || null,
      contactId: contactId || null,
      agentId: agentId || "asistente",
      createdAt: new Date(),
    })
    .returning()
    .get();
  return NextResponse.json(row, { status: 201 });
}
