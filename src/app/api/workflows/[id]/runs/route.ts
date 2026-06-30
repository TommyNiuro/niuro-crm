import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/db";

// Historial de runs de un workflow (b4-triggers). Más reciente primero. ?limit
// acota (default 50, tope 200). El GET de [id] ya embebe los últimos 50; este
// endpoint es el acceso directo paginable al historial.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exists = rawDb.prepare(`SELECT 1 FROM workflows WHERE id = ?`).get(id);
  if (!exists) return NextResponse.json({ error: "workflow no encontrado" }, { status: 404 });

  const raw = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 200) : 50;
  const runs = rawDb
    .prepare(`SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?`)
    .all(id, limit);
  return NextResponse.json(runs);
}
