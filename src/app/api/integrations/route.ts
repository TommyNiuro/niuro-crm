import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { getStatus } from "@/lib/whatsapp";
import { CLAUDE_BIN } from "@/lib/claude-subprocess";

export const dynamic = "force-dynamic";

// Estado de integraciones con verificación EN VIVO.
export async function GET() {
  const rows = db.select().from(integrations).all();

  let waUp = false;
  let waMsgs = 0;
  try {
    const s = await getStatus();
    waUp = s.bridgeUp && s.dbExists;
    waMsgs = s.messageCount;
  } catch {
    /* ignore */
  }

  const live = rows.map((i) => {
    if (i.id === "whatsapp")
      return { ...i, connected: waUp, leads: waMsgs, lastSync: waUp ? "ahora" : null };
    if (i.id === "anthropic")
      // La IA va por subprocess del CLI claude con auth Max — ANTHROPIC_API_KEY
      // no existe por diseño (auditoría 2026-06-09: siempre mostraba desconectado)
      return { ...i, connected: CLAUDE_BIN === "claude" || existsSync(CLAUDE_BIN) };
    if (i.id === "resend") return { ...i, connected: !!process.env.RESEND_API_KEY };
    return i;
  });
  return NextResponse.json(live);
}
