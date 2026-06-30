import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/db";

// /api/ai/agents (b6-ui-agentes). Agentes IA reutilizables: un nombre + un rol
// (system prompt) + qué tools puede usar. La tabla se crea on-demand (no esta en
// el schema de Drizzle): es metadata liviana de un operador unico/local.
//
// ponytail: la columna "tools" se guarda y se muestra; la imposicion fina (un
// agente que SOLO puede leer X) no existe todavia porque las read tools ya son
// inofensivas y las writes ya requieren confirmacion del usuario. Si hace falta
// restringir por agente, se filtra el prompt/whitelist en runCopilot.

let ensured = false;
function ensureTable() {
  if (ensured) return;
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS ai_agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      tools TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    )
  `);
  ensured = true;
}

// GET -> lista de agentes (mas nuevos primero).
export async function GET() {
  ensureTable();
  const rows = rawDb.prepare(`SELECT id, name, role, tools, created_at FROM ai_agents ORDER BY created_at DESC`).all();
  return NextResponse.json(rows);
}

// POST { id?, name, role, tools? } -> crea o (si viene id) actualiza un agente.
export async function POST(request: NextRequest) {
  ensureTable();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const b = body as { id?: unknown; name?: unknown; role?: unknown; tools?: unknown };
  const name = String(b?.name ?? "").trim();
  const role = String(b?.role ?? "").trim();
  if (!name || !role) {
    return NextResponse.json({ error: "name y role son requeridos" }, { status: 400 });
  }
  // tools: array de strings (nombres de tools). Lo serializamos como JSON.
  const tools = Array.isArray(b?.tools) ? JSON.stringify(b.tools.map(String)) : "[]";

  if (typeof b?.id === "string" && b.id) {
    const info = rawDb
      .prepare(`UPDATE ai_agents SET name = ?, role = ?, tools = ? WHERE id = ?`)
      .run(name, role, tools, b.id);
    if (info.changes === 0) return NextResponse.json({ error: "agente no existe" }, { status: 404 });
    return NextResponse.json({ id: b.id, name, role, tools });
  }

  const id = crypto.randomUUID();
  rawDb
    .prepare(`INSERT INTO ai_agents (id, name, role, tools, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, name, role, tools, Math.floor(Date.now() / 1000));
  return NextResponse.json({ id, name, role, tools }, { status: 201 });
}

// DELETE ?id= -> borra un agente.
export async function DELETE(request: NextRequest) {
  ensureTable();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  rawDb.prepare(`DELETE FROM ai_agents WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
