import { canonicalJid } from "@/lib/lid";
import { listChats } from "@/lib/whatsapp";

/**
 * Última interacción REAL por chat, indexada por jid canónico (unión
 * archivo+store vía listChats, que ya cachea 30s). La comparten
 * /api/contacts y /api/tasks: si hay chat, manda el chat, porque el campo
 * lastInteractionAt del CRM lo pisan acciones internas.
 */
export function lastChatTimes(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    for (const ch of listChats({ limit: 2000, includeArchived: true })) {
      if (ch.isGroup || !ch.lastMessageTime) continue;
      const k = canonicalJid(ch.jid);
      const prev = map.get(k);
      if (!prev || ch.lastMessageTime > prev) map.set(k, ch.lastMessageTime);
    }
  } catch { /* sin store del bridge (dev/CI): mapa vacío */ }
  return map;
}
