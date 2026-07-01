import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import crypto from "crypto";
import { getStatus } from "@/lib/whatsapp";
import { dbPath } from "@/lib/paths";

// Tick del bridge de WhatsApp para /status (mismo patron que /api/workflows/tick
// y /api/sync/tick: pensado para que lo dispare un poller/cron). Loguea una
// fila en bridge_status_log SOLO si el estado cambio respecto al ultimo check
// — el historial son transiciones reales, no miles de checks identicos.
export async function POST() {
  try {
    const status = await getStatus();
    const newStatus = status.bridgeUp ? "up" : "down";
    const detail = status.bridgeUp
      ? `${status.chatCount} chats, ${status.messageCount} mensajes`
      : status.dbExists
        ? "DB del bridge encontrada pero el bridge no responde"
        : "DB del bridge no encontrada";

    const db = new Database(dbPath(), { timeout: 15000 });
    try {
      const last = db
        .prepare("SELECT status FROM bridge_status_log ORDER BY checked_at DESC LIMIT 1")
        .get() as { status: string } | undefined;
      const now = Date.now();
      if (!last || last.status !== newStatus) {
        db.prepare(
          "INSERT INTO bridge_status_log (id, status, detail, checked_at) VALUES (?, ?, ?, ?)"
        ).run(crypto.randomUUID(), newStatus, detail, now);
      }
    } finally {
      db.close();
    }

    return NextResponse.json({ status: newStatus, detail });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
