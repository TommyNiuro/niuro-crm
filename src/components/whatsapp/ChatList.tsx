"use client";

import { useEffect, useState } from "react";
import { Search, Users, User, RefreshCw, UsersRound, X, ArrowDownWideNarrow, Clock, Flame, HardHat, Handshake } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ds";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread" | "unassigned" | "lead";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "unread", label: "Sin leer" },
  { id: "unassigned", label: "Sin asignar" },
  { id: "lead", label: "Señal de lead" },
];

// Color del semáforo por temperatura (anillo del avatar + pill de score).
const TEMP_HEX: Record<string, string> = {
  hot: "#ef4444", warm: "#f59e0b", cold: "#94a3b8",
};
import {
  type WaChat,
  chatDisplayName,
  previewText,
  formatTime,
} from "./types";

type ChatStatus =
  | { kind: "contact"; temperature: string; score?: number; contactType?: string | null }
  | { kind: "lead"; score?: number; temperature?: string }
  | { kind: "dismissed"; temperature?: string; score?: number }
  | null;

interface ChatListProps {
  chats: WaChat[];
  selectedJid: string | null;
  search: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onSelect: (chat: WaChat) => void;
  onRefresh: () => void;
  onArchive?: (chat: WaChat) => void;
  statusFor?: (jid: string) => ChatStatus;
}

// Umbral del filtro "Con señal de lead" (confirmado con el operador): warm + hot.
const LEAD_SIGNAL_MIN = 40;

// Peso para el orden por prioridad: hot > warm > cold > sin señal.
const TEMP_RANK: Record<string, number> = { hot: 3, warm: 2, cold: 1 };

export function ChatList({
  chats,
  selectedJid,
  search,
  loading,
  onSearch,
  onSelect,
  onRefresh,
  onArchive,
  statusFor,
}: ChatListProps) {
  const [filter, setFilter] = useState<Filter>("all");
  // Orden: "priority" (semáforo: hot → warm → cold → sin señal, score desc)
  // o "recent" (cronológico clásico de WhatsApp).
  type SortMode = "priority" | "recent";
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  useEffect(() => {
    const stored = localStorage.getItem("wa_sort_mode") as SortMode | null;
    // localStorage solo puede pasar client-side post-mount (SSR no tiene
    // window); un lazy initializer rompe la primera render con "priority" y
    // genera hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "priority" || stored === "recent") setSortMode(stored);
  }, []);
  useEffect(() => {
    localStorage.setItem("wa_sort_mode", sortMode);
  }, [sortMode]);
  // 3 estados de grupos: "hide" (solo personas, default), "show" (todos), "only" (solo grupos)
  type GroupMode = "hide" | "show" | "only";
  const [groupMode, setGroupMode] = useState<GroupMode>("hide");
  // Ventana de render (auditoría 2026-06-09: hasta 2.000 nodos DOM degradaban
  // el scroll). Se renderizan 150 y un botón "Mostrar más" extiende la ventana.
  const RENDER_BATCH = 150;
  const [renderLimit, setRenderLimit] = useState(RENDER_BATCH);
  useEffect(() => {
    // Resetea la ventana de render al cambiar filtros/orden, patron estandar de paginacion.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenderLimit(RENDER_BATCH);
  }, [search, filter, groupMode, sortMode]);

  // Persistir preferencia en localStorage
  useEffect(() => {
    const stored = localStorage.getItem("wa_group_mode") as GroupMode | null;
    if (stored === "hide" || stored === "show" || stored === "only") {
      // Misma razon que wa_sort_mode arriba: localStorage es client-only, no
      // se puede leer en un lazy initializer sin romper SSR/hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroupMode(stored);
    }
  }, []);
  useEffect(() => {
    localStorage.setItem("wa_group_mode", groupMode);
  }, [groupMode]);

  const cycleGroupMode = () => {
    setGroupMode((m) => (m === "hide" ? "only" : m === "only" ? "show" : "hide"));
  };

  const filtered = chats.filter((c) => {
    if (groupMode === "hide" && c.isGroup) return false;
    if (groupMode === "only" && !c.isGroup) return false;
    if (filter === "unread") return !c.lastIsFromMe;
    if (filter === "unassigned") return statusFor?.(c.jid)?.kind !== "contact";
    if (filter === "lead") {
      const s = statusFor?.(c.jid);
      return s?.kind === "lead" && (s.score ?? 0) >= LEAD_SIGNAL_MIN;
    }
    return true;
  });

  // Orden semáforo: temperatura (hot→warm→cold→nada), luego score, luego recencia.
  const visible =
    sortMode === "recent"
      ? filtered
      : [...filtered].sort((a, b) => {
          const sa = statusFor?.(a.jid);
          const sb = statusFor?.(b.jid);
          const ra = TEMP_RANK[sa?.temperature ?? ""] ?? 0;
          const rb = TEMP_RANK[sb?.temperature ?? ""] ?? 0;
          if (ra !== rb) return rb - ra;
          const sca = sa?.score ?? 0;
          const scb = sb?.score ?? 0;
          if (sca !== scb) return scb - sca;
          return (b.lastMessageTime || "").localeCompare(a.lastMessageTime || "");
        });

  return (
    <div className="flex flex-col h-full min-h-0 bg-card overflow-hidden">
      <div className="p-3 border-b border-border flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar chat o grupo..."
            aria-label="Buscar chat o grupo"
            className="pl-8"
          />
        </div>
        <button
          onClick={cycleGroupMode}
          aria-label={
            groupMode === "hide"
              ? "Mostrar solo grupos"
              : groupMode === "only"
              ? "Mostrar todos los chats"
              : "Ocultar grupos"
          }
          title={
            groupMode === "hide"
              ? "Mostrando solo personas. Click para ver solo grupos."
              : groupMode === "only"
              ? "Mostrando solo grupos. Click para ver todos."
              : "Mostrando todos. Click para ocultar grupos."
          }
          className={cn(
            "p-2 rounded-lg cursor-pointer transition-colors flex items-center gap-1",
            groupMode === "only"
              ? "bg-emerald-600 text-white"
              : groupMode === "hide"
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground"
          )}
        >
          {groupMode === "only" ? (
            <UsersRound className="h-4 w-4" />
          ) : groupMode === "hide" ? (
            <User className="h-4 w-4" />
          ) : (
            <Users className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={onRefresh}
          title="Actualizar"
          aria-label="Actualizar lista de chats"
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-1.5 px-3 py-2 border-b border-border">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "text-[11px] font-medium rounded-md px-2.5 py-1 cursor-pointer transition-colors",
              filter === f.id
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setSortMode((m) => (m === "priority" ? "recent" : "priority"))}
          aria-pressed={sortMode === "priority"}
          title={
            sortMode === "priority"
              ? "Orden: prioridad (semáforo hot → warm → cold). Click para orden cronológico."
              : "Orden: recientes primero. Click para ordenar por prioridad de lead."
          }
          className={cn(
            "ml-auto text-[11px] font-medium rounded-md px-2 py-1 cursor-pointer transition-colors flex items-center gap-1",
            sortMode === "priority"
              ? "bg-surface-2 text-foreground"
              : "bg-surface-2 text-muted-foreground hover:text-foreground"
          )}
        >
          {sortMode === "priority" ? (
            <ArrowDownWideNarrow className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          {sortMode === "priority" ? "Prioridad" : "Recientes"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && chats.length === 0 ? (
          <div role="status" aria-label="Cargando chats..." aria-busy="true" className="p-3 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {chats.length === 0 ? "No se encontraron chats." : "Nada en este filtro."}
          </div>
        ) : (
          <>
          {visible.slice(0, renderLimit).map((chat) => {
            const active = chat.jid === selectedJid;
            const name = chatDisplayName(chat);
            const preview = previewText(chat.lastMessage, chat.lastMediaType);
            return (
              <div
                key={chat.jid}
                onClick={() => onSelect(chat)}
                onKeyDown={(e) => {
                  // role="button" sin handler de teclado era inoperable sin mouse
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(chat);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Abrir chat con ${name}`}
                className={cn(
                  "group w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer relative",
                  active ? "bg-primary/8" : "hover:bg-muted/60"
                )}
              >
                {/* Barra de acento del chat activo */}
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />}
                {(() => {
                  const st = statusFor?.(chat.jid);
                  const tempColor = st && st.kind !== "dismissed" ? TEMP_HEX[st.temperature || ""] : undefined;
                  // Insignia contextual del avatar: de un vistazo se sabe QUÉ es
                  // este chat: ingeniero, cliente, lead caliente, contacto CRM o
                  // descartado (no-negocio). Prioridad: tipo > temperatura > CRM.
                  const badge = (() => {
                    if (st?.kind === "dismissed")
                      return { icon: X, bg: "bg-muted-foreground/70", title: "No es de ventas (archivado)" };
                    if (st?.kind === "contact" && st.contactType === "engineer")
                      return { icon: HardHat, bg: "bg-amber-500", title: "Ingeniero del pool" };
                    if (st?.kind === "contact" && st.contactType === "client")
                      return { icon: Handshake, bg: "bg-emerald-600", title: "Cliente" };
                    if (st && st.temperature === "hot")
                      return { icon: Flame, bg: "bg-red-500", title: st.kind === "contact" ? "Contacto caliente" : `Lead caliente · score ${st.score ?? "?"}` };
                    if (st?.kind === "contact")
                      return { icon: User, bg: "bg-primary", title: "Contacto del CRM" };
                    return null;
                  })();
                  return (
                    <div
                      className="relative shrink-0 rounded-full"
                      style={tempColor ? { boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${tempColor}` } : undefined}
                      title={
                        st?.kind === "contact" ? "Ya es contacto en el CRM"
                        : st?.kind === "lead" ? `Lead detectado · score ${st.score ?? "?"}`
                        : st?.kind === "dismissed" ? "Archivado: no es de ventas"
                        : undefined
                      }
                    >
                      <div className={st?.kind === "dismissed" ? "opacity-50 grayscale" : undefined}>
                        {chat.isGroup ? (
                          <div className="h-10 w-10 rounded-full flex items-center justify-center bg-emerald-600/15 text-emerald-500">
                            <Users className="h-4.5 w-4.5" />
                          </div>
                        ) : (
                          <Avatar name={name} size={40} />
                        )}
                      </div>
                      {badge && (
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-card flex items-center justify-center shadow-sm",
                            badge.bg
                          )}
                          title={badge.title}
                        >
                          <badge.icon className="h-2.5 w-2.5 text-white" />
                        </span>
                      )}
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-[13px] truncate", !chat.lastIsFromMe ? "font-semibold" : "font-medium")}>{name}</span>
                    {(() => {
                      const st = statusFor?.(chat.jid);
                      const sc = st?.kind === "lead" ? st.score : undefined;
                      if (typeof sc !== "number" || sc <= 0) return null;
                      const c = TEMP_HEX[st?.temperature || "cold"] || TEMP_HEX.cold;
                      return (
                        <span
                          title="Score del detector"
                          className="text-[10px] font-bold tabular-nums shrink-0 px-1.5 py-px rounded-full"
                          style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}
                        >
                          {sc}
                        </span>
                      );
                    })()}
                    <span className="ml-auto text-[10.5px] text-muted-foreground shrink-0 tabular-nums">
                      {formatTime(chat.lastMessageTime)}
                    </span>
                  </div>
                  <p className={cn("text-xs truncate mt-0.5", !chat.lastIsFromMe ? "text-foreground/80" : "text-muted-foreground")}>
                    {chat.lastIsFromMe && preview ? <span className="text-muted-foreground">Tú: </span> : ""}
                    {preview || "Sin mensajes"}
                  </p>
                </div>
                {onArchive && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchive(chat);
                    }}
                    title="Archivar (no es de ventas)"
                    aria-label={`Archivar chat con ${name}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-500/10 hover:text-red-500 text-muted-foreground shrink-0 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {visible.length > renderLimit && (
            <button
              onClick={() => setRenderLimit((n) => n + RENDER_BATCH)}
              className="w-full py-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer transition-colors"
            >
              Mostrar más ({visible.length - renderLimit} restantes)
            </button>
          )}
          </>
        )}
      </div>
    </div>
  );
}
