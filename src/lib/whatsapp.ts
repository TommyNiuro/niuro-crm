/**
 * WhatsApp integration for Niuro CRM.
 *
 * Reads the WhatsApp message history directly from the Go bridge's SQLite
 * database (read-only) and sends messages by proxying to the bridge's local
 * HTTP API. The bridge (whatsapp-mcp / whatsmeow) must be running for sending
 * to work; reading works as long as the database file exists.
 *
 * Configure via env (optional — sensible defaults below):
 *   WHATSAPP_DB_PATH       absolute path to whatsapp-bridge/store/messages.db
 *   WHATSAPP_BRIDGE_URL    base URL of the Go bridge (default http://localhost:$BRIDGE_PORT u 8790)
 */
import Database from "better-sqlite3";
import fs from "fs";
import { readSettings } from "./settings";
import { dbPath } from "./paths";
import { openDb } from "./db-open";
import { canonicalJid, equivalentJids } from "./lid";

const DEFAULT_DB_PATH = "./data/whatsapp/messages.db";
// Mismo default que bridge-manager.ts: sin esto, el health check pre-pairing
// apuntaba al 8080 (puerto que usan mil servicios) y podia reportar
// bridgeUp=true por un bridge ajeno.
const DEFAULT_BRIDGE_URL = `http://localhost:${process.env.BRIDGE_PORT || "8790"}`;

function openCrm(): Database.Database {
  // crm.db (fuente principal después del sync), resuelto en @/lib/paths.
  const db = openDb(dbPath(), { readonly: true, fileMustExist: true, timeout: 3000 });
  db.pragma("busy_timeout = 3000");
  return db;
}

/** true si ya se hizo al menos un sync de WA a crm.db.
 * Cacheado: una vez sincronizado nunca vuelve a false, y antes esto abría y
 * cerraba la DB en CADA listChats/getMessages (auditoría 2026-06-09). */
let _syncedOnce = false;
function isSynced(): boolean {
  if (_syncedOnce) return true;
  try {
    const db = openCrm();
    try {
      const row = db.prepare("SELECT value FROM crm_settings WHERE key = 'wa_last_sync'").get() as { value: string } | undefined;
      if (row?.value) _syncedOnce = true;
      return _syncedOnce;
    } finally { db.close(); }
  } catch { return false; }
}

export function getDbPath(): string {
  // Prioridad: crm_settings (onboarding) > env > default. Sin esto, la .app
  // empaquetada (que no comparte cwd con el bridge externo) no tenía forma de
  // apuntar a la DB real del bridge salvo hardcodeando el path en el launcher.
  const fromDb = readSettings(["whatsapp_db_path"]).whatsapp_db_path;
  return fromDb || process.env.WHATSAPP_DB_PATH || DEFAULT_DB_PATH;
}

export function getBridgeUrl(): string {
  // Prioridad: crm_settings (onboarding) > env > default.
  const fromDb = readSettings(["whatsapp_bridge_url"]).whatsapp_bridge_url;
  const url = fromDb || process.env.WHATSAPP_BRIDGE_URL || DEFAULT_BRIDGE_URL;
  return url.replace(/\/$/, "");
}

/**
 * Earliest date the CRM will consider WhatsApp data (inbox + lead capture).
 * Format YYYY-MM-DD. Stored timestamps look like "2026-01-21 09:34:01-06:00",
 * so a lexicographic ">=" comparison against the date prefix is correct.
 * Override with WHATSAPP_SINCE; default 2026-01-01.
 */
export function getSince(): string {
  const v = (process.env.WHATSAPP_SINCE || "2024-12-01").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "2024-12-01";
}

export function dbExists(): boolean {
  try {
    return fs.existsSync(getDbPath());
  } catch {
    return false;
  }
}

function open(write = false): Database.Database {
  const db = new Database(getDbPath(), {
    readonly: !write,
    fileMustExist: true,
    timeout: 5000,
  });
  try {
    db.pragma("busy_timeout = 5000");
    db.pragma("journal_mode = WAL");
  } catch { /* ignore */ }
  return db;
}

/** Crea índice una vez — acelera listChats de ~29s a <1s. */
function ensureIndexes(): void {
  if (_indexEnsured) return;
  try {
    const db = open(true);
    try {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_jid, timestamp DESC);"
      );
    } finally {
      db.close();
    }
    _indexEnsured = true;
  } catch { /* si falla (e.g. DB locked), se reintenta la próxima vez */ }
}
let _indexEnsured = false;

/** Normalize "2026-06-03 12:36:44-06:00" -> ISO "2026-06-03T12:36:44-06:00". */
function toISO(ts: string | null | undefined): string | null {
  if (!ts) return null;
  return ts.includes("T") ? ts : ts.replace(" ", "T");
}

export interface WaChat {
  jid: string;
  name: string | null;
  isGroup: boolean;
  lastMessageTime: string | null;
  lastMessage: string | null;
  lastMediaType: string | null;
  lastIsFromMe: boolean;
  /** Teléfono canónico (jid @lid resuelto vía lid map). null si no se pudo resolver. */
  phone: string | null;
}

export interface WaMessage {
  id: string;
  sender: string | null;
  content: string | null;
  mediaType: string | null;
  filename: string | null;
  timestamp: string | null;
  isFromMe: boolean;
}

interface ChatRow {
  jid: string;
  name: string | null;
  lastMessageTime: string | null;
  lastMessage: string | null;
  lastMediaType: string | null;
  lastIsFromMe: number | null;
}

// Cache en memoria: evita tocar SQLite en cada recarga del inbox.
const _chatCache = new Map<string, { ts: number; data: WaChat[] }>();
const CACHE_TTL_MS = 30_000; // 30 segundos

/** Invalida el cache para que el proximo listChats recargue (e.g. tras archivar). */
export function invalidateChatCache() {
  _chatCache.clear();
}

export function listChats(opts: { query?: string; limit?: number; includeArchived?: boolean } = {}): WaChat[] {
  const limit = Math.min(opts.limit ?? 1000, 5000);
  const query = opts.query?.trim() ?? "";
  const includeArchived = !!opts.includeArchived;
  const cacheKey = `${limit}:${query}:${includeArchived ? 1 : 0}`;

  if (!query) {
    const cached = _chatCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;
  }

  const since = getSince();

  // UNIÓN de las dos fuentes. Antes era una U otra (el archivo de crm.db si
  // hubo sync; si no, el store del bridge), y como el archivo solo se actualiza
  // al correr sync-wa, el inbox quedaba CONGELADO en el último sync aunque el
  // bridge recibiera mensajes en vivo. Además WhatsApp migró a LIDs: el store
  // identifica los chats por @lid y el archivo por teléfono, así que la misma
  // persona existía dos veces sin verse. Se fusiona por jid canónico
  // (lid -> teléfono vía whatsmeow_lid_map, ver lid.ts).
  const fromArchive: WaChat[] = [];
  const fromStore: WaChat[] = [];

  if (isSynced()) {
    const db = openCrm();
    try {
      const whereFilter = query
        ? "AND (LOWER(c.name) LIKE LOWER(:q) OR c.jid LIKE :q)"
        : "";
      const sql = `
        WITH top AS (
          SELECT jid, name, is_group, last_message_time
          FROM wa_chats c
          WHERE c.jid NOT LIKE '%@broadcast'
            AND c.last_message_time >= :since
            AND c.message_count > 0
            ${whereFilter}
          ORDER BY c.last_message_time DESC
          LIMIT :limit
        ),
        latest AS (
          SELECT m.chat_jid, m.content, m.media_type, m.is_from_me,
                 ROW_NUMBER() OVER (PARTITION BY m.chat_jid ORDER BY m.timestamp DESC) AS rn
          FROM wa_messages m
          INNER JOIN top t ON m.chat_jid = t.jid
        )
        SELECT
          t.jid, t.name, t.is_group AS isGroup, t.last_message_time AS lastMessageTime,
          l.content AS lastMessage, l.media_type AS lastMediaType, l.is_from_me AS lastIsFromMe
        FROM top t
        LEFT JOIN latest l ON l.chat_jid = t.jid AND l.rn = 1
      `;
      const params: Record<string, unknown> = { limit, since };
      if (query) params.q = `%${query}%`;
      const rows = db.prepare(sql).all(params) as (ChatRow & { isGroup: number })[];
      for (const r of rows) {
        fromArchive.push({
          jid: r.jid,
          name: r.name && r.name.trim() ? r.name : null,
          isGroup: !!r.isGroup,
          lastMessageTime: toISO(r.lastMessageTime),
          lastMessage: r.lastMessage ?? null,
          lastMediaType: r.lastMediaType ?? null,
          lastIsFromMe: !!r.lastIsFromMe,
          phone: null,
        });
      }
    } finally {
      db.close();
    }
  }

  if (dbExists()) {
    ensureIndexes();
    const db = open();
    try {
      const whereFilter = query
        ? "AND (LOWER(c.name) LIKE LOWER(:q) OR c.jid LIKE :q)"
        : "";
      const sql = `
        WITH top AS (
          SELECT jid, name, last_message_time
          FROM chats c
          WHERE c.jid NOT LIKE '%@broadcast'
            AND c.last_message_time >= :since
            ${whereFilter}
          ORDER BY c.last_message_time DESC
          LIMIT :limit
        ),
        latest AS (
          SELECT m.chat_jid, m.content, m.media_type, m.is_from_me,
                 ROW_NUMBER() OVER (PARTITION BY m.chat_jid ORDER BY m.timestamp DESC) AS rn
          FROM messages m
          INNER JOIN top t ON m.chat_jid = t.jid
          WHERE m.timestamp >= :since
        )
        SELECT t.jid, t.name, t.last_message_time AS lastMessageTime,
               l.content AS lastMessage, l.media_type AS lastMediaType, l.is_from_me AS lastIsFromMe
        FROM top t
        LEFT JOIN latest l ON l.chat_jid = t.jid AND l.rn = 1
      `;
      const params: Record<string, unknown> = { limit, since };
      if (query) params.q = `%${query}%`;
      const rows = db.prepare(sql).all(params) as ChatRow[];
      for (const r of rows) {
        fromStore.push({
          jid: r.jid,
          name: r.name && r.name.trim() ? r.name : null,
          isGroup: r.jid.endsWith("@g.us") || r.jid.includes("-"),
          lastMessageTime: toISO(r.lastMessageTime),
          lastMessage: r.lastMessage ?? null,
          lastMediaType: r.lastMediaType ?? null,
          lastIsFromMe: !!r.lastIsFromMe,
          phone: null,
        });
      }
    } finally {
      db.close();
    }
  }

  // Chats archivados ("no es de ventas"): set canónico, para que el descarte
  // hecho sobre el jid viejo (teléfono) también oculte el chat nuevo (@lid).
  // EXCEPCIÓN: si el chat pertenece a un contacto del CRM (ingeniero, cliente
  // o lead), NO se oculta. Marcar "Es un ingeniero" descarta el candidate de
  // venta, pero la conversación con esa persona tiene que seguir visible.
  const dismissed = new Set<string>();
  if (!includeArchived) {
    try {
      const db = openCrm();
      try {
        const contactJids = new Set<string>();
        try {
          const cs = db
            .prepare("SELECT whatsapp_jid FROM contacts WHERE whatsapp_jid IS NOT NULL AND deleted_at IS NULL")
            .all() as { whatsapp_jid: string }[];
          for (const c of cs) contactJids.add(canonicalJid(c.whatsapp_jid));
        } catch {
          // esquema viejo sin deleted_at: sin excepción de contactos
        }
        const rows = db
          .prepare("SELECT chat_jid FROM lead_candidates WHERE status = 'dismissed'")
          .all() as { chat_jid: string }[];
        for (const r of rows) {
          const canon = canonicalJid(r.chat_jid);
          if (!contactJids.has(canon)) dismissed.add(canon);
        }
      } finally {
        db.close();
      }
    } catch {
      // sin crm.db: no hay archivados
    }
  }

  // Merge: el archivo entra primero; el store pisa el preview donde es más
  // nuevo y su jid gana SIEMPRE (es el accionable para leer lo vivo y enviar).
  const merged = new Map<string, WaChat>();
  for (const r of fromArchive) {
    const canon = canonicalJid(r.jid);
    if (dismissed.has(canon)) continue;
    merged.set(canon, r);
  }
  for (const r of fromStore) {
    const canon = canonicalJid(r.jid);
    if (dismissed.has(canon)) continue;
    const prev = merged.get(canon);
    if (!prev) {
      merged.set(canon, r);
      continue;
    }
    const newer = (r.lastMessageTime ?? "") >= (prev.lastMessageTime ?? "");
    merged.set(canon, {
      jid: r.jid,
      name: prev.name && /[a-zA-Z]/.test(prev.name) ? prev.name : r.name || prev.name,
      isGroup: prev.isGroup || r.isGroup,
      lastMessageTime: newer ? r.lastMessageTime : prev.lastMessageTime,
      lastMessage: newer ? r.lastMessage : prev.lastMessage,
      lastMediaType: newer ? r.lastMediaType : prev.lastMediaType,
      lastIsFromMe: newer ? r.lastIsFromMe : prev.lastIsFromMe,
      phone: null,
    });
  }

  const result: WaChat[] = Array.from(merged.entries())
    .map(([canon, r]) => ({
      ...r,
      phone: canon.endsWith("@s.whatsapp.net") ? canon.split("@")[0] : null,
    }))
    .sort((a, b) => (b.lastMessageTime ?? "").localeCompare(a.lastMessageTime ?? ""))
    .slice(0, limit);

  if (!query) _chatCache.set(cacheKey, { ts: Date.now(), data: result });
  return result;
}

interface MessageRow {
  id: string;
  sender: string | null;
  content: string | null;
  media_type: string | null;
  filename: string | null;
  timestamp: string | null;
  is_from_me: number | null;
}

export function getMessages(opts: { chatJid: string; limit?: number }): WaMessage[] {
  const limit = Math.min(opts.limit ?? 80, 500);
  const since = getSince();

  // Historial UNIFICADO: la misma conversación vive con jid @lid en el store
  // del bridge y con jid-teléfono en el archivo de crm.db (migración a LIDs de
  // WhatsApp). Se leen AMBAS fuentes con TODOS los jids equivalentes del chat y
  // se deduplica por id de mensaje: al abrir cualquier chat se ve el historial
  // completo más lo vivo, sin importar bajo qué identidad quedó guardado.
  const jids = equivalentJids(opts.chatJid);
  const collected = new Map<string, WaMessage>();

  if (isSynced()) {
    const db = openCrm();
    try {
      const stmt = db.prepare(
        `SELECT id, sender, content, media_type, NULL as filename, timestamp, is_from_me
         FROM wa_messages WHERE chat_jid = ? AND timestamp >= ?
         ORDER BY timestamp DESC LIMIT ?`
      );
      for (const jid of jids) {
        for (const r of stmt.all(jid, since, limit) as MessageRow[]) {
          collected.set(r.id, {
            id: r.id,
            sender: r.sender ?? null,
            content: r.content ?? null,
            mediaType: r.media_type ?? null,
            filename: null,
            timestamp: toISO(r.timestamp),
            isFromMe: !!r.is_from_me,
          });
        }
      }
    } finally {
      db.close();
    }
  }

  if (dbExists()) {
    const db = open();
    try {
      const stmt = db.prepare(
        `SELECT id, sender, content, media_type, filename, timestamp, is_from_me
         FROM messages WHERE chat_jid = ? AND timestamp >= ? ORDER BY timestamp DESC LIMIT ?`
      );
      for (const jid of jids) {
        for (const r of stmt.all(jid, since, limit) as MessageRow[]) {
          collected.set(r.id, {
            id: r.id,
            sender: r.sender ?? null,
            content: r.content ?? null,
            mediaType: r.media_type ?? null,
            filename: r.filename ?? null,
            timestamp: toISO(r.timestamp),
            isFromMe: !!r.is_from_me,
          });
        }
      }
    } finally {
      db.close();
    }
  }

  return Array.from(collected.values())
    .sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""))
    .slice(-limit);
}

export interface SendResult {
  success: boolean;
  message: string;
}

export async function sendMessage(recipient: string, message: string): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${getBridgeUrl()}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient, message }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Partial<SendResult>;
    return {
      success: data.success ?? res.ok,
      message: data.message ?? (res.ok ? "Enviado" : `Error HTTP ${res.status}`),
    };
  } catch (err) {
    return {
      success: false,
      message:
        err instanceof Error && err.name === "AbortError"
          ? "El puente de WhatsApp no respondio (timeout). Verifica que la ventana de Conectar WhatsApp este abierta."
          : "No se pudo conectar con el puente de WhatsApp. Abre la ventana de Conectar WhatsApp.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface WaStatus {
  dbExists: boolean;
  chatCount: number;
  messageCount: number;
  bridgeUp: boolean;
  dbPath: string;
}

// Cache de counts (auditoría 2026-06-09: COUNT(*) sobre 436k filas en cada llamada)
let _countsCache: { chats: number; msgs: number; at: number } | null = null;
const COUNTS_TTL_MS = 5 * 60 * 1000;

export async function getStatus(): Promise<WaStatus> {
  let chatCount = 0;
  let messageCount = 0;
  const exists = dbExists();
  if (exists && _countsCache && Date.now() - _countsCache.at < COUNTS_TTL_MS) {
    chatCount = _countsCache.chats;
    messageCount = _countsCache.msgs;
  } else if (exists) {
    const db = open();
    try {
      chatCount =
        (db.prepare("SELECT COUNT(*) AS c FROM chats").get() as { c: number }).c ?? 0;
      messageCount =
        (db.prepare("SELECT COUNT(*) AS c FROM messages").get() as { c: number }).c ?? 0;
      _countsCache = { chats: chatCount, msgs: messageCount, at: Date.now() };
    } catch {
      // ignore
    } finally {
      db.close();
    }
  }

  // GET on /api/send returns 405 (method not allowed) when the bridge is up.
  // El bridge puede estar saturado procesando ráfagas de mensajes (logs muestran
  // 400k+ mensajes en sync). 3 intentos con timeout 5s evita falsos negativos.
  let bridgeUp = false;
  for (let attempt = 0; attempt < 3 && !bridgeUp; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${getBridgeUrl()}/api/send`, {
        method: "GET",
        signal: controller.signal,
      });
      bridgeUp = res.status > 0;
    } catch {
      bridgeUp = false;
      // backoff corto entre reintentos
      if (attempt < 2) await new Promise((r) => setTimeout(r, 300));
    } finally {
      clearTimeout(timer);
    }
  }

  return { dbExists: exists, chatCount, messageCount, bridgeUp, dbPath: getDbPath() };
}
