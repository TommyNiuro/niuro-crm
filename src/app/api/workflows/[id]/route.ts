import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/db";

export const dynamic = "force-dynamic";

// GET (workflow + sus últimos runs), PATCH (editar/activar, bump version) y
// DELETE de un workflow.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wf = rawDb.prepare(`SELECT * FROM workflows WHERE id = ?`).get(id);
  if (!wf) return NextResponse.json({ error: "workflow no encontrado" }, { status: 404 });
  const runs = rawDb
    .prepare(`SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 50`)
    .all(id);
  return NextResponse.json({ ...wf, runs });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = rawDb.prepare(`SELECT * FROM workflows WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: "workflow no encontrado" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (typeof body.name === "string") { sets.push(`name = ?`); vals.push(body.name); }
  if ("description" in body) { sets.push(`description = ?`); vals.push(typeof body.description === "string" ? body.description : null); }
  if (typeof body.active === "boolean") { sets.push(`active = ?`); vals.push(body.active ? 1 : 0); }
  if ("triggerConfig" in body) { sets.push(`trigger_config = ?`); vals.push(JSON.stringify(body.triggerConfig ?? {})); }
  // Editar steps versiona la definición (version++): los runs viejos siguen
  // referenciando la versión con la que corrieron vía sus logs.
  if (Array.isArray(body.steps)) {
    sets.push(`steps = ?`); vals.push(JSON.stringify(body.steps));
    sets.push(`version = ?`); vals.push((Number(existing.version) || 1) + 1);
  }
  if (sets.length === 0) return NextResponse.json({ error: "sin cambios" }, { status: 400 });

  sets.push(`updated_at = ?`); vals.push(Math.floor(Date.now() / 1000));
  vals.push(id);
  rawDb.prepare(`UPDATE workflows SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return NextResponse.json(rawDb.prepare(`SELECT * FROM workflows WHERE id = ?`).get(id));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  rawDb.prepare(`DELETE FROM workflow_runs WHERE workflow_id = ?`).run(id);
  rawDb.prepare(`DELETE FROM workflows WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
