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
import { readSettings } from "./settings";

function getStoreDbPath(): string {
  // Prioridad: crm_settings (onboarding) > env > default, mismo patrón que
  // getDbPath() en whatsapp.ts.
  const fromDb = readSettings(["whatsapp_store_db_path"]).whatsapp_store_db_path;
  return fromDb || process.env.WHATSAPP_STORE_DB_PATH || "./data/whatsapp/whatsapp.db";
}

let lidDb: Database.Database | null = null;
function getLidDb(): Database.Database | null {
  if (lidDb) return lidDb;
  try {
    lidDb = new Database(getStoreDbPath(), { readonly: true, timeout: 5000 });
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

// ---- Mapa completo lid <-> teléfono (unificación de identidades) ----
// WhatsApp migró a LIDs: el store nuevo identifica los chats por @lid y el
// archivo histórico (wa_chats en crm.db) por teléfono. whatsmeow_lid_map es la
// piedra Rosetta (50k+ filas). Se cachea entero en memoria con TTL corto:
// listChats/getMessages lo consultan por cada fila y un SELECT por fila sería
// carísimo.

let _maps: { at: number; lidToPn: Map<string, string>; pnToLid: Map<string, string> } | null = null;
const MAPS_TTL_MS = 10 * 60_000;

function loadMaps() {
  if (_maps && Date.now() - _maps.at < MAPS_TTL_MS) return _maps;
  const lidToPn = new Map<string, string>();
  const pnToLid = new Map<string, string>();
  const db = getLidDb();
  if (db) {
    try {
      const rows = db.prepare("SELECT lid, pn FROM whatsmeow_lid_map").all() as { lid: string; pn: string }[];
      for (const r of rows) {
        if (r.lid && r.pn) {
          lidToPn.set(r.lid, r.pn);
          pnToLid.set(r.pn, r.lid);
        }
      }
    } catch { /* tabla ausente o lock: degradar a mapas vacíos */ }
  }
  _maps = { at: Date.now(), lidToPn, pnToLid };
  return _maps;
}

/** Jid canónico de un chat: los @lid mapeados se normalizan a teléfono. */
export function canonicalJid(jid: string): string {
  const at = jid.indexOf("@");
  if (at < 0) return jid;
  const raw = jid.slice(0, at);
  if (jid.endsWith("@lid")) {
    const pn = loadMaps().lidToPn.get(raw);
    if (pn) return `${pn}@s.whatsapp.net`;
  }
  return jid;
}

/** Jids equivalentes de un chat (él mismo + su alias lid/teléfono si existe). */
export function equivalentJids(jid: string): string[] {
  const at = jid.indexOf("@");
  if (at < 0) return [jid];
  const raw = jid.slice(0, at);
  const maps = loadMaps();
  if (jid.endsWith("@lid")) {
    const pn = maps.lidToPn.get(raw);
    return pn ? [jid, `${pn}@s.whatsapp.net`] : [jid];
  }
  if (jid.endsWith("@s.whatsapp.net")) {
    const lid = maps.pnToLid.get(raw);
    return lid ? [jid, `${lid}@lid`] : [jid];
  }
  return [jid];
}
