"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Avatar } from "@/components/ds";
import { STAGE_PERDIDOS } from "@/lib/crm-ui";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { MessageCircle, Clock, AlertTriangle, XCircle, ChevronsLeft, ChevronsRight, Info } from "lucide-react";

// Kanban de pipeline reutilizable: lo usan Ventas (contact_type='lead'),
// Clientes ('client') e Ingenieros ('engineer'). Las etapas llegan de la DB
// (nombre + color); stageCfg es un override opcional para las del playbook.
type StageCfg = { text: string; bg: string; dueInDays: number };
type StageDef = { name: string; color: string; isWon?: boolean };

/** Columna virtual para contactos cuya etapa no existe en el pipeline. */
const ORPHAN_COL = "Sin etapa";
const ORPHAN_CFG: StageCfg = { text: "#d97706", bg: "rgba(217,119,6,0.10)", dueInDays: 2 };

/** #rrggbb -> rgba con alpha; inválido cae en gris neutro. */
function hexA(hex: string, a: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex || "");
  if (!m) return "rgba(148,163,184,0.12)";
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

interface PipelineBoardProps {
  stages: StageDef[];
  /** overrides del playbook por nombre de etapa; las demás derivan del color de la DB */
  stageCfg?: Record<string, StageCfg>;
  emptyHints: Record<string, string>;
  title: string;
  subtitle: string;
  typeFilter: string; // 'lead' | 'client' | 'engineer'
  showMoney?: boolean;
  /** 'engineer' y 'client' quitan la semántica de venta de la tarjeta
   *  (temperatura, warning de próximo paso, probabilidad). 'client' además
   *  cambia el header a métricas post-venta. Default: 'sales'. */
  variant?: "sales" | "client" | "engineer";
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

const TEMP_CFG: Record<string, { label: string; colorClass: string; dot: string }> = {
  hot:  { label: "Caliente", colorClass: "text-red-500",    dot: "bg-red-500" },
  warm: { label: "Tibio",    colorClass: "text-amber-500",  dot: "bg-amber-500" },
  cold: { label: "Frío",     colorClass: "text-blue-500",   dot: "bg-blue-500" },
};

function ContactCard({
  c,
  cfg,
  lost = false,
  showMoney = true,
  variant = "sales",
  onClick,
}: {
  c: Contact;
  cfg: Record<string, StageCfg>;
  lost?: boolean;
  showMoney?: boolean;
  variant?: "sales" | "client" | "engineer";
  onClick: () => void;
}) {
  // dnd-kit en vez de drag nativo HTML5: WKWebView (la app de escritorio,
  // Tauri en macOS) no soporta bien el drag-and-drop nativo del navegador —
  // funcionaba en Chrome pero la tarjeta rebotaba sin más en la app
  // (auditoría 2026-07-04). dnd-kit usa eventos de puntero, no la API nativa.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: c.id,
    disabled: lost,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;
  // Fuera de ventas (ingeniero/cliente) la tarjeta pierde la semántica de
  // venta: ni temperatura ni warning por falta de próximo paso (las tareas
  // llegan al mover de etapa); solo el vencimiento real es riesgo.
  const sales = variant === "sales";
  // eslint-disable-next-line react-hooks/purity
  const overdue = !!c.nextStepDue && new Date(c.nextStepDue).getTime() < Date.now();
  const atRisk = !lost && (overdue || (sales && !c.nextAction));
  const temp = TEMP_CFG[c.temperature] ?? TEMP_CFG.cold;
  const lastInteract = relativeTime(c.lastInteractionAt);
  const stageDays = lost ? null : daysInStage(c);
  const stale = stageDays != null && stageDays > stageStaleThreshold(c.stage, cfg);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="article"
      tabIndex={0}
      aria-label={`${c.name}${c.company ? ", " + c.company : ""}${atRisk ? " — requiere accion" : ""}`}
      onClick={() => !isDragging && onClick()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={cn(
        "rounded-xl bg-card border p-3.5 transition-all select-none group",
        lost
          ? "border-border opacity-70 cursor-pointer"
          : "border-border cursor-grab hover:border-border hover:shadow-md active:cursor-grabbing",
        atRisk && "border-l-[3px] border-l-warning",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={c.name} size={32} online={c.online} country={c.country} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[12.5px] font-semibold truncate leading-tight text-foreground">
              {c.name}
            </span>
          </div>
          {c.company && (
            <div className="text-[10.5px] text-muted-foreground truncate leading-tight">{c.company}</div>
          )}
        </div>
        {c.whatsappJid && (
          <a
            href={`/whatsapp?chat=${encodeURIComponent(c.whatsappJid)}`}
            onClick={(e) => e.stopPropagation()}
            title="Abrir chat de WhatsApp"
            aria-label={`Abrir chat de WhatsApp con ${c.name}`}
            className="shrink-0 p-1 -m-0.5 rounded-md text-emerald-500 hover:bg-emerald-500/10"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-2">
        {sales && (
          <span className={cn("flex items-center gap-1 text-[11px] font-medium", temp.colorClass)}>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", temp.dot)} />
            {temp.label}
          </span>
        )}
        {lastInteract && (
          <>
            {sales && <span className="text-border">·</span>}
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
          ) : !sales ? null : (
            <div className="flex items-center gap-1 text-[10.5px] text-warning">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>Sin próximo paso</span>
            </div>
          )}
        </div>
      )}

      {showMoney && (
        <div className="flex items-center gap-1.5 mt-2.5">
          <span className={cn(
            "text-[12px] font-bold tabular-nums",
            c.valueCents ? "text-emerald-500" : "text-muted-foreground"
          )}>
            {c.valueCents ? formatCurrency(c.valueCents) : "Sin monto"}
          </span>
          {!lost && sales && c.valueCents > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">· {c.probability}% prob.</span>
          )}
        </div>
      )}
    </div>
  );
}

export function PipelineBoard({ stages, stageCfg, emptyHints, title, subtitle, typeFilter, showMoney = true, variant = "sales" }: PipelineBoardProps) {
  const router = useRouter();
  // Config visual efectiva: override del playbook si existe, si no deriva del
  // color que la etapa tiene en la DB (editable en Ajustes).
  const stageNames = stages.map((s) => s.name);
  const wonStages = new Set(stages.filter((s) => s.isWon).map((s) => s.name));
  const cfgMap: Record<string, StageCfg> = Object.fromEntries(
    stages.map((s) => [
      s.name,
      stageCfg?.[s.name] ?? { text: s.color, bg: hexA(s.color, 0.10), dueInDays: 2 },
    ])
  );
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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
      // Negocio ganado: ofrecer pasarlo al post-venta. El PUT con contactType
      // resetea etapa a la primera del pipeline nuevo (Onboarding) y registra
      // la transición (ver /api/contacts/[id]).
      if (typeFilter === "lead" && wonStages.has(stage)) {
        const c = contacts.find((x) => x.id === id);
        toast.success(`Negocio ganado${c ? `: ${c.name}` : ""} 🎉`, {
          description: "¿Pasarlo a Clientes para el post-venta (Onboarding)?",
          duration: 12000,
          action: {
            label: "Convertir en cliente",
            onClick: async () => {
              try {
                const rc = await fetch(`/api/contacts/${id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ contactType: "client" }),
                });
                if (!rc.ok) throw new Error(`HTTP ${rc.status}`);
                setContacts((prev) => prev.filter((x) => x.id !== id));
                toast.success("Ahora vive en Clientes, arrancando en Onboarding");
              } catch {
                toast.error("No se pudo convertir el contacto");
              }
            },
          },
        });
      }
    } catch (err) {
      console.error("[pipeline] move falló:", err);
      setContacts(snapshot);
      toast.error("No se pudo mover el contacto — cambio revertido");
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    // Sin target (soltó fuera de cualquier columna droppable, o en la
    // columna huérfana que queda deshabilitada) no hay nada que mover.
    if (!e.over) return;
    move(String(e.active.id), String(e.over.id));
  };

  const activeContacts = contacts.filter((c) => !c.archived);
  const lostContacts   = contacts.filter((c) => c.archived);
  const staleCount     = activeContacts.filter((c) => {
    const d = daysInStage(c);
    return d != null && d > stageStaleThreshold(c.stage, cfgMap);
  }).length;
  const totalPipeline  = activeContacts.reduce((a, c) => a + (c.valueCents || 0), 0);
  const totalWeighted  = activeContacts.reduce((a, c) => a + (c.valueCents || 0) * (c.probability || 0) / 100, 0);
  const totalWithValue = activeContacts.filter((c) => c.valueCents > 0).length;
  // Post-venta: clientes en la etapa de riesgo (si fue renombrada sin "riesgo"
  // en el nombre, el bloque del header simplemente no se muestra).
  const riskStage = variant === "client" ? stageNames.find((n) => /riesgo/i.test(n)) : undefined;
  const riskCount = riskStage ? activeContacts.filter((c) => c.stage === riskStage).length : 0;

  // Huérfanos: contactos vivos cuya etapa ya no existe en este pipeline
  // (etapa renombrada/borrada en Ajustes, o migración). Antes desaparecían del
  // kanban sin aviso; ahora tienen su propia columna y se arrastran a una real.
  const knownStages = new Set(stageNames);
  const orphans = activeContacts.filter((c) => !knownStages.has(c.stage));

  const allCols: Array<{ key: string; isLost: boolean; isOrphan?: boolean }> = [
    ...stageNames.map((s) => ({ key: s, isLost: false })),
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
          {variant === "client" ? (
            // Post-venta: acá la plata YA entra; "ponderado por probabilidad"
            // no significa nada. Revenue actual + volumen + riesgo de churn.
            <>
              <div>
                <div className="text-[11px] text-muted-foreground">Revenue</div>
                <div className="text-[14px] font-bold text-emerald-500 tabular-nums">{formatCurrency(totalPipeline)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Clientes</div>
                <div className="text-[14px] font-bold tabular-nums text-foreground">{activeContacts.length}</div>
              </div>
              {riskCount > 0 && (
                <div>
                  <div className="text-[11px] text-muted-foreground">En riesgo</div>
                  <div className="text-[14px] font-bold tabular-nums text-destructive">{riskCount}</div>
                </div>
              )}
            </>
          ) : showMoney ? (
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
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex-1 min-h-0 flex gap-3 p-5 overflow-x-auto">
            {allCols.map(({ key: stage, isLost, isOrphan }) => {
              const cfg = isOrphan ? ORPHAN_CFG : cfgMap[stage];
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

              return (
                <Column
                  key={stage}
                  stage={stage}
                  isLost={isLost}
                  isOrphan={isOrphan}
                  cfg={cfg}
                  items={items}
                  total={total}
                  weighted={weighted}
                  weightedPct={weightedPct}
                  isCollapsed={isCollapsed}
                  showMoney={showMoney}
                  variant={variant}
                  cfgMap={cfgMap}
                  emptyHint={emptyHints[stage]}
                  toggleCollapse={toggleCollapse}
                  onOpen={(id) => router.push(`/contacts/${id}`)}
                />
              );
            })}
          </div>
        </DndContext>
      )}
    </div>
  );
}

function Column({
  stage,
  isLost,
  isOrphan,
  cfg,
  items,
  total,
  weighted,
  weightedPct,
  isCollapsed,
  showMoney,
  variant,
  cfgMap,
  emptyHint,
  toggleCollapse,
  onOpen,
}: {
  stage: string;
  isLost: boolean;
  isOrphan?: boolean;
  cfg: StageCfg | undefined;
  items: Contact[];
  total: number;
  weighted: number;
  weightedPct: number;
  isCollapsed: boolean;
  showMoney: boolean;
  variant: "sales" | "client" | "engineer";
  cfgMap: Record<string, StageCfg>;
  emptyHint: string | undefined;
  toggleCollapse: (stage: string) => void;
  onOpen: (id: string) => void;
}) {
  // La columna huérfana ("Sin etapa") es virtual, no una etapa real: no se
  // puede soltar ahí, solo arrastrar los contactos QUE YA están ahí hacia
  // afuera. disabled:true hace que dnd-kit nunca la registre como `over`.
  const { setNodeRef, isOver } = useDroppable({ id: stage, disabled: isOrphan });

  if (isCollapsed) {
    return (
      <div
        ref={setNodeRef}
        role="button"
        tabIndex={0}
        aria-expanded={false}
        aria-label={`Expandir columna ${stage}, ${items.length} contactos`}
        className={cn(
          "flex flex-col items-center rounded-lg border bg-muted/40 border-border shrink-0 w-11 py-3 cursor-pointer hover:bg-muted/70 transition-colors",
          isOver && "ring-2 ring-primary/40",
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
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-lg border transition-all",
        isLost
          ? "min-w-[250px] w-[250px] bg-muted/30 border-border/60"
          : "flex-1 min-w-[230px] bg-card border-border",
        isOver && "ring-2 ring-[var(--hs-accent,theme(colors.sky.500))]/50 border-[var(--hs-accent,theme(colors.sky.500))]/50",
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
            {emptyHint ?? "Nada aquí todavía."}
          </p>
        ) : (
          items.map((c) => (
            <ContactCard
              key={c.id}
              c={c}
              cfg={cfgMap}
              lost={isLost}
              showMoney={showMoney}
              variant={variant}
              onClick={() => onOpen(c.id)}
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
            {!isLost && variant === "sales" && (
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
}
