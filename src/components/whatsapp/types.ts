export interface WaChat {
  jid: string;
  name: string | null;
  isGroup: boolean;
  lastMessageTime: string | null;
  lastMessage: string | null;
  lastMediaType: string | null;
  lastIsFromMe: boolean;
  /** Teléfono canónico (jid @lid resuelto vía lid map del bridge). */
  phone?: string | null;
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

export interface WaStatus {
  dbExists: boolean;
  chatCount: number;
  messageCount: number;
  bridgeUp: boolean;
  dbPath: string;
}

/** "5215512345678@s.whatsapp.net" -> "5215512345678" (digits only). */
export function jidToPhone(jid: string): string {
  const local = jid.split("@")[0];
  return local.replace(/[^0-9]/g, "");
}

export function chatDisplayName(chat: { name: string | null; jid: string; isGroup: boolean }): string {
  if (chat.name) return chat.name;
  if (chat.isGroup) return "Grupo sin nombre";
  const phone = jidToPhone(chat.jid);
  return phone ? `+${phone}` : chat.jid;
}

const MEDIA_LABELS: Record<string, string> = {
  image: "Imagen",
  video: "Video",
  audio: "Nota de voz",
  document: "Documento",
  sticker: "Sticker",
  gif: "GIF",
};

export function previewText(content: string | null, mediaType: string | null): string {
  if (content && content.trim()) return content;
  if (mediaType) return MEDIA_LABELS[mediaType] || mediaType;
  return "";
}

export function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
}
