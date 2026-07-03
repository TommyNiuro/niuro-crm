import { NextResponse } from "next/server";
import crypto from "crypto";
import { getStatus } from "@/lib/whatsapp";
import { dbPath } from "@/lib/paths";
import { openDb } from "@/lib/db-open";
import { readSettings } from "@/lib/settings";

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

    const db = openDb(dbPath(), { timeout: 15000 });
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
      // Mantenimiento del radar de leads (mismo tick, cero cron extra):
      // 1) Decay: un candidato pending sin actividad en 30 dias ya se enfrio;
      //    auto-dismiss para que el radar muestre senal y no un backlog eterno.
      //    Si el contacto revive, el scoring lo vuelve a generar.
      // (columnas Drizzle mode:"timestamp" = unix SEGUNDOS, no ms)
      const nowSec = Math.floor(now / 1000);
      const decayDays = Math.max(1, Number(readSettings(["radar_decay_days"]).radar_decay_days) || 30);
      const cutoffSec = nowSec - decayDays * 86400;
      const decayed = db
        .prepare(
          `UPDATE lead_candidates SET status = 'dismissed', updated_at = ?
           WHERE status = 'pending' AND COALESCE(last_message_at, created_at) < ?`
        )
        .run(nowSec, cutoffSec).changes;
      // 2) Recalibrar temperatura por percentil del batch pendiente: con umbral
      //    fijo todo termina "Caliente" y el ranking no discrimina. Top 10% =
      //    hot (con piso de score 60), 60-90% = warm, resto cold.
      db.prepare(
        `WITH ranked AS (
           SELECT id, PERCENT_RANK() OVER (ORDER BY score) AS pr
           FROM lead_candidates WHERE status = 'pending'
         )
         UPDATE lead_candidates SET temperature = CASE
             WHEN (SELECT pr FROM ranked WHERE ranked.id = lead_candidates.id) >= 0.9
                  AND score >= 60 THEN 'hot'
             WHEN (SELECT pr FROM ranked WHERE ranked.id = lead_candidates.id) >= 0.6 THEN 'warm'
             ELSE 'cold'
           END
         WHERE status = 'pending'`
      ).run();

      return NextResponse.json({ status: newStatus, detail, decayed });
    } finally {
      db.close();
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
