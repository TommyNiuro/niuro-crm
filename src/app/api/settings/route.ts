import { NextRequest, NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const ALLOWLIST = ["auto_promote_hot", "rubric_config", "goal_mrr", "radar_decay_days", "apollo_api_key"];
// Secretos: el GET nunca devuelve el valor, solo si está seteado.
const SECRET_KEYS = new Set(["apollo_api_key"]);

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !ALLOWLIST.includes(key)) {
    return NextResponse.json({ error: "Clave no permitida" }, { status: 400 });
  }
  const value = readSettings([key])[key] ?? null;
  if (SECRET_KEYS.has(key)) {
    return NextResponse.json({ key, set: value !== null && value !== "" });
  }
  return NextResponse.json({ key, value });
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

  writeSettings({ [key]: String(value) });
  return NextResponse.json({ key, value });
}
