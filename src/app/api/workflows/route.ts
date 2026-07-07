import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { rawDb } from "@/db";

export const dynamic = "force-dynamic";

// CRUD de workflows (b4-engine). steps/trigger_config se guardan como JSON TEXT.
// Sin Drizzle: usa rawDb (mismo patrón que el metadata engine). Timestamps en
// SEGUNDOS (Math.floor(Date.now()/1000)).

const TRIGGER_TYPES = ["record_event", "scheduled", "manual"];

export async function GET() {
  const rows = rawDb.prepare(`SELECT * FROM workflows ORDER BY created_at DESC`).all();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name requerido" }, { status: 400 });
  const triggerType = String(body.triggerType ?? "manual");
  if (!TRIGGER_TYPES.includes(triggerType)) {
    return NextResponse.json({ error: `triggerType invalido (${TRIGGER_TYPES.join("|")})` }, { status: 400 });
  }
  const steps = Array.isArray(body.steps) ? body.steps : [];
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  rawDb
    .prepare(
      `INSERT INTO workflows (id, name, description, trigger_type, trigger_config, steps, active, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      id,
      name,
      typeof body.description === "string" ? body.description : null,
      triggerType,
      JSON.stringify(body.triggerConfig ?? {}),
      JSON.stringify(steps),
      body.active === false ? 0 : 1,
      now,
      now
    );
  const row = rawDb.prepare(`SELECT * FROM workflows WHERE id = ?`).get(id);
  return NextResponse.json(row, { status: 201 });
}
