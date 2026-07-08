import { canonicalJid } from "@/lib/lid";
import { rawDb } from "@/db";

/**
 * Última interacción REAL por chat, indexada por jid canónico. Lee wa_chats DIRECTO
 * (columnas jid/is_group/last_message_time, sobre el índice idx_wa_chats_time) en
 * vez de listChats(), que hace enriquecimiento pesado y tardaba ~4.7s en frío y
 * dominaba la latencia de /api/contacts y /api/tasks. Cache 30s: estos datos solo
 * cambian con el sync de WhatsApp. La comparten /api/contacts y /api/tasks.
 */
let _cache: { at: number; map: Map<string, string> } | null = null;

export function lastChatTimes(): Map<string, string> {
  const now = Date.now();
  if (_cache && now - _cache.at < 30_000) return _cache.map;
  const map = new Map<string, string>();
  try {
    const rows = rawDb
      .prepare(
        "SELECT jid, last_message_time FROM wa_chats WHERE is_group = 0 AND last_message_time IS NOT NULL"
      )
      .all() as { jid: string; last_message_time: string | null }[];
    for (const r of rows) {
      if (!r.last_message_time) continue;
      const k = canonicalJid(r.jid);
      const prev = map.get(k);
      if (!prev || r.last_message_time > prev) map.set(k, r.last_message_time);
    }
  } catch {
    /* sin tabla wa_chats (dev/CI): mapa vacío */
  }
  _cache = { at: now, map };
  return map;
}
