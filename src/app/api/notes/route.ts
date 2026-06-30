import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

// GET /api/notes?targetType=&targetId=  → notas del registro, mas recientes primero.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");
  if (!targetType || !targetId) {
    return NextResponse.json({ error: "targetType y targetId son requeridos" }, { status: 400 });
  }
  const rows = db
    .select()
    .from(notes)
    .where(and(eq(notes.targetType, targetType), eq(notes.targetId, targetId)))
    .orderBy(desc(notes.createdAt))
    .all();
  return NextResponse.json(rows);
}

// POST /api/notes { targetType, targetId, body }
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const targetType = String(body?.targetType ?? "").trim();
  const targetId = String(body?.targetId ?? "").trim();
  const text = String(body?.body ?? "").trim();
  if (!targetType || !targetId || !text) {
    return NextResponse.json({ error: "targetType, targetId y body son requeridos" }, { status: 400 });
  }
  const row = db
    .insert(notes)
    .values({ targetType, targetId, body: text, createdAt: new Date() })
    .returning()
    .get();
  return NextResponse.json(row, { status: 201 });
}

// DELETE /api/notes?id=
export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  db.delete(notes).where(eq(notes.id, id)).run();
  return NextResponse.json({ ok: true });
}
