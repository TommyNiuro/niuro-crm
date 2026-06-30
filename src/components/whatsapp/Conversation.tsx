"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Send,
  UserPlus,
  Users,
  MessageCircle,
  Paperclip,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Loader2,
  RotateCw,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Avatar } from "@/components/ds";
import { cn } from "@/lib/utils";

// Agrupación de mensajes por día (separadores estilo WhatsApp).
function sameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function dayLabel(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (sameDay(ts, today.toISOString())) return "Hoy";
  if (sameDay(ts, yesterday.toISOString())) return "Ayer";
  return d.toLocaleDateString("es", { day: "numeric", month: "short", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}
import {
  type WaChat,
  type WaMessage,
  chatDisplayName,
  previewText,
  formatTime,
  jidToPhone,
} from "./types";

interface QuickReply {
  id: string;
  label: string;
  text: string;
}
interface ConversationProps {
  chat: WaChat;
  messages: WaMessage[];
  loading: boolean;
  sending: boolean;
  linkedContact?: { id: string; name: string; temperature: string } | null;
  quickReplies?: QuickReply[];
  /** id de wa_messages a resaltar y scrollear (deep-link del Radar). */
  highlightId?: string | null;
  /** Borrador del Radar: en chat directo precarga el composer; en grupo viaja
   *  con el botón "Hablarle directo" hacia el 1-a-1. */
  draftText?: string | null;
  onBack: () => void;
  onRefresh: () => void;
  onSend: (text: string) => Promise<boolean>;
  onSaveLead: () => void;
}

export function Conversation({
  chat,
  messages,
  loading,
  sending,
  linkedContact,
  quickReplies = [],
  highlightId = null,
  draftText = null,
  onBack,
  onRefresh,
  onSend,
  onSaveLead,
}: ConversationProps) {
  const [text, setText] = useState("");
  const showQuick = text.startsWith("/") && quickReplies.length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);

  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [sugMode, setSugMode] = useState<"rules" | "ai" | null>(null);
  const [sugLoading, setSugLoading] = useState(false);
  const [sugError, setSugError] = useState<string | null>(null);

  const requestSuggestion = async () => {
    if (sugLoading) return;
    setSugLoading(true);
    setSugError(null);
    try {
      const res = await fetch("/api/whatsapp/reply-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatJid: chat.jid,
          contactId: linkedContact?.id || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSuggestion(data.suggestion);
      setSugMode(data.mode);
    } catch (err) {
      setSugError(err instanceof Error ? err.message : "No se pudo generar");
    } finally {
      setSugLoading(false);
    }
  };

  // Limpia la sugerencia al cambiar de chat.
  useEffect(() => {
    setSuggestion(null);
    setSugMode(null);
    setSugError(null);
  }, [chat.jid]);

  // Borrador del Radar: si este chat es el 1-a-1 destino (no hay mensaje
  // resaltado de grupo), precargar el composer con el mensaje IA.
  useEffect(() => {
    if (draftText && !highlightId && !chat.isGroup) setText(draftText);
  }, [draftText, highlightId, chat.isGroup, chat.jid]);

  const highlightDone = useRef(false);
  useEffect(() => { highlightDone.current = false; }, [highlightId, chat.jid]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (highlightId) {
      // Con mensaje objetivo, el auto-scroll al fondo queda desactivado:
      // el polling de 6s no debe robarse el scroll después de centrar.
      if (highlightDone.current) return;
      if (messages.length === 0) return;
      const target = el.querySelector(`[data-msg-id="${CSS.escape(highlightId)}"]`);
      highlightDone.current = true;
      if (target) {
        target.scrollIntoView({ block: "center" });
      } else {
        // No está en la ventana cargada (muy antiguo): avisar una vez.
        toast.info("El mensaje original es más antiguo que la ventana cargada — te dejé al final del chat.");
        el.scrollTop = el.scrollHeight;
      }
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages, highlightId]);

  const handleSend = async () => {
    const value = text.trim();
    if (!value || sending) return;
    const ok = await onSend(value);
    if (ok) setText("");
  };

  const name = linkedContact?.name || chatDisplayName(chat);

  return (
    <div className="flex flex-col h-full min-h-0 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <button
          onClick={onBack}
          className="md:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-muted cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {chat.isGroup ? (
          <div className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-emerald-600/15 text-emerald-500">
            <Users className="h-4 w-4" />
          </div>
        ) : (
          <Avatar name={name} size={36} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-sm truncate">{name}</p>
            {linkedContact && (
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  linkedContact.temperature === "hot" ? "bg-red-500" : linkedContact.temperature === "warm" ? "bg-amber-400" : "bg-muted-foreground"
                )}
                title={`Contacto del CRM · ${linkedContact.temperature}`}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {chat.isGroup ? "Grupo" : `+${jidToPhone(chat.jid)}`}
          </p>
        </div>
        <button
          onClick={onRefresh}
          title="Actualizar mensajes"
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
        {linkedContact ? (
          <Link
            href={`/contacts/${linkedContact.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
          >
            <ExternalLink className="h-4 w-4 mr-1.5" />
            Ver contacto
          </Link>
        ) : (
          !chat.isGroup && (
            <Button variant="outline" size="sm" onClick={onSaveLead} className="cursor-pointer">
              <UserPlus className="h-4 w-4 mr-1.5" />
              Guardar como lead
            </Button>
          )
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-1 bg-[var(--muted)]/30"
      >
        {loading && messages.length === 0 ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-10 rounded-lg bg-muted animate-pulse",
                  i % 2 ? "w-1/2 ml-auto" : "w-2/3"
                )}
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No hay mensajes en este chat todavia.
          </div>
        ) : (
          messages.map((m, i) => {
            const body = previewText(m.content, m.mediaType);
            const isMedia = !m.content?.trim() && !!m.mediaType;
            const prev = messages[i - 1];
            const next = messages[i + 1];
            // Racha: mensajes consecutivos del mismo lado y mismo día se agrupan
            // (menos aire, esquina continua, hora solo en el último).
            const sameAsPrev = !!prev && prev.isFromMe === m.isFromMe && prev.sender === m.sender && sameDay(prev.timestamp, m.timestamp);
            const sameAsNext = !!next && next.isFromMe === m.isFromMe && next.sender === m.sender && sameDay(next.timestamp, m.timestamp);
            const showDay = !prev || !sameDay(prev.timestamp, m.timestamp);
            return (
              <div key={m.id}>
                {showDay && m.timestamp && (
                  <div className="flex items-center justify-center my-3">
                    <span className="text-[10px] font-medium text-muted-foreground bg-surface-2 rounded-full px-2.5 py-1 capitalize">
                      {dayLabel(m.timestamp)}
                    </span>
                  </div>
                )}
                <div data-msg-id={m.id} className={cn("flex", m.isFromMe ? "justify-end" : "justify-start", sameAsPrev ? "mt-[3px]" : "mt-2.5")}>
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3 py-1.5 text-sm shadow-sm",
                      m.id === highlightId
                        ? "bg-violet-500/15 border-2 border-violet-500 ring-4 ring-violet-500/20"
                        : m.isFromMe
                        ? "bg-emerald-600 text-white"
                        : "bg-card border border-border",
                      m.isFromMe
                        ? sameAsNext ? "rounded-br-md" : "rounded-br-sm"
                        : sameAsNext ? "rounded-bl-md" : "rounded-bl-sm",
                      m.isFromMe && sameAsPrev && "rounded-tr-md",
                      !m.isFromMe && sameAsPrev && "rounded-tl-md",
                    )}
                  >
                    {chat.isGroup && !m.isFromMe && m.sender && !sameAsPrev && (
                      <p className="text-[11px] font-semibold text-muted-foreground mb-0.5">
                        +{jidToPhone(m.sender)}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words flex items-center gap-1.5">
                      {isMedia && <Paperclip className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                      {body || <span className="opacity-60">(sin texto)</span>}
                    </p>
                    {!sameAsNext && (
                      <p
                        className={cn(
                          "text-[10px] mt-0.5 text-right",
                          m.isFromMe ? "text-white/70" : "text-muted-foreground"
                        )}
                      >
                        {formatTime(m.timestamp)}
                      </p>
                    )}
                    {/* Mensaje objetivo del radar: hablarle directo al autor en 1-a-1.
                        El sender puede ser teléfono, LID o id de comunidad — se
                        resuelve contra el bridge al hacer click. */}
                    {m.id === highlightId && !m.isFromMe && m.sender && (
                      <button
                        onClick={async () => {
                          try {
                            const r = await fetch(`/api/whatsapp/resolve-sender?sender=${encodeURIComponent(m.sender!)}`);
                            const d = await r.json().catch(() => ({}));
                            if (d.phone) {
                              window.location.href = `/whatsapp?chat=${encodeURIComponent(`${d.phone}@s.whatsapp.net`)}${draftText ? `&draft=${encodeURIComponent(draftText)}` : ""}`;
                            } else {
                              toast.info("WhatsApp no expone el teléfono de este autor (publicó vía comunidad). Respóndele en el grupo o usa el contacto que dejó en el mensaje.");
                            }
                          } catch {
                            toast.error("No se pudo resolver el autor");
                          }
                        }}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold rounded-lg px-3 py-1.5 bg-violet-600 text-white hover:bg-violet-700 transition-colors cursor-pointer"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Hablarle directo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sugerencia de respuesta (voz Niuro). No envía sola. */}
      <div className="border-t border-border bg-card px-3 pt-2">
        {!suggestion && !sugLoading && !sugError && (
          <button
            onClick={requestSuggestion}
            className="w-full flex items-center gap-2 text-[11px] text-meta hover:text-foreground transition-colors py-1.5 cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Sugerir respuesta en voz Niuro
          </button>
        )}
        {sugLoading && (
          <div className="flex items-center gap-2 text-[11px] text-meta py-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Pensando…
          </div>
        )}
        {sugError && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-red-400 py-1.5">
            <span>{sugError}</span>
            <button onClick={requestSuggestion} className="underline cursor-pointer">Reintentar</button>
          </div>
        )}
        {suggestion && !sugLoading && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-2.5 mb-1">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide mb-1">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-meta font-semibold">Sugerencia</span>
              <span
                className={cn(
                  "ml-auto rounded px-1.5 py-0.5 font-semibold",
                  sugMode === "ai" ? "bg-primary/15 text-primary" : "bg-surface-3 text-meta"
                )}
              >
                {sugMode === "ai" ? "criterio IA" : "modo reglas"}
              </span>
            </div>
            <p className="text-[12.5px] leading-snug whitespace-pre-wrap mb-2">{suggestion}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setText(suggestion)}
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer h-7 px-2.5 text-[11px]")}
              >
                Usar texto
              </button>
              <button
                onClick={requestSuggestion}
                disabled={sugLoading}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer h-7 px-2.5 text-[11px] text-meta")}
              >
                <RotateCw className="h-3 w-3 mr-1" />
                Otra
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="relative border-t border-border p-3 flex items-end gap-2 bg-card">
        {showQuick && (
          <div
            className="slide-in absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-border bg-card p-2 z-10"
            style={{ boxShadow: "0 8px 32px rgba(0,0,0,.4)" }}
          >
            <div className="text-[10px] uppercase tracking-wide text-meta px-2 pb-1">Respuestas rapidas</div>
            <div className="max-h-56 overflow-y-auto">
              {quickReplies.map((qr) => (
                <button
                  key={qr.id}
                  onClick={() => setText(qr.text)}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[var(--hover)] cursor-pointer"
                >
                  <div className="text-xs font-medium">{qr.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{qr.text}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Escribe un mensaje... (/ para respuestas rapidas)"
          rows={1}
          className="flex-1 resize-none max-h-32 min-h-[42px] rounded-xl"
        />
        <Button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="cursor-pointer shrink-0 h-[42px] w-[42px] rounded-full p-0"
          title="Enviar"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
