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

  // Leer desde crm.db si ya se hizo sync (mismo proceso, mucho más rápido)
  if (isSynced()) {
    const db = openCrm();
    try {
      const whereFilter = query
        ? "AND (LOWER(c.name) LIKE LOWER(:q) OR c.jid LIKE :q)"
        : "";
      // Excluir chats archivados (lead_candidates con status='dismissed') del inbox.
      // El operador puede revertir desde /whatsapp/leads o un endpoint.
      const archivedFilter = includeArchived
        ? ""
        : `AND NOT EXISTS (
             SELECT 1 FROM lead_candidates lc
             WHERE lc.chat_jid = c.jid AND lc.status = 'dismissed'
           )`;
      const since = getSince();
      const sql = `
        WITH top AS (
          SELECT jid, name, is_group, last_message_time
          FROM wa_chats c
          WHERE c.jid NOT LIKE '%@broadcast'
            AND c.last_message_time >= :since
            AND c.message_count > 0
            ${whereFilter}
            ${archivedFilter}
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
        ORDER BY t.last_message_time DESC
      `;
      const params: Record<string, unknown> = { limit, since };
      if (query) params.q = `%${query}%`;
      const rows = db.prepare(sql).all(params) as (ChatRow & { isGroup: number })[];
      const result = rows.map((r) => ({
        jid: r.jid,
        name: r.name && r.name.trim() ? r.name : null,
        isGroup: !!r.isGroup,
        lastMessageTime: toISO(r.lastMessageTime),
        lastMessage: r.lastMessage ?? null,
        lastMediaType: r.lastMediaType ?? null,
        lastIsFromMe: !!r.lastIsFromMe,
      }));
      if (!query) _chatCache.set(cacheKey, { ts: Date.now(), data: result });
      return result;
    } finally {
      db.close();
    }
  }

  // Fallback al bridge DB si no hay sync
  ensureIndexes();
  const since = getSince();
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
      ORDER BY t.last_message_time DESC
    `;
    const params: Record<string, unknown> = { limit, since };
    if (query) params.q = `%${query}%`;
    const rows = db.prepare(sql).all(params) as ChatRow[];
    const result = rows.map((r) => ({
      jid: r.jid,
      name: r.name && r.name.trim() ? r.name : null,
      isGroup: r.jid.endsWith("@g.us") || r.jid.includes("-"),
      lastMessageTime: toISO(r.lastMessageTime),
      lastMessage: r.lastMessage ?? null,
      lastMediaType: r.lastMediaType ?? null,
      lastIsFromMe: !!r.lastIsFromMe,
    }));
    if (!query) _chatCache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
  } finally {
    db.close();
  }
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

  if (isSynced()) {
    const db = openCrm();
    try {
      const rows = db
        .prepare(
          `SELECT id, sender, content, media_type, NULL as filename, timestamp, is_from_me
           FROM wa_messages WHERE chat_jid = ? AND timestamp >= ?
           ORDER BY timestamp DESC LIMIT ?`
        )
        .all(opts.chatJid, since, limit) as MessageRow[];
      return rows.reverse().map((r) => ({
        id: r.id,
        sender: r.sender ?? null,
        content: r.content ?? null,
        mediaType: r.media_type ?? null,
        filename: null,
        timestamp: toISO(r.timestamp),
        isFromMe: !!r.is_from_me,
      }));
    } finally {
      db.close();
    }
  }

  // Fallback bridge DB
  const db = open();
  try {
    const rows = db
      .prepare(
        `SELECT id, sender, content, media_type, filename, timestamp, is_from_me
         FROM messages WHERE chat_jid = ? AND timestamp >= ? ORDER BY timestamp DESC LIMIT ?`
      )
      .all(opts.chatJid, since, limit) as MessageRow[];
    return rows.reverse().map((r) => ({
      id: r.id,
      sender: r.sender ?? null,
      content: r.content ?? null,
      mediaType: r.media_type ?? null,
      filename: r.filename ?? null,
      timestamp: toISO(r.timestamp),
      isFromMe: !!r.is_from_me,
    }));
  } finally {
    db.close();
  }
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
