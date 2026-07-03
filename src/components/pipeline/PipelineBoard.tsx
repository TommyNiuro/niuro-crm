"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar } from "@/components/ds";
import { STAGE_PERDIDOS } from "@/lib/crm-ui";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { MessageCircle, Clock, AlertTriangle, TrendingUp, XCircle, ChevronsLeft, ChevronsRight, Info } from "lucide-react";

// Kanban de pipeline reutilizable: lo usan Ventas (contact_type='lead') e
// Ingenieros (contact_type='engineer'). Parametrizado por etapas, config,
// título y el tipo de contacto que filtra.
type StageCfg = { text: string; bg: string; dueInDays: number };

/** Columna virtual para contactos cuya etapa no existe en el pipeline. */
const ORPHAN_COL = "Sin etapa";
const ORPHAN_CFG: StageCfg = { text: "#d97706", bg: "rgba(217,119,6,0.10)", dueInDays: 2 };

interface PipelineBoardProps {
  stages: readonly string[];
  stageCfg: Record<string, StageCfg>;
  emptyHints: Record<string, string>;
  title: string;
  subtitle: string;
  typeFilter: string; // 'lead' | 'engineer'
  showMoney?: boolean;
}

interface Contact {
  id: string;
  name: string;
  company: string | null;
  stage: string;
  temperature: string;
  score: number;
  valueCents: number;
  probability: number;
  online: boolean;
  country: string | null;
  nextAction: string | null;
  nextStepDue: number | string | null;
  lastInteractionAt: number | string | null;
  disqualifyReason: string | null;
  whatsappJid: string | null;
  archived: boolean;
  source: string;
  contactType: string | null;
  stageEnteredAt: string | null;
}

function daysInStage(c: Contact): number | null {
  if (!c.stageEnteredAt) return null;
  const ts = new Date(c.stageEnteredAt).getTime();
  if (isNaN(ts)) return null;
  return Math.floor((Date.now() - ts) / 86_400_000);
}

function stageStaleThreshold(stage: string, cfg: Record<string, StageCfg>): number {
  const due = cfg[stage]?.dueInDays ?? 2;
  return Math.max(7, due * 3);
}

function fmtDue(due: number | string | null): string {
  if (!due) return "";
  const d = new Date(due);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es", { day: "2-digit", month: "short" });
}

function relativeTime(ts: number | string | null): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "hace <1h";
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d}d`;
  if (d < 30) return `hace ${Math.floor(d / 7)}sem`;
  return `hace ${Math.floor(d / 30)}m`;
}

function scoreColor(s: number): string {
  if (s >= 75) return "text-emerald-500";
  if (s >= 50) return "text-amber-500";
  if (s >= 25) return "text-orange-500";
  return "text-destructive";
}

function scoreBg(s: number): string {
  if (s >= 75) return "bg-emerald-500";
  if (s >= 50) return "bg-amber-500";
  if (s >= 25) return "bg-orange-500";
  return "bg-destructive";
}

const TEMP_CFG: Record<string, { label: string; colorClass: string; dot: string }> = {
  hot:  { label: "Caliente", colorClass: "text-red-500",    dot: "bg-red-500" },
  warm: { label: "Tibio",    colorClass: "text-amber-500",  dot: "bg-amber-500" },
  cold: { label: "Frío",     colorClass: "text-blue-500",   dot: "bg-blue-500" },
};

function ContactCard({
  c,
  cfg,
  lost = false,
  dragging = false,
  showMoney = true,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  c: Contact;
  cfg: Record<string, StageCfg>;
  lost?: boolean;
  dragging?: boolean;
  showMoney?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onClick: () => void;
}) {
  // eslint-disable-next-line react-hooks/purity
  const overdue = !!c.nextStepDue && new Date(c.nextStepDue).getTime() < Date.now();
  const atRisk = !lost && (overdue || !c.nextAction);
  const temp = TEMP_CFG[c.temperature] ?? TEMP_CFG.cold;
  const lastInteract = relativeTime(c.lastInteractionAt);
  const stageDays = lost ? null : daysInStage(c);
  const stale = stageDays != null && stageDays > stageStaleThreshold(c.stage, cfg);

  return (
    <div
      role="article"
      tabIndex={0}
      aria-label={`${c.name}${c.company ? ", " + c.company : ""}${atRisk ? " — requiere accion" : ""}`}
      draggable={!lost}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={cn(
        "rounded-xl bg-card border p-3.5 transition-all select-none group",
        lost
          ? "border-border opacity-70 cursor-pointer"
          : "border-border cursor-grab hover:border-border hover:shadow-md active:cursor-grabbing",
        atRisk && "border-l-[3px] border-l-warning",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={c.name} size={32} online={c.online} country={c.country} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[12.5px] font-semibold truncate leading-tight text-foreground">
              {c.name}
            </span>
            {c.source === "whatsapp" && c.whatsappJid && (
              <MessageCircle className="h-3 w-3 shrink-0 text-emerald-500" />
            )}
          </div>
          {c.company && (
            <div className="text-[10.5px] text-muted-foreground truncate leading-tight">{c.company}</div>
          )}
        </div>
        <div className={cn("text-[11px] font-bold tabular-nums shrink-0", scoreColor(c.score))}>
          {c.score}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2">
        <span className={cn("flex items-center gap-1 text-[11px] font-medium", temp.colorClass)}>
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", temp.dot)} />
          {temp.label}
        </span>
        {lastInteract && (
          <>
            <span className="text-border">·</span>
            <span className="text-[11px] text-muted-foreground">{lastInteract}</span>
          </>
        )}
        {stageDays != null && (
          <span
            className={cn(
              "ml-auto flex items-center gap-0.5 text-[10px] font-medium tabular-nums px-1.5 py-px rounded-full shrink-0",
              stale ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
            )}
            title={stale ? `Lleva ${stageDays} días en ${c.stage} — estancado` : `${stageDays} días en ${c.stage}`}
          >
            <Clock className="h-2.5 w-2.5" />
            {stageDays}d
          </span>
        )}
      </div>

      {lost ? (
        c.disqualifyReason ? (
          <div className="mt-2 flex items-start gap-1 text-[10.5px] text-muted-foreground">
            <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{c.disqualifyReason}</span>
          </div>
        ) : null
      ) : (
        <div className="mt-2 min-h-[16px]">
          {c.nextAction ? (
            <div className="flex items-center gap-1 text-[10.5px]">
              <Clock className={cn("h-3 w-3 shrink-0", overdue ? "text-warning" : "text-muted-foreground")} />
              <span className={cn("truncate", overdue ? "text-warning font-medium" : "text-muted-foreground")}>
                {c.nextAction}
              </span>
              {c.nextStepDue && (
                <span className={cn("shrink-0 tabular-nums ml-auto text-[11px]", overdue ? "text-warning font-semibold" : "text-muted-foreground")}>
                  {fmtDue(c.nextStepDue)}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[10.5px] text-warning">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>Sin próximo paso</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2.5">
        {showMoney && (
          <span className={cn(
            "text-[12px] font-bold tabular-nums",
            c.valueCents ? "text-emerald-500" : "text-muted-foreground"
          )}>
            {c.valueCents ? formatCurrency(c.valueCents) : "Sin monto"}
          </span>
        )}
        <div className="flex-1 flex items-center gap-1.5 justify-end">
          <div className="h-1 w-10 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", scoreBg(c.score))}
              style={{ width: `${c.score}%` }}
            />
          </div>
          {!lost && (
            <div className="flex items-center gap-0.5">
              <TrendingUp className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground tabular-nums">{c.probability}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PipelineBoard({ stages, stageCfg, emptyHints, title, subtitle, typeFilter, showMoney = true }: PipelineBoardProps) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (stage: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });

  useEffect(() => {
    // El filtro por tipo corre en la API (antes traía 1000 contactos de todos
    // los tipos y filtraba en el navegador).
    fetch(`/api/contacts?includeArchived=1&limit=1000&type=${encodeURIComponent(typeFilter)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setContacts(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [typeFilter]);

  const move = async (id: string, stage: string) => {
    const snapshot = contacts;
    const payload = stage === STAGE_PERDIDOS ? { archived: true } : { stage };
    setContacts((prev) =>
      prev.map((c) =>
        c.id === id
          ? stage === STAGE_PERDIDOS
            ? { ...c, archived: true }
            : { ...c, stage, archived: false }
          : c
      )
    );
    try {
      const r = await fetch(`/api/contacts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (err) {
      console.error("[pipeline] move falló:", err);
      setContacts(snapshot);
      toast.error("No se pudo mover el contacto — cambio revertido");
    }
  };

  const activeContacts = contacts.filter((c) => !c.archived);
  const lostContacts   = contacts.filter((c) => c.archived);
  const staleCount     = activeContacts.filter((c) => {
    const d = daysInStage(c);
    return d != null && d > stageStaleThreshold(c.stage, stageCfg);
  }).length;
  const totalPipeline  = activeContacts.reduce((a, c) => a + (c.valueCents || 0), 0);
  const totalWeighted  = activeContacts.reduce((a, c) => a + (c.valueCents || 0) * (c.probability || 0) / 100, 0);
  const totalWithValue = activeContacts.filter((c) => c.valueCents > 0).length;

  // Huérfanos: contactos vivos cuya etapa ya no existe en este pipeline
  // (etapa renombrada/borrada en Ajustes, o migración). Antes desaparecían del
  // kanban sin aviso; ahora tienen su propia columna y se arrastran a una real.
  const knownStages = new Set(stages);
  const orphans = activeContacts.filter((c) => !knownStages.has(c.stage));

  const allCols: Array<{ key: string; isLost: boolean; isOrphan?: boolean }> = [
    ...stages.map((s) => ({ key: s, isLost: false })),
    ...(orphans.length ? [{ key: ORPHAN_COL, isLost: false, isOrphan: true }] : []),
    { key: STAGE_PERDIDOS, isLost: true },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-4 text-right">
          {showMoney ? (
            <>
              <div>
                <div className="text-[11px] text-muted-foreground">Pipeline total</div>
                <div className="text-[14px] font-bold text-emerald-500 tabular-nums">{formatCurrency(totalPipeline)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Ponderado</div>
                <div className="text-[14px] font-bold tabular-nums text-foreground">{formatCurrency(totalWeighted)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Con monto</div>
                <div className="text-[14px] font-bold tabular-nums">{totalWithValue}</div>
              </div>
            </>
          ) : (
            <div>
              <div className="text-[11px] text-muted-foreground">Total</div>
              <div className="text-[14px] font-bold tabular-nums text-foreground">{activeContacts.length}</div>
            </div>
          )}
          {staleCount > 0 && (
            <div title="Contactos que exceden 3x el SLA de su etapa">
              <div className="text-[11px] text-muted-foreground">Estancados</div>
              <div className="text-[14px] font-bold tabular-nums text-warning">{staleCount}</div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div role="status" aria-label="Cargando pipeline..." aria-busy="true" className="flex-1 p-5 flex gap-3">
          {allCols.map((c) => (
            <div key={c.key} className="flex-1 h-32 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex gap-3 p-5 overflow-x-auto">
          {allCols.map(({ key: stage, isLost, isOrphan }) => {
            const cfg = isOrphan ? ORPHAN_CFG : stageCfg[stage];
            const items = isLost
              ? lostContacts
              : isOrphan
                ? orphans
                : activeContacts.filter((c) => c.stage === stage);
            const total = items.reduce((a, c) => a + (c.valueCents || 0), 0);
            const weighted = isLost
              ? 0
              : items.reduce((a, c) => a + (c.valueCents || 0) * (c.probability || 0) / 100, 0);
            const weightedPct = total > 0 ? Math.round((weighted / total) * 100) : 0;
            const isCollapsed = collapsed.has(stage);

            if (isCollapsed) {
              return (
                <div
                  key={stage}
                  role="button"
                  tabIndex={0}
                  aria-expanded={false}
                  aria-label={`Expandir columna ${stage}, ${items.length} contactos`}
                  onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    // A "Sin etapa" no se puede soltar: es virtual, no una etapa real.
                    if (dragId && !isOrphan) move(dragId, stage);
                    setDragId(null);
                    setOverStage(null);
                  }}
                  className={cn(
                    "flex flex-col items-center rounded-lg border bg-muted/40 border-border shrink-0 w-11 py-3 cursor-pointer hover:bg-muted/70 transition-colors",
                    overStage === stage && "ring-2 ring-primary/40",
                  )}
                  onClick={() => toggleCollapse(stage)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCollapse(stage); } }}
                  title={`Expandir ${stage}`}
                >
                  <ChevronsRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 flex items-center justify-center">
                    <span
                      className="text-[12px] font-semibold whitespace-nowrap [writing-mode:vertical-rl] rotate-180"
                      style={cfg ? { color: cfg.text } : undefined}
                    >
                      {stage}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold tabular-nums text-muted-foreground shrink-0">{items.length}</span>
                </div>
              );
            }

            return (
              <div
                key={stage}
                onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
                onDragEnter={(e) => { e.preventDefault(); setOverStage(stage); }}
                onDragLeave={(e) => {
                  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node))
                    setOverStage((s) => (s === stage ? null : s));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  // A "Sin etapa" no se puede soltar: es virtual, no una etapa real.
                  if (dragId && !isOrphan) move(dragId, stage);
                  setDragId(null);
                  setOverStage(null);
                }}
                className={cn(
                  "flex flex-col rounded-lg border transition-all",
                  isLost
                    ? "min-w-[250px] w-[250px] bg-muted/30 border-border/60"
                    : "flex-1 min-w-[230px] bg-card border-border",
                  overStage === stage && "ring-2 ring-[var(--hs-accent,theme(colors.sky.500))]/50 border-[var(--hs-accent,theme(colors.sky.500))]/50",
                )}
              >
                <div
                  className="px-3.5 py-2.5 border-b-2 rounded-t-lg"
                  style={cfg ? { borderBottomColor: cfg.text, background: cfg.bg } : { borderBottomColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn("text-[12.5px] font-bold uppercase tracking-wide truncate", isLost && "text-muted-foreground")}
                      style={cfg ? { color: cfg.text } : undefined}
                    >
                      {stage}
                    </span>
                    <span
                      className="text-[11px] font-bold rounded-full px-1.5 py-0.5 tabular-nums shrink-0"
                      style={cfg ? { color: cfg.text, background: "var(--card)" } : { color: "var(--muted-foreground)", background: "var(--card)" }}
                    >
                      {items.length}
                    </span>
                    <button
                      onClick={() => toggleCollapse(stage)}
                      aria-expanded={true}
                      aria-label={`Colapsar columna ${stage}`}
                      className="ml-auto p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
                      title={`Colapsar ${stage}`}
                    >
                      <ChevronsLeft className="h-3.5 w-3.5" style={cfg ? { color: cfg.text } : undefined} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
                  {isOrphan && (
                    <p className="text-[10.5px] leading-snug text-warning px-1.5 pt-1">
                      Su etapa fue renombrada o borrada. Arrastrá cada contacto a su etapa actual.
                    </p>
                  )}
                  {items.length === 0 ? (
                    <p className="text-center text-[11px] text-muted-foreground py-6 px-3 leading-snug">
                      {emptyHints[stage] ?? "Nada aquí todavía."}
                    </p>
                  ) : (
                    items.map((c) => (
                      <ContactCard
                        key={c.id}
                        c={c}
                        cfg={stageCfg}
                        lost={isLost}
                        showMoney={showMoney}
                        dragging={dragId === c.id}
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => router.push(`/contacts/${c.id}`)}
                      />
                    ))
                  )}
                </div>

                <div className="border-t border-border px-3.5 py-2 bg-muted/20 rounded-b-lg space-y-0.5">
                  {showMoney ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-bold tabular-nums text-foreground">
                          {total ? formatCurrency(total) : "$0"}
                        </span>
                        <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-medium">Total</span>
                      </div>
                      {!isLost && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {weighted ? formatCurrency(weighted) : "$0"}
                            {weighted > 0 && <span className="text-[11px] ml-1">({weightedPct}%)</span>}
                          </span>
                          <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-0.5">
                            Ponderado
                            <Info className="h-2.5 w-2.5" />
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold tabular-nums text-foreground">{items.length}</span>
                      <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground font-medium">Ingenieros</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
