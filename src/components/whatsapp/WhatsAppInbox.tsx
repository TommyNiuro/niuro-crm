"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatList } from "./ChatList";
import { Conversation } from "./Conversation";
import { ContactPanel } from "./ContactPanel";
import { SaveLeadDialog } from "./SaveLeadDialog";
import type { WaChat, WaMessage, WaStatus } from "./types";

export interface QuickReply {
  id: string;
  label: string;
  text: string;
}

export function WhatsAppInbox() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [chats, setChats] = useState<WaChat[]>([]);
  const [search, setSearch] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);

  const [selected, setSelected] = useState<WaChat | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Borrador en tránsito: viene del Radar (?draft=) y termina en el composer
  // del 1-a-1, pasando por el grupo si el flujo es radar → grupo → directo.
  const [draftText, setDraftText] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);

  type LinkContact = {
    id: string;
    name: string;
    temperature: string;
    whatsappJid: string | null;
    phone: string | null;
    contactType?: string | null;
  };
  type PendingLead = { chatJid: string; score: number; temperature: string };
  const [links, setLinks] = useState<{
    contacts: LinkContact[];
    pendingChatJids: string[];
    pending: PendingLead[];
    dismissedChatJids: string[];
  }>({
    contacts: [],
    pendingChatJids: [],
    pending: [],
    dismissedChatJids: [],
  });

  const searchRef = useRef(search);
  searchRef.current = search;
  const deepLinkDone = useRef(false);

  const loadLinks = useCallback(() => {
    fetch("/api/whatsapp/links")
      .then((r) => (r.ok ? r.json() : { contacts: [], pendingChatJids: [], pending: [] }))
      .then((d) =>
        setLinks({
          contacts: d.contacts || [],
          pendingChatJids: d.pendingChatJids || [],
          pending: d.pending || [],
          dismissedChatJids: d.dismissedChatJids || [],
        })
      )
      .catch(() => {});
  }, []);

  const contactFor = useCallback(
    (jid: string): LinkContact | null => {
      const num = jid.split("@")[0].replace(/\D/g, "");
      // Los chats @lid no llevan el teléfono en el jid: usar el teléfono
      // canónico que resuelve el server (chat.phone) para matchear contactos
      // guardados con el jid viejo.
      const canonPhone = chats.find((c) => c.jid === jid)?.phone ?? null;
      return (
        links.contacts.find(
          (c) =>
            c.whatsappJid === jid ||
            (c.phone && c.phone.replace(/\D/g, "") === num) ||
            (canonPhone && c.phone && c.phone.replace(/\D/g, "") === canonPhone) ||
            (canonPhone && c.whatsappJid && c.whatsappJid.startsWith(canonPhone + "@"))
        ) || null
      );
    },
    [links, chats]
  );


  const loadStatus = useCallback(() => {
    fetch("/api/whatsapp/status")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => setStatus(null));
  }, []);

  const loadChats = useCallback((query: string, silent = false) => {
    if (!silent) setLoadingChats(true);
    // 500 (antes 2000): payload 4x menor por búsqueda; la búsqueda server-side
    // cubre el resto del historial (auditoría 2026-06-09)
    const params = new URLSearchParams({ limit: "500" });
    if (query.trim()) params.set("query", query.trim());
    const qs = `?${params.toString()}`;
    fetch(`/api/whatsapp/chats${qs}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setChats(Array.isArray(d) ? d : []))
      .catch(() => {
        setChats([]);
        toast.error("No se pudieron cargar los chats");
      })
      .finally(() => setLoadingChats(false));
  }, []);

  // AbortController (auditoría 2026-06-09): al cambiar de chat se cancela el
  // fetch anterior — antes una respuesta tardía del chat viejo pisaba los
  // mensajes del chat recién abierto.
  const msgAbort = useRef<AbortController | null>(null);
  // Mensajes propios enviados desde el CRM que el store del bridge aún no tiene.
  const echoRef = useRef<{ jid: string; msg: WaMessage; at: number }[]>([]);
  // Ventana de mensajes del chat abierto: el deep-link con ?msg= la amplía a 500
  // y el polling de 6s debe respetarla (si no, pisa la carga amplia con 80).
  const msgLimitRef = useRef<number | undefined>(undefined);
  const loadMessages = useCallback((jid: string, withSpinner = true, limit?: number) => {
    if (limit !== undefined) msgLimitRef.current = limit;
    const effLimit = limit ?? msgLimitRef.current;
    if (withSpinner) setLoadingMessages(true);
    msgAbort.current?.abort();
    const ctrl = new AbortController();
    msgAbort.current = ctrl;
    fetch(`/api/whatsapp/messages?chat_jid=${encodeURIComponent(jid)}${effLimit ? `&limit=${effLimit}` : ""}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (ctrl.signal.aborted) return;
        const fetched: WaMessage[] = Array.isArray(d) ? d : [];
        // Ecos locales de mensajes recién enviados: el store del bridge tarda en
        // persistir el enviado, y el refetch/polling PISABA el eco optimista (el
        // mensaje "desaparecía" del CRM aunque sí salió por WhatsApp). El eco
        // sobrevive hasta que el store devuelva el mensaje real o pasen 10 min.
        const nowMs = Date.now();
        echoRef.current = echoRef.current.filter(
          (e) =>
            nowMs - e.at < 10 * 60_000 &&
            // ponytail: dar por "llegó el mensaje real" solo si el fetched propio
            // coincide en contenido Y su timestamp está cerca del envío. Antes, un
            // mensaje propio idéntico VIEJO ya en la ventana descartaba el eco antes
            // de tiempo y el recién enviado "desaparecía" de la UI (timestamp ISO -> ms).
            !(
              e.jid === jid &&
              fetched.some(
                (f) =>
                  f.isFromMe &&
                  f.content === e.msg.content &&
                  Math.abs(new Date(f.timestamp ?? 0).getTime() - e.at) < 5 * 60_000
              )
            )
        );
        const extras = echoRef.current.filter((e) => e.jid === jid).map((e) => e.msg);
        setMessages([...fetched, ...extras]);
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name !== "AbortError") {
          setMessages([]);
          toast.error("No se pudieron cargar los mensajes");
        }
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoadingMessages(false); });
  }, []);

  // Initial load
  useEffect(() => {
    loadStatus();
    loadChats("");
    loadLinks();
    fetch("/api/quick-replies")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setQuickReplies(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [loadStatus, loadChats, loadLinks]);

  // Deep-link: /whatsapp?chat=<jid> abre esa conversación directamente
  // (lo usan el detalle de contacto y la lista de leads para enlazar al chat).
  useEffect(() => {
    if (deepLinkDone.current) return;
    const urlParams = new URLSearchParams(window.location.search);
    const jid = urlParams.get("chat");
    if (!jid) return;
    deepLinkDone.current = true;
    // ?msg=<id>: scrollear y resaltar ese mensaje (lo usa el Radar de grupos).
    const msgId = urlParams.get("msg");
    if (msgId) setHighlightId(msgId);
    const draft = urlParams.get("draft");
    if (draft) setDraftText(draft);
    const found = chats.find((c) => c.jid === jid);
    const c = contactFor(jid);
    const num = jid.split("@")[0].replace(/\D/g, "");
    const chat: WaChat =
      found || {
        jid,
        name: c?.name || (num ? `+${num}` : jid),
        isGroup: jid.endsWith("@g.us"),
        lastMessageTime: null,
        lastMessage: null,
        lastMediaType: null,
        lastIsFromMe: false,
      };
    setSelected(chat);
    setMessages([]);
    // Con mensaje objetivo, ventana amplia: el mensaje puede ser antiguo.
    loadMessages(jid, true, msgId ? 500 : undefined);
  }, [chats, contactFor, loadMessages]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => loadChats(search), 300);
    return () => clearTimeout(t);
  }, [search, loadChats]);

  // Poll messages of the open chat every 6s
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(() => loadMessages(selected.jid, false), 6000);
    return () => clearInterval(t);
  }, [selected, loadMessages]);

  // La LISTA también se refresca sola (20s, silencioso): sin esto, los
  // previews y el orden quedaban congelados hasta un refresh manual aunque
  // el bridge estuviera recibiendo mensajes en vivo.
  useEffect(() => {
    const t = setInterval(() => loadChats(searchRef.current, true), 20_000);
    return () => clearInterval(t);
  }, [loadChats]);

  const handleSelect = (chat: WaChat) => {
    setSelected(chat);
    setMessages([]);
    setHighlightId(null);
    setDraftText(null);
    msgLimitRef.current = undefined;
    loadMessages(chat.jid);
  };

  const handleSend = async (textValue: string): Promise<boolean> => {
    if (!selected) return false;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: selected.jid, message: textValue, confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(data.message || data.error || "No se pudo enviar");
        return false;
      }
      toast.success("Mensaje enviado");
      // Eco optimista persistente: se registra en echoRef para que el
      // refetch/polling no lo pise mientras el bridge persiste el mensaje.
      const echoMsg: WaMessage = {
        id: `local-${Date.now()}`,
        sender: null,
        content: textValue,
        mediaType: null,
        filename: null,
        timestamp: new Date().toISOString(),
        isFromMe: true,
      };
      echoRef.current.push({ jid: selected.jid, msg: echoMsg, at: Date.now() });
      setMessages((prev) => [...prev, echoMsg]);
      setTimeout(() => loadMessages(selected.jid, false), 1500);
      return true;
    } catch {
      toast.error("Error de red al enviar");
      return false;
    } finally {
      setSending(false);
    }
  };

  // Connection banner
  const banner = (() => {
    if (!status) return null;
    if (!status.dbExists) {
      return {
        tone: "warn" as const,
        text: "WhatsApp no esta conectado. Abre la ventana 'Conectar WhatsApp' en tu Mac y escanea el QR.",
      };
    }
    if (!status.bridgeUp) {
      return {
        tone: "warn" as const,
        text: `Puedes leer ${status.messageCount.toLocaleString("es")} mensajes guardados, pero para ENVIAR necesitas la ventana 'Conectar WhatsApp' abierta (el puente no responde).`,
      };
    }
    return {
      tone: "ok" as const,
      text: `Conectado. ${status.chatCount.toLocaleString("es")} chats, ${status.messageCount.toLocaleString("es")} mensajes.`,
    };
  })();

  return (
    <div className="flex flex-col h-full">
      {banner && banner.tone === "warn" && (
        <div className="flex items-start gap-2 px-4 py-2 text-xs shrink-0 border-b border-warning/30 bg-warning/10 text-warning">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{banner.text}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <div
          className={cn(
            "w-full md:w-[340px] shrink-0 border-r border-border",
            selected ? "hidden md:block" : "block"
          )}
        >
          <ChatList
            chats={chats}
            selectedJid={selected?.jid ?? null}
            search={search}
            loading={loadingChats}
            onSearch={setSearch}
            onSelect={handleSelect}
            onRefresh={() => {
              loadStatus();
              loadChats(search);
              loadLinks();
            }}
            onArchive={async (chat) => {
              try {
                const res = await fetch("/api/whatsapp/dismiss-chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chatJid: chat.jid,
                    name: chat.name || chat.jid.split("@")[0],
                    reason: "Archivado desde inbox (no es de ventas)",
                  }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                toast.success(`Archivado: ${chat.name || chat.jid.split("@")[0]}`);
                if (selected?.jid === chat.jid) setSelected(null);
                loadChats(searchRef.current);
                loadLinks();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "No se pudo archivar");
              }
            }}
            statusFor={(jid, phone) => {
              // Identidad canónica: las marcas del operador (contacto, lead,
              // descartado) pueden estar guardadas con el jid viejo (teléfono)
              // mientras el chat se presenta con el nuevo (@lid). Sin esto,
              // horas de triage se veían como "desmarcadas".
              const digits = (s: string) => s.split("@")[0].replace(/\D/g, "");
              const key = phone || digits(jid);
              const same = (other: string) => other === jid || (!!key && digits(other) === key);
              const c =
                links.contacts.find(
                  (x) =>
                    x.whatsappJid === jid ||
                    (key && x.whatsappJid && digits(x.whatsappJid) === key) ||
                    (key && x.phone && x.phone.replace(/\D/g, "") === key)
                ) || null;
              if (c) return { kind: "contact" as const, temperature: c.temperature, contactType: c.contactType ?? null };
              const p = links.pending.find((x) => same(x.chatJid)) || null;
              if (p) return { kind: "lead" as const, score: p.score, temperature: p.temperature };
              if (links.pendingChatJids.some(same)) return { kind: "lead" as const };
              if (links.dismissedChatJids.some(same)) return { kind: "dismissed" as const };
              return null;
            }}
          />
        </div>

        <div className={cn("flex-1 min-w-0", selected ? "block" : "hidden md:block")}>
          {selected ? (
            <Conversation
              chat={selected}
              messages={messages}
              loading={loadingMessages}
              sending={sending}
              linkedContact={contactFor(selected.jid)}
              quickReplies={quickReplies}
              highlightId={highlightId}
              draftText={draftText}
              onBack={() => setSelected(null)}
              onRefresh={() => loadMessages(selected.jid)}
              onSend={handleSend}
              onSaveLead={() => setLeadOpen(true)}
            />
          ) : (
            <div className="hidden md:flex h-full items-center justify-center bg-card text-center">
              <div className="text-muted-foreground">
                <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Selecciona un chat para ver la conversacion</p>
              </div>
            </div>
          )}
        </div>

        {selected && (
          <ContactPanel
            key={selected.jid}
            chat={selected}
            contactId={contactFor(selected.jid)?.id ?? null}
            onSaveLead={() => setLeadOpen(true)}
            onAfterDismiss={() => {
              loadLinks();
              loadChats(searchRef.current);
            }}
          />
        )}
      </div>

      <SaveLeadDialog chat={selected} open={leadOpen} onClose={() => setLeadOpen(false)} />
    </div>
  );
}
