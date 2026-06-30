import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const ALLOWLIST = ["auto_promote_hot", "rubric_config"];

function getDb(): Database.Database {
  const dbPath = path.join(process.cwd(), "data", "crm.db");
  return new Database(dbPath, { timeout: 15000 });
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !ALLOWLIST.includes(key)) {
    return NextResponse.json({ error: "Clave no permitida" }, { status: 400 });
  }

  const sqlite = getDb();
  try {
    const row = sqlite.prepare("SELECT value FROM crm_settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return NextResponse.json({ key, value: row?.value ?? null });
  } finally {
    sqlite.close();
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { key, value } = body ?? {};

  if (!key || !ALLOWLIST.includes(key)) {
    return NextResponse.json({ error: "Clave no permitida" }, { status: 400 });
  }
  if (value === undefined || value === null) {
    return NextResponse.json({ error: "Valor requerido" }, { status: 400 });
  }

  const sqlite = getDb();
  try {
    sqlite
      .prepare("INSERT OR REPLACE INTO crm_settings (key, value) VALUES (?, ?)")
      .run(key, String(value));
    return NextResponse.json({ key, value });
  } finally {
    sqlite.close();
  }
}
