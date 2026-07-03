"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UserPlus, UserX, ExternalLink, X, Loader2, Pencil, HardHat } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Tag } from "@/components/ds";
import { STAGES, STAGE_CFG } from "@/lib/crm-ui";
import { formatCurrency } from "@/lib/constants";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DIM_LABEL, DIM_MAX, type ScoreBreakdown } from "@/lib/score-lead";
import { type WaChat, chatDisplayName, jidToPhone } from "./types";

interface FullContact {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: string;
  valueCents: number;
  probability: number;
  tags: string | null;
  nextAction: string | null;
  source: string;
}

interface ScoreResponse {
  score: number;
  base: number;
  temperature: "hot" | "warm" | "cold";
  breakdown: ScoreBreakdown;
  signals: {
    companyToken: boolean;
    companyTokenText: string | null;
    ownerSelling: boolean;
    ownerSellHits: number;
    docsSent: number;
    reciprocity: boolean;
    contactIntent: number;
    daysSinceLast: number | null;
    recencyFactor: number;
  };
  reason: string;
  recommendation: "save" | "discard" | "review";
  disqualifier: string | null;
  mode: "rules" | "ai";
  source?: "cache" | "fresh";
  candidateStatus?: "pending" | "dismissed";
  kind?: "sales" | "engineer";
}

const TEMP_LABEL: Record<string, string> = { hot: "Caliente", warm: "Tibio", cold: "Frío" };
const TEMP_BG: Record<string, string> = {
  hot: "bg-red-500/15 text-red-300",
  warm: "bg-amber-500/15 text-amber-300",
  cold: "bg-muted text-muted-foreground",
};
const TEMP_DOT: Record<string, string> = {
  hot: "bg-red-500", warm: "bg-amber-500", cold: "bg-muted-foreground",
};

const TEMP_COLOR: Record<string, string> = {
  hot: "#ef4444", warm: "#f59e0b", cold: "var(--muted-foreground)",
};

// Gauge radial del score: arco SVG coloreado por temperatura.
function ScoreGauge({ score, temperature }: { score: number; temperature: string }) {
  const color = TEMP_COLOR[temperature] || TEMP_COLOR.cold;
  const r = 44;
  const circ = 2 * Math.PI * r;
  const arc = (Math.max(0, Math.min(100, score)) / 100) * circ * 0.75; // 270°
  return (
    <div className="relative h-[120px] w-[120px]">
      <svg viewBox="0 0 110 110" className="h-full w-full -rotate-[225deg]">
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="9"
          strokeDasharray={`${circ * 0.75} ${circ}`} strokeLinecap="round" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="9"
          strokeDasharray={`${arc} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 600ms cubic-bezier(.4,0,.2,1)", filter: `drop-shadow(0 0 6px ${color}55)` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[32px] font-bold tabular-nums leading-none" style={{ color }}>{score}</span>
        <span className="text-[10px] text-meta mt-0.5">de 100</span>
      </div>
    </div>
  );
}

function BreakdownBar({ label, points, max, color }: { label: string; points: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (points / max) * 100)) : 0;
  // Paleta unificada: antes el desglose era esmeralda fijo mientras el gauge y
  // el badge de arriba usan el color de temperatura (rojo/ambar/gris) — dos
  // escalas de color chocando en el mismo panel se veía roto. Ahora todo el
  // panel usa UN solo acento: el de la temperatura del lead.
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-semibold" style={{ color: pct > 0 ? color : "var(--meta)" }}>
          {points}
          <span className="text-meta font-normal">/{max}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, opacity: 0.45 + (pct / 100) * 0.55, transition: "width 500ms cubic-bezier(.4,0,.2,1)" }}
        />
      </div>
    </div>
  );
}

// Chips de señales detectadas en la conversación.
function SignalChips({ signals }: { signals: ScoreResponse["signals"] }) {
  const chips: { label: string; on: boolean }[] = [
    { label: "Pitch enviado", on: signals.ownerSelling },
    { label: signals.companyTokenText ? `Empresa: ${signals.companyTokenText}` : "Empresa detectada", on: signals.companyToken },
    { label: `${signals.docsSent} doc${signals.docsSent === 1 ? "" : "s"} enviado${signals.docsSent === 1 ? "" : "s"}`, on: signals.docsSent > 0 },
    { label: "Reciprocidad", on: signals.reciprocity },
    {
      label: signals.daysSinceLast != null && signals.daysSinceLast > 7
        ? `Frío hace ${signals.daysSinceLast}d (×${signals.recencyFactor})`
        : "Conversación fresca",
      on: signals.daysSinceLast != null,
    },
  ].filter((c) => c.on);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.label} className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-surface-2 text-muted-foreground border border-border">
          {c.label}
        </span>
      ))}
    </div>
  );
}

function InsightPanel({
  chat,
  onSaveLead,
  onDismissed,
}: {
  chat: WaChat;
  onSaveLead: () => void;
  onDismissed: () => void;
}) {
  const [data, setData] = useState<ScoreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [losing, setLosing] = useState(false);
  const [markingEng, setMarkingEng] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ chat_jid: chat.jid });
    if (chat.name) params.set("name", chat.name);
    fetch(`/api/whatsapp/score?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "No se pudo calcular el score");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [chat.jid, chat.name]);

  const handleDismiss = async () => {
    if (dismissing) return;
    setDismissing(true);
    try {
      const res = await fetch("/api/whatsapp/dismiss-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatJid: chat.jid,
          name: chat.name || jidToPhone(chat.jid),
          phone: "+" + jidToPhone(chat.jid),
          reason: data?.reason || "Descartado desde Conversaciones",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      toast.success("Chat descartado");
      onDismissed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo descartar");
    } finally {
      setDismissing(false);
    }
  };

  // Lead perdido: hubo conversación de negocio pero no quiso / no necesita.
  // Crea (o archiva) el contacto → suma en la columna "Perdidos" del pipeline.
  const handleLost = async () => {
    if (losing) return;
    setLosing(true);
    try {
      const res = await fetch("/api/whatsapp/lost-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatJid: chat.jid,
          name: chat.name || jidToPhone(chat.jid),
          phone: "+" + jidToPhone(chat.jid),
          reason: data?.reason
            ? `No quiso / no necesita. Señal previa: ${data.reason}`
            : "Lead perdido: no quiere / no necesita",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      toast.success("Lead perdido registrado en el pipeline (Perdidos)");
      onDismissed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar");
    } finally {
      setLosing(false);
    }
  };

  // Ingeniero: no es lead de venta, es candidato para el pool. Va al pipeline de
  // ingenieros (arranca en Contactado) y sale del inbox de Conversaciones.
  const handleEngineer = async () => {
    if (markingEng) return;
    setMarkingEng(true);
    try {
      const res = await fetch("/api/whatsapp/save-engineer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatJid: chat.jid,
          name: chat.name || jidToPhone(chat.jid),
          phone: "+" + jidToPhone(chat.jid),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      toast.success("Guardado en el pipeline de Ingenieros 👷");
      onDismissed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo marcar");
    } finally {
      setMarkingEng(false);
    }
  };

  if (loading) {
    return (
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analizando conversación…
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-4 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-5 space-y-3 text-xs">
        <p className="text-muted-foreground">
          {error || "Sin análisis disponible"}
        </p>
        {!chat.isGroup && (
          <button
            onClick={onSaveLead}
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "w-full cursor-pointer")}
          >
            <UserPlus className="h-4 w-4 mr-1.5" /> Guardar igual como lead
          </button>
        )}
      </div>
    );
  }

  const dismissed = data.candidateStatus === "dismissed";
  const isEngineer = data.kind === "engineer";
  const rec = data.recommendation;
  const recBlock =
    rec === "save"
      ? { tone: "save" as const, text: "Lo guardaría. Señal de negocio clara." }
      : rec === "discard"
      ? data.disqualifier
        ? { tone: "discard" as const, text: data.reason }
        : { tone: "discard" as const, text: "Sin señal de negocio. Lo descartaría." }
      : { tone: "review" as const, text: "Señal débil. Revisa antes de guardar." };

  return (
    <div className="p-5 space-y-5">
      {isEngineer ? (
        /* Reclutamiento detectado: acá el score de venta NO aplica; la persona
           es un candidato. Nada de gauge ni desglose de compra. */
        <div className="flex flex-col items-center text-center">
          <div className="h-[104px] w-[104px] rounded-full bg-amber-500/12 border-2 border-amber-500/40 flex items-center justify-center shadow-sm">
            <HardHat className="h-11 w-11 text-amber-500" />
          </div>
          <span className="mt-3 text-[10px] uppercase tracking-wide font-semibold rounded px-2 py-0.5 bg-amber-500/15 text-amber-500">
            Candidato · Ingeniero
          </span>
          <p className="text-[11.5px] text-muted-foreground mt-2.5 leading-snug border-l-2 border-amber-500 pl-2.5 text-left">
            {data.reason}
          </p>
        </div>
      ) : (
        <>
          {/* Hero: gauge radial + temperatura */}
          <div className="flex flex-col items-center text-center">
            <ScoreGauge score={data.score} temperature={data.temperature} />
            <div className="flex items-center gap-1.5 -mt-1">
              <span className={cn("h-2 w-2 rounded-full", TEMP_DOT[data.temperature])} />
              <span className={cn("text-[10px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5", TEMP_BG[data.temperature])}>
                {TEMP_LABEL[data.temperature]}
              </span>
              {dismissed && (
                <span className="text-[10px] uppercase tracking-wide font-semibold rounded px-1.5 py-0.5 bg-surface-3 text-meta">
                  Descartado
                </span>
              )}
              <span className="text-[10px] text-meta">· {data.mode === "ai" ? "criterio IA" : "reglas"}</span>
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-2.5 leading-snug border-l-2 pl-2.5 text-left" style={{ borderColor: TEMP_COLOR[data.temperature] }}>
              {data.reason}
            </p>
          </div>

          <SignalChips signals={data.signals} />

          <div className="space-y-2.5">
            <div className="text-[10px] uppercase tracking-wide text-meta font-semibold">
              Desglose
            </div>
            {(Object.keys(data.breakdown) as (keyof ScoreBreakdown)[]).map((k) => (
              <BreakdownBar key={k} label={DIM_LABEL[k]} points={data.breakdown[k]} max={DIM_MAX[k]} color={TEMP_COLOR[data.temperature]} />
            ))}
          </div>

          <div
            className={cn(
              "rounded-xl shadow-sm p-3 text-[12px] leading-snug",
              recBlock.tone === "save"
                ? "bg-[var(--accent-dim)] text-[var(--primary)] border border-[var(--primary)]/30"
                : recBlock.tone === "discard"
                ? "bg-surface-2 text-muted-foreground"
                : "bg-surface-2 text-foreground border border-warning/25"
            )}
          >
            <div className="text-[10px] uppercase tracking-wide opacity-70 mb-0.5">Recomendación</div>
            {recBlock.text}
          </div>
        </>
      )}

      {!chat.isGroup && !dismissed && (
        <div className="flex flex-col gap-2">
          {/* En reclutamiento, la acción primaria es guardarlo como ingeniero. */}
          <button
            onClick={handleEngineer}
            disabled={markingEng}
            title="No es venta: es un ingeniero para el pool. Va al pipeline de Ingenieros."
            className={cn(
              buttonVariants({ variant: isEngineer ? "default" : "secondary", size: "sm" }),
              "w-full cursor-pointer",
              isEngineer ? "order-first" : "order-2 text-cyan-400"
            )}
          >
            {markingEng ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <HardHat className="h-4 w-4 mr-1.5" />}
            Es un ingeniero 👷
          </button>
          <button
            onClick={onSaveLead}
            className={cn(
              buttonVariants({
                variant: !isEngineer && rec === "save" ? "default" : "secondary",
                size: "sm",
              }),
              "w-full cursor-pointer",
              isEngineer ? "order-2" : "order-first"
            )}
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            Guardar como lead
          </button>
          <button
            onClick={handleLost}
            disabled={losing}
            title="Era un prospecto real pero no quiso o no necesita. Queda contabilizado en Perdidos del pipeline."
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full cursor-pointer text-amber-300 order-3")}
          >
            {losing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <UserX className="h-4 w-4 mr-1.5" />}
            Lead perdido (no quiso)
          </button>
          <button
            onClick={handleDismiss}
            disabled={dismissing}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full cursor-pointer text-meta order-4")}
          >
            {dismissing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <X className="h-4 w-4 mr-1.5" />}
            No es de ventas (archivar)
          </button>
        </div>
      )}
    </div>
  );
}

export function ContactPanel({
  chat,
  contactId,
  onSaveLead,
  onAfterDismiss,
}: {
  chat: WaChat;
  contactId: string | null;
  onSaveLead: () => void;
  onAfterDismiss?: () => void;
}) {
  const [contact, setContact] = useState<FullContact | null>(null);
  const [editingValue, setEditingValue] = useState(false);
  const [valueInput, setValueInput] = useState("");
  const valueInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!contactId) return;
    let active = true;
    fetch(`/api/contacts/${contactId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setContact(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [contactId]);

  const handleStartEditValue = () => {
    if (!contact) return;
    setValueInput(contact.valueCents ? String(contact.valueCents / 100) : "");
    setEditingValue(true);
    setTimeout(() => valueInputRef.current?.focus(), 0);
  };

  const handleConfirmValue = async () => {
    if (!contact || !contactId) return;
    const parsed = parseFloat(valueInput);
    if (isNaN(parsed) || parsed < 0) {
      toast.error("Ingresa un valor valido");
      return;
    }
    const cents = Math.round(parsed * 100);
    const prev = contact.valueCents;
    setContact((c) => c ? { ...c, valueCents: cents } : c);
    setEditingValue(false);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valueCents: cents }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Valor actualizado");
    } catch {
      setContact((c) => c ? { ...c, valueCents: prev } : c);
      toast.error("No se pudo actualizar el valor");
    }
  };

  const handleValueKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleConfirmValue();
    if (e.key === "Escape") setEditingValue(false);
  };

  const displayName = chatDisplayName(chat);

  const tags: string[] = (() => {
    try {
      return contact?.tags ? JSON.parse(contact.tags) : [];
    } catch {
      return [];
    }
  })();

  const stageIdx = contact ? STAGES.indexOf(contact.stage as (typeof STAGES)[number]) : -1;

  return (
    <div className="hidden lg:flex w-[300px] shrink-0 flex-col border-l border-border overflow-y-auto">
      <div className="p-5 flex flex-col items-center text-center border-b border-border">
        <Avatar name={contact?.name || displayName} size={64} />
        <div className="mt-3 font-semibold text-sm">{contact?.name || displayName}</div>
        {contact?.company && <div className="text-xs text-muted-foreground">{contact.company}</div>}
      </div>

      {!contactId ? (
        <InsightPanel
          chat={chat}
          onSaveLead={onSaveLead}
          onDismissed={() => onAfterDismiss?.()}
        />
      ) : !contact ? (
        <div className="p-5 space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {/* Valor + probabilidad */}
          <div className="rounded-xl bg-surface-2 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-muted-foreground mb-0.5">Valor</div>
                {editingValue ? (
                  <input
                    ref={valueInputRef}
                    type="number"
                    min={0}
                    step={0.01}
                    value={valueInput}
                    onChange={(e) => setValueInput(e.target.value)}
                    onBlur={handleConfirmValue}
                    onKeyDown={handleValueKeyDown}
                    placeholder="USD/mes"
                    className="w-full bg-transparent border-b border-primary outline-none text-base font-bold text-primary tabular-nums pb-0.5"
                  />
                ) : (
                  <button
                    onClick={handleStartEditValue}
                    className="flex items-center gap-1.5 group cursor-pointer"
                  >
                    <span className="text-base font-bold text-primary tabular-nums">
                      {contact.valueCents ? formatCurrency(contact.valueCents) : "Sin valor asignado"}
                    </span>
                    <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                )}
              </div>
              <div className="text-right shrink-0 ml-3">
                <div className="text-[10px] text-muted-foreground">Probabilidad</div>
                <div className="text-base font-bold tabular-nums">{contact.probability}%</div>
              </div>
            </div>
          </div>

          {/* Progreso de etapa */}
          <div>
            <div className="text-[10px] text-muted-foreground mb-1.5">Etapa: {contact.stage}</div>
            <div className="flex gap-1">
              {STAGES.map((s, i) => (
                <div
                  key={s}
                  className="flex-1 h-1.5 rounded-full"
                  style={{
                    background:
                      i < stageIdx ? STAGE_CFG[s].text + "80" : i === stageIdx ? STAGE_CFG[s].text : "var(--surface-3)",
                  }}
                  title={s}
                />
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2 text-xs">
            {contact.email && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Email</span>
                <span className="truncate">{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Telefono</span>
                <span>{contact.phone}</span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Fuente</span>
              <span>{contact.source}</span>
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => <Tag key={t} label={t} />)}
            </div>
          )}

          {/* Próxima acción */}
          {contact.nextAction && (
            <div className="rounded-xl shadow-sm p-3 text-xs" style={{ background: "var(--accent-dim)", color: "var(--primary)" }}>
              <div className="text-[10px] opacity-70 mb-0.5">Próxima acción</div>
              {contact.nextAction}
            </div>
          )}

          <Link
            href={`/contacts/${contact.id}`}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full cursor-pointer")}
          >
            <ExternalLink className="h-4 w-4 mr-1.5" /> Ver ficha completa
          </Link>
        </div>
      )}
    </div>
  );
}
