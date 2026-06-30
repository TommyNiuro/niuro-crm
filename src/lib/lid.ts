/**
 * lid.ts — Resolución de autores de grupo a teléfono real.
 *
 * En wa_messages.sender conviven 3 formatos:
 *   1. Teléfono directo: "56900000000" (8-13 dígitos)
 *   2. Formato viejo "teléfono-timestamp": "56900000000-1583120372"
 *   3. LID de WhatsApp: 14-15 dígitos ("277055539273821") — se resuelve con
 *      whatsmeow_lid_map del bridge (52k+ entradas)
 *   4. ID de comunidad/canal: "1203633…" (18 dígitos) — irresoluble, WhatsApp
 *      no expone al autor.
 *
 * Server-only (better-sqlite3). Lo usan la API resolve-sender, scan-groups y
 * el backfill de group_opportunities.
 */
import Database from "better-sqlite3";

const BRIDGE_WA_DB =
  process.env.WHATSAPP_STORE_DB_PATH ||
  "./data/whatsapp/whatsapp.db";

let lidDb: Database.Database | null = null;
function getLidDb(): Database.Database | null {
  if (lidDb) return lidDb;
  try {
    lidDb = new Database(BRIDGE_WA_DB, { readonly: true, timeout: 5000 });
    return lidDb;
  } catch {
    return null; // bridge no disponible: degradar sin romper
  }
}

const PHONE_RE = /^\d{8,13}$/;

/** Teléfono real del sender, o null si WhatsApp no lo expone. */
export function resolveSenderPhone(sender: string | null | undefined): string | null {
  if (!sender) return null;
  const raw = sender.replace(/@(lid|s\.whatsapp\.net)$/, "");

  // Formato viejo "teléfono-timestamp"
  if (raw.includes("-")) {
    const head = raw.split("-")[0];
    return PHONE_RE.test(head) ? head : null;
  }
  // Teléfono directo
  if (PHONE_RE.test(raw)) return raw;
  // LID → mapeo del bridge
  if (/^\d{14,16}$/.test(raw)) {
    const db = getLidDb();
    if (!db) return null;
    try {
      const row = db.prepare("SELECT pn FROM whatsmeow_lid_map WHERE lid = ?").get(raw) as
        { pn: string } | undefined;
      if (row?.pn && PHONE_RE.test(row.pn)) return row.pn;
    } catch { /* tabla ausente o lock: degradar */ }
  }
  // IDs de comunidad (18 dígitos) y cualquier otra cosa: irresoluble
  return null;
}
