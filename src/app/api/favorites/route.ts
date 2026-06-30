import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { favorites } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";

// GET /api/favorites  → todos los favoritos, en orden de position.
export async function GET() {
  const rows = db.select().from(favorites).orderBy(asc(favorites.position), asc(favorites.createdAt)).all();
  return NextResponse.json(rows);
}

// POST /api/favorites { targetType, targetId, label, href }  → fija un favorito.
// Idempotente: si ya existe (índice único target_type+target_id) devuelve el existente.
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const targetType = String(body?.targetType ?? "").trim();
  const targetId = String(body?.targetId ?? "").trim();
  const label = String(body?.label ?? "").trim();
  const href = String(body?.href ?? "").trim();
  if (!targetType || !targetId || !label || !href) {
    return NextResponse.json({ error: "targetType, targetId, label y href son requeridos" }, { status: 400 });
  }

  const existing = db
    .select()
    .from(favorites)
    .where(and(eq(favorites.targetType, targetType), eq(favorites.targetId, targetId)))
    .get();
  if (existing) return NextResponse.json(existing, { status: 200 });

  // position = al final (último + 1). Cuenta liviana, sin tabla entera.
  const max = db.select().from(favorites).orderBy(asc(favorites.position)).all().at(-1)?.position ?? -1;
  const row = db
    .insert(favorites)
    .values({ targetType, targetId, label, href, position: max + 1, createdAt: new Date() })
    .returning()
    .get();
  return NextResponse.json(row, { status: 201 });
}

// DELETE /api/favorites?id=  |  ?targetType=&targetId=  → quita un favorito.
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");
  if (id) {
    db.delete(favorites).where(eq(favorites.id, id)).run();
  } else if (targetType && targetId) {
    db.delete(favorites).where(and(eq(favorites.targetType, targetType), eq(favorites.targetId, targetId))).run();
  } else {
    return NextResponse.json({ error: "id o (targetType + targetId) requeridos" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
