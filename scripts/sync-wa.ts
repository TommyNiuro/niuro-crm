/**
 * sync-wa.ts — Sincroniza mensajes y chats del bridge WhatsApp a crm.db.
 *
 * Modo FULL (primera vez):  npx tsx scripts/sync-wa.ts
 * Modo INCR (incremental):  npx tsx scripts/sync-wa.ts --incr
 *
 * Normaliza JIDs @lid → @s.whatsapp.net usando el mapeo en whatsapp.db.
 * Usa SQLite ATTACH para copiar en bulk en una sola transacción.
 */

import { openDb } from "../src/lib/db-open";
import fs from "fs";
import { execFileSync } from "child_process";
import { dbPath } from "../src/lib/paths";
import { readSettings } from "../src/lib/settings";

// dbPath() resuelve CRM_DB_PATH > CRM_DATA_DIR/crm.db > cwd/data/crm.db (antes
// esto era fijo a cwd/data/crm.db, rompia en la .app empaquetada donde el cwd
// no es escribible ni es donde vive la DB real).
const CRM_DB = dbPath();
const waSettings = readSettings(["whatsapp_db_path", "whatsapp_store_db_path"]);
const BRIDGE_DB =
  waSettings.whatsapp_db_path || process.env.WHATSAPP_DB_PATH || "./data/whatsapp/messages.db";
const WHATSAPP_DB =
  waSettings.whatsapp_store_db_path || process.env.WHATSAPP_STORE_DB_PATH || "./data/whatsapp/whatsapp.db";
const SINCE = process.env.WHATSAPP_SINCE || "2024-12-01";
const INCR = process.argv.includes("--incr");

// Lock cross-process: dos triggers de launchd pueden solaparse y pelear por el
// write-lock de SQLite. Tomamos un lockfile exclusivo con el PID adentro. Si el
// lockfile existe pero su proceso ya murió (corrida anterior que crasheó sin
// limpiar), lo reclamamos; si el proceso sigue vivo, salimos temprano.
const LOCK_PATH = "/tmp/niuro-sync.lock";

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // señal 0: no mata, solo testea existencia/permiso
    return true;
  } catch (e) {
    // ESRCH = no existe el proceso (lock obsoleto). EPERM = existe pero de otro
    // dueño: lo tratamos como vivo por las dudas.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

// Devuelve un fd si adquirió el lock, o null si ya hay un sync vivo en curso.
function acquireLock(): number | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(LOCK_PATH, "wx"); // falla si ya existe
      fs.writeSync(fd, String(process.pid));
      return fd;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      // Ya existe: ver si el dueño sigue vivo.
      let owner = NaN;
      try {
        owner = Number(fs.readFileSync(LOCK_PATH, "utf8").trim());
      } catch {
        // se borró entre medio: reintentar la creación
      }
      if (Number.isFinite(owner) && owner > 0 && processAlive(owner)) {
        return null; // sync vivo, no pisar
      }
      // Lock obsoleto: borrarlo y reintentar una vez.
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {
        // otra corrida lo reclamó primero: el reintento lo detecta
      }
    }
  }
  return null;
}

function releaseLock(fd: number | null): void {
  if (fd === null) return;
  try {
    fs.closeSync(fd);
  } catch {
    // ya cerrado
  }
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    // ya borrado
  }
}

function main() {
  if (!fs.existsSync(BRIDGE_DB)) {
    console.error(`Bridge DB no encontrada: ${BRIDGE_DB}`);
    process.exit(1);
  }
  if (!fs.existsSync(CRM_DB)) {
    console.error(`CRM DB no encontrada: ${CRM_DB}`);
    process.exit(1);
  }

  const lockFd = acquireLock();
  if (lockFd === null) {
    console.log("sync ya en curso (lock activo) — salgo sin hacer nada");
    return;
  }

  try {
    runSync();
  } finally {
    releaseLock(lockFd);
  }
}

function runSync() {
  const crm = openDb(CRM_DB);
  crm.pragma("journal_mode = WAL");
  crm.pragma("synchronous = NORMAL");
  crm.pragma("busy_timeout = 10000");

  crm.exec(`
    CREATE TABLE IF NOT EXISTS wa_chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      is_group INTEGER NOT NULL DEFAULT 0,
      last_message_time TEXT,
      message_count INTEGER DEFAULT 0,
      synced_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS wa_messages (
      id TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      sender TEXT,
      content TEXT,
      timestamp TEXT NOT NULL,
      is_from_me INTEGER NOT NULL DEFAULT 0,
      media_type TEXT,
      PRIMARY KEY (id, chat_jid)
    );
    CREATE INDEX IF NOT EXISTS idx_wa_messages_chat_ts ON wa_messages(chat_jid, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_wa_chats_time ON wa_chats(last_message_time DESC);
  `);

  // Watermark por rowid del bridge (auditoría 2026-06-09): los inserts nuevos en el
  // bridge siempre tienen rowid mayor, AUNQUE su timestamp sea antiguo (backfill).
  // El watermark por fecha anterior descartaba para siempre el historial backfilled.
  let syncSince = SINCE;
  let lastRowid: number | null = null;
  if (INCR) {
    const rowidRow = crm
      .prepare("SELECT value FROM crm_settings WHERE key = 'wa_last_rowid'")
      .get() as { value: string } | undefined;
    if (rowidRow?.value && /^\d+$/.test(rowidRow.value)) {
      lastRowid = Number(rowidRow.value);
      console.log(`Modo incremental desde rowid ${lastRowid} del bridge`);
    } else {
      // Primera corrida tras el cambio de watermark: usar la fecha como antes
      const row = crm
        .prepare("SELECT value FROM crm_settings WHERE key = 'wa_last_sync'")
        .get() as { value: string } | undefined;
      if (row?.value) {
        syncSince = row.value;
        console.log(`Modo incremental desde: ${syncSince} (migrando a watermark por rowid)`);
      } else {
        console.log("Sin sync previo — haciendo full sync...");
      }
    }
  }

  const beforeMsgs = (crm.prepare("SELECT COUNT(*) AS c FROM wa_messages").get() as { c: number }).c;
  const beforeChats = (crm.prepare("SELECT COUNT(*) AS c FROM wa_chats").get() as { c: number }).c;

  // NOTA (auditoría 2026-06-09): idealmente el bridge se attachearía read-only
  // (`file:...?mode=ro`), pero better-sqlite3 compila sin SQLITE_USE_URI y trata
  // la URI como nombre literal. Mitigación: este script solo ejecuta SELECT
  // sobre bridge.* / wastore.* — nunca escribir en esas DBs.
  crm.exec(`ATTACH DATABASE '${BRIDGE_DB}' AS bridge KEY ''`);
  if (fs.existsSync(WHATSAPP_DB)) {
    crm.exec(`ATTACH DATABASE '${WHATSAPP_DB}' AS wastore KEY ''`);
  }

  try {
    const t0 = Date.now();
    let newMsgs = 0;
    let newChats = 0;
    let normalizedLid = 0;

    // Cada paso corre como statement independiente (auto-commit): el write-lock
    // más largo pasa de 60-85s (transacción paraguas) al statement individual.
    // INSERT OR IGNORE / UPSERT hacen el sync idempotente, no se necesita atomicidad
    // entre pasos (auditoría 2026-06-09).

    // 1. Sincronizar chats — los @lid se mapean a su JID @s.whatsapp.net cuando hay mapeo.
    //    UPSERT en vez de INSERT OR REPLACE: preserva message_count (antes lo reseteaba a 0).
    //    Incremental: solo chats con actividad en los últimos 7 días (44k upserts cada
    //    30min eran ~15s de lock innecesario); el full sync cubre el resto.
    const chatSince = lastRowid !== null
      ? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 19).replace("T", " ")
      : SINCE;
    //    Enriquecimiento de nombres (2026-06-10): si el chat no tiene nombre (o el
    //    "nombre" es el puro número), se toma de whatsmeow_contacts: nombre guardado
    //    (full_name) → push name (el que la persona se puso) → nombre de negocio.
    //    Y el UPDATE preserva un nombre existente si el nuevo viene vacío.
    const chatResult = crm.prepare(`
        INSERT INTO wa_chats (jid, name, is_group, last_message_time, synced_at)
        SELECT
          r.resolved_jid,
          CASE
            WHEN r.name IS NOT NULL AND r.name != ''
                 AND r.name != REPLACE(r.resolved_jid, '@s.whatsapp.net', '')
              THEN r.name
            ELSE COALESCE(
              NULLIF(wc.full_name, ''), NULLIF(wc.push_name, ''),
              NULLIF(wc.business_name, ''))
          END,
          r.is_group,
          r.last_message_time,
          strftime('%s', 'now') * 1000
        FROM (
          SELECT
            CASE
              WHEN c.jid LIKE '%@lid' AND lm.pn IS NOT NULL
                THEN lm.pn || '@s.whatsapp.net'
              ELSE c.jid
            END AS resolved_jid,
            c.name,
            CASE WHEN c.jid LIKE '%@g.us' OR (c.jid LIKE '%-%@lid') THEN 1 ELSE 0 END AS is_group,
            c.last_message_time
          FROM bridge.chats c
          LEFT JOIN wastore.whatsmeow_lid_map lm
            ON c.jid LIKE '%@lid' AND REPLACE(c.jid, '@lid', '') = lm.lid
          WHERE datetime(c.last_message_time) >= datetime(:since)
        ) r
        LEFT JOIN wastore.whatsmeow_contacts wc ON wc.their_jid = r.resolved_jid
        ON CONFLICT(jid) DO UPDATE SET
          name = COALESCE(NULLIF(excluded.name, ''), wa_chats.name),
          is_group = excluded.is_group,
          last_message_time = excluded.last_message_time,
          synced_at = excluded.synced_at
      `).run({ since: chatSince });
    newChats = chatResult.changes;

    // Capturar el rowid máximo del bridge ANTES de copiar: lo que entre al bridge
    // durante el sync queda por encima y se toma en la próxima corrida (OR IGNORE dedupe).
    const bridgeMax = (crm.prepare("SELECT MAX(rowid) AS r FROM bridge.messages").get() as { r: number | null }).r;
    // rowid local previo: para recalcular message_count solo de los chats que reciban mensajes
    const crmPrevMax = (crm.prepare("SELECT COALESCE(MAX(rowid), 0) AS r FROM wa_messages").get() as { r: number }).r;

    // 2. Sincronizar mensajes — normalizar chat_jid @lid → @s.whatsapp.net
    const msgFilter = lastRowid !== null
      ? "m.rowid > :lastRowid"
      : "datetime(m.timestamp) >= datetime(:since)";
    const msgParams = lastRowid !== null ? { lastRowid } : { since: syncSince };
    const msgResult = crm.prepare(`
        INSERT INTO wa_messages (id, chat_jid, sender, content, timestamp, is_from_me, media_type)
        SELECT
          m.id,
          CASE
            WHEN m.chat_jid LIKE '%@lid' AND lm.pn IS NOT NULL
              THEN lm.pn || '@s.whatsapp.net'
            ELSE m.chat_jid
          END AS resolved_jid,
          CASE
            WHEN m.sender LIKE '%@lid' AND slm.pn IS NOT NULL
              THEN slm.pn
            ELSE m.sender
          END AS resolved_sender,
          m.content,
          m.timestamp,
          m.is_from_me,
          m.media_type
        FROM bridge.messages m
        LEFT JOIN wastore.whatsmeow_lid_map lm
          ON m.chat_jid LIKE '%@lid' AND REPLACE(m.chat_jid, '@lid', '') = lm.lid
        LEFT JOIN wastore.whatsmeow_lid_map slm
          ON m.sender LIKE '%@lid' AND REPLACE(m.sender, '@lid', '') = slm.lid
        WHERE ${msgFilter}
        ON CONFLICT(id, chat_jid) DO UPDATE SET
          content = excluded.content,
          media_type = excluded.media_type,
          sender = excluded.sender
      `).run(msgParams);
    newMsgs = msgResult.changes;

    // Contar mensajes @lid que fueron normalizados (solo estadística, fuera de todo lock)
    const lidCount = crm.prepare(`
        SELECT COUNT(*) AS c FROM (
          SELECT m.id FROM bridge.messages m
          INNER JOIN wastore.whatsmeow_lid_map lm
            ON m.chat_jid LIKE '%@lid' AND REPLACE(m.chat_jid, '@lid', '') = lm.lid
          WHERE ${msgFilter}
        )
      `).get(msgParams) as { c: number };
    normalizedLid = lidCount.c;

    // 3. Recalcular message_count. Antes filtraba con una comparación de strings
    // en formatos mixtos que dejó 93+ chats clavados en 0 (auditoría 2026-06-09).
    // Incremental: solo los chats que recibieron mensajes en esta corrida (por rowid).
    // Full: todos los chats (autorreparación completa).
    if (lastRowid !== null) {
      crm.prepare(`
        UPDATE wa_chats
        SET message_count = (
          SELECT COUNT(*) FROM wa_messages wm WHERE wm.chat_jid = wa_chats.jid
        )
        WHERE jid IN (SELECT DISTINCT chat_jid FROM wa_messages WHERE rowid > :prev)
      `).run({ prev: crmPrevMax });
    } else {
      crm.prepare(`
        UPDATE wa_chats
        SET message_count = (
          SELECT COUNT(*) FROM wa_messages wm WHERE wm.chat_jid = wa_chats.jid
        )
      `).run();
    }

    // 4. Importar nombres reales desde whatsmeow_contacts (full_name > push_name)
    if (fs.existsSync(WHATSAPP_DB)) {
      crm.prepare(`
          UPDATE wa_chats
          SET name = (
            SELECT COALESCE(NULLIF(TRIM(wc.full_name), ''), NULLIF(TRIM(wc.push_name), ''))
            FROM wastore.whatsmeow_contacts wc
            WHERE wc.their_jid = wa_chats.jid
              AND COALESCE(NULLIF(TRIM(wc.full_name), ''), NULLIF(TRIM(wc.push_name), '')) IS NOT NULL
            LIMIT 1
          )
          WHERE jid LIKE '%@s.whatsapp.net' AND is_group = 0
            AND datetime(last_message_time) >= datetime(:chatSince)
            AND EXISTS (
              SELECT 1 FROM wastore.whatsmeow_contacts wc2
              WHERE wc2.their_jid = wa_chats.jid
                AND COALESCE(NULLIF(TRIM(wc2.full_name), ''), NULLIF(TRIM(wc2.push_name), '')) IS NOT NULL
            )
        `).run({ chatSince });
    }

    // Guardar watermarks: wa_last_rowid gobierna el incremental; wa_last_sync
    // queda informativo (hora de la última corrida exitosa).
    if (bridgeMax !== null) {
      crm.prepare(
        "INSERT OR REPLACE INTO crm_settings (key, value) VALUES ('wa_last_rowid', ?)"
      ).run(String(bridgeMax));
    }
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    crm.prepare(
      "INSERT OR REPLACE INTO crm_settings (key, value) VALUES ('wa_last_sync', ?)"
    ).run(now);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const afterMsgs = (crm.prepare("SELECT COUNT(*) AS c FROM wa_messages").get() as { c: number }).c;
    const afterChats = (crm.prepare("SELECT COUNT(*) AS c FROM wa_chats").get() as { c: number }).c;

    console.log(`\n✓ Sync completado en ${elapsed}s`);
    console.log(`  Chats:    ${beforeChats} → ${afterChats} (+${newChats})`);
    console.log(`  Mensajes: ${beforeMsgs} → ${afterMsgs} (+${newMsgs})`);
    if (normalizedLid > 0) {
      console.log(`  @lid normalizados: ${normalizedLid} mensajes mapeados a @s.whatsapp.net`);
    }
    console.log(`  Último sync guardado: ${now}`);

  } finally {
    try { crm.exec("DETACH DATABASE bridge"); } catch {}
    try { crm.exec("DETACH DATABASE wastore"); } catch {}
    crm.close();
  }
}

try {
  main();
} catch (err) {
  // Fallo visible (auditoría 2026-06-09): log + notificación macOS. Los watermarks
  // solo se actualizan al final de una corrida exitosa, así que la próxima reintenta.
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[sync-wa] ERROR: ${msg}`);
  try {
    execFileSync("/usr/bin/osascript", [
      "-e",
      `display notification ${JSON.stringify(msg.slice(0, 120))} with title "Niuro CRM: sync WhatsApp FALLÓ"`,
    ]);
  } catch {
    // sin entorno gráfico (ej. SSH): el log basta
  }
  process.exit(1);
}
