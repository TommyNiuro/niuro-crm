"use client";

/**
 * Prospección: cockpit de outreach a empresas que están contratando talento
 * tech (alimentado a diario por scan-prospects.ts). Página dedicada (no
 * record-view genérico): KPIs de triage, pestañas por estado, filas densas con
 * acciones rápidas y panel de detalle con vacantes, contacto Apollo y los dos
 * mensajes de outreach.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRightCircle,
  Briefcase,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Flame,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  RotateCcw,
  Search,
  LayoutList,
  Columns3,
  MapPin,
  Sparkles,
  UserSearch,
  Users,
  X,
  Clock,
  Download,
  SlidersHorizontal,
  History,
  Globe2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { openExternal } from "@/lib/open-external";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface Prospect {
  id: string;
  company: string;
  domain: string | null;
  sources: string | null;
  jobCount: number;
  roles: string | null;
  jobs: string | null; // JSON [{title,url,source}]
  stack: string | null;
  seniority: string | null;
  countries: string | null;
  remote: boolean;
  minSalary: number | null;
  maxSalary: number | null;
  daysOpen: number;
  urgency: "baja" | "media" | "alta";
  score: number;
  isOpen: boolean;
  status: "new" | "enriched" | "contacted" | "conversation" | "discarded";
  url: string | null;
  knownContactId: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactLinkedin: string | null;
  altContacts: string | null; // JSON [{name,title,email,linkedin}]
  scoreBreakdown: string | null; // JSON ScoreBreakdown
  contactLog: string | null; // JSON number[] (timestamps ms de cada vez contactada)
  snoozedUntil: number | null;
  linkedinCompanyInfo: string | null; // JSON {industry,size,headquarters,founded,description,fetchedAt}
  apolloEnrichedAt: number | null;
  msgConnect: string | null;
  msgPitch: string | null;
  createdAt: number;
}

const TABS = [
  { key: "new", label: "Nuevas" },
  { key: "enriched", label: "Enriquecidas" },
  { key: "contacted", label: "Contactadas" },
  { key: "conversation", label: "En conversación" },
  { key: "discarded", label: "Descartadas" },
  { key: "all", label: "Todas" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Columnas del embudo de contacto (descartadas queda fuera: vive en la lista).
const FUNNEL_COLS = [
  { key: "new", label: "Para contactar", color: "#3B5FE5" },
  { key: "enriched", label: "Con decisor", color: "#06b6d4" },
  { key: "contacted", label: "Contactada", color: "#D4940A" },
  { key: "conversation", label: "En conversación", color: "#16A34A" },
] as const;

const URGENCY_STYLE: Record<string, string> = {
  alta: "bg-red-500/10 text-red-600 dark:text-red-400",
  media: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  baja: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Nueva",
  enriched: "Enriquecida",
  contacted: "Contactada",
  conversation: "En conversación",
  discarded: "Descartada",
};

const j = (s: string | null): string[] => {
  try { return s ? (JSON.parse(s) as string[]) : []; } catch { return []; }
};

const scoreColor = (s: number) =>
  s >= 80 ? "text-red-500" : s >= 60 ? "text-amber-500" : "text-slate-400";

function contactLogSummary(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const log = JSON.parse(raw) as number[];
    if (!Array.isArray(log) || log.length === 0) return null;
    const last = Math.max(...log);
    const days = Math.max(0, Math.round((Date.now() - last) / 86400000));
    const n = log.length;
    return `${n} contacto${n !== 1 ? "s" : ""} · último hace ${days}d`;
  } catch { return null; }
}

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copiado`),
    () => toast.error("No se pudo copiar")
  );
}

/** Anillo de score estilo ficha de contacto: SVG chico con el número adentro. */
function scoreTooltip(score: number, raw: string | null): string {
  if (!raw) return `Score ${score}`;
  try {
    const b = JSON.parse(raw) as Record<string, number>;
    return [
      `Score ${score}/100`,
      `Base: ${b.base}`,
      `Vacantes: +${b.jobCount}`,
      `Días sin llenar: +${b.daysOpen}`,
      `Stack Niuro: +${b.stack}`,
      `Seniority: +${b.seniority}`,
      `LATAM explícito: +${b.latam}`,
      `Ya en el CRM: +${b.knownContact}`,
    ].join("\n");
  } catch { return `Score ${score}`; }
}

function ScoreRing({ score, breakdown }: { score: number; breakdown?: string | null }) {
  const r = 15, c = 2 * Math.PI * r;
  return (
    <div className="relative h-10 w-10 shrink-0" title={scoreTooltip(score, breakdown ?? null)}>
      <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="18" cy="18" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          className={cn("transition-all", score >= 80 ? "stroke-red-500" : score >= 60 ? "stroke-amber-500" : "stroke-slate-400")}
        />
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums", scoreColor(score))}>
        {score}
      </span>
    </div>
  );
}

function ApolloConfigDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "apollo_api_key", value: value.trim() }),
    }).finally(() => setSaving(false));
    if (res.ok) {
      toast.success("Apollo conectado");
      onSaved();
      onClose();
    } else toast.error("No se pudo guardar la key");
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar Apollo</DialogTitle>
          <DialogDescription>
            La key vive cifrada en tu Mac y nunca sale del CRM. La sacás de Apollo →
            Settings → Integrations → API.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="API key de Apollo"
          onKeyDown={(e) => e.key === "Enter" && value.trim() && save()}
        />
        <Button onClick={save} disabled={!value.trim() || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function ProspectingPage() {
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("new");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"score" | "daysOpen" | "jobCount">("score");
  const [view, setView] = useState<"lista" | "embudo">("lista");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fCountry, setFCountry] = useState("");
  const [fSource, setFSource] = useState("");
  const [fRemote, setFRemote] = useState<"" | "remote" | "onsite">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({}); // id -> acción en curso
  const [apolloSet, setApolloSet] = useState<boolean | null>(null);
  const [apolloDialog, setApolloDialog] = useState(false);

  const load = () =>
    fetch("/api/prospects")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => toast.error("No se pudieron cargar los prospectos"))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);
  useEffect(() => {
    fetch("/api/settings?key=apollo_api_key")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setApolloSet(!!d?.set))
      .catch(() => {});
  }, []);

  const filterOptions = useMemo(() => {
    const countries = new Set<string>();
    const sourcesSet = new Set<string>();
    for (const r of rows) {
      j(r.countries).forEach((c) => countries.add(c));
      j(r.sources).forEach((s) => sourcesSet.add(s));
    }
    return { countries: [...countries].sort(), sources: [...sourcesSet].sort() };
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const kpis = useMemo(() => {
    const active = rows.filter((r) => r.status !== "discarded");
    return {
      abiertas: active.filter((r) => r.isOpen).length,
      urgentes: active.filter((r) => r.urgency === "alta" && r.isOpen).length,
      vacantes: active.reduce((s, r) => s + (r.isOpen ? r.jobCount : 0), 0),
      conContacto: rows.filter((r) => r.contactName).length,
    };
  }, [rows]);

  const visible = useMemo(() => {
    let list = tab === "all" ? rows : rows.filter((r) => r.status === tab);
    // Pospuestas: ocultas de las pestañas activas hasta que venza la fecha
    // (mejora #15). En "Todas" siguen visibles para no esconder nada del todo.
    if (tab !== "all") {
      const now = Date.now();
      list = list.filter((r) => !r.snoozedUntil || r.snoozedUntil <= now);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((r) =>
        [r.company, r.roles ?? "", r.stack ?? "", r.contactName ?? ""].join(" ").toLowerCase().includes(q)
      );
    }
    if (fCountry) list = list.filter((r) => j(r.countries).includes(fCountry));
    if (fSource) list = list.filter((r) => j(r.sources).includes(fSource));
    if (fRemote === "remote") list = list.filter((r) => r.remote);
    if (fRemote === "onsite") list = list.filter((r) => !r.remote);
    return [...list].sort((a, b) => (b[sort] as number) - (a[sort] as number));
  }, [rows, tab, query, sort, fCountry, fSource, fRemote]);

  const activeFilterCount = [fCountry, fSource, fRemote].filter(Boolean).length;

  // Exportar CSV de lo visible (mejora #14): columnas planas, sin JSON crudo.
  const exportCsv = () => {
    const header = ["Empresa", "Score", "Urgencia", "Estado", "Vacantes", "Días abierta", "Roles", "País", "Decisor", "Email", "URL"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [header.join(",")];
    for (const r of visible) {
      lines.push([
        r.company, String(r.score), r.urgency, STATUS_LABEL[r.status] ?? r.status,
        String(r.jobCount), String(r.daysOpen), j(r.roles).join("; "),
        j(r.countries).join("; "), r.contactName ?? "", r.contactEmail ?? "", r.url ?? "",
      ].map((v) => esc(String(v))).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prospeccion-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // ---------- acciones ----------

  const run = async (id: string, action: string, fn: () => Promise<Response>) => {
    setBusy((b) => ({ ...b, [id]: action }));
    try {
      const res = await fn();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || "Falló la acción");
      await load();
      return body;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falló la acción");
      throw e;
    } finally {
      setBusy((b) => {
        const rest = { ...b };
        delete rest[id];
        return rest;
      });
    }
  };

  const enrich = (p: Prospect) => {
    if (apolloSet === false) { setApolloDialog(true); return; }
    run(p.id, "enrich", () => fetch(`/api/prospects/${p.id}/enrich`, { method: "POST" }))
      .then(() => toast.success(`Contacto encontrado en ${p.company}`))
      .catch(() => {});
  };

  const genMessages = (p: Prospect) => {
    toast.info("Generando mensajes con IA (30-60s)...");
    run(p.id, "messages", () => fetch(`/api/prospects/${p.id}/messages`, { method: "POST" }))
      .then(() => toast.success("Mensajes listos"))
      .catch(() => {});
  };

  const convert = (p: Prospect) =>
    run(p.id, "convert", () => fetch(`/api/prospects/${p.id}/convert`, { method: "POST" }))
      .then(() => toast.success(`${p.company} ahora es lead del Pipeline`))
      .catch(() => {});

  const setStatus = (p: Prospect, status: string) =>
    run(p.id, "status", () =>
      fetch(`/api/prospects/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
    ).catch(() => {});

  const linkedinEnrich = (p: Prospect) => {
    toast.info("Buscando la empresa en LinkedIn...");
    run(p.id, "linkedin", () => fetch(`/api/prospects/${p.id}/linkedin`, { method: "POST" }))
      .then(() => toast.success(`Info de ${p.company} lista`))
      .catch(() => {});
  };

  const snooze = (p: Prospect, days: number) =>
    run(p.id, "snooze", () =>
      fetch(`/api/prospects/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozedUntil: Date.now() + days * 86400000 }),
      })
    ).then(() => toast.success(`${p.company} pospuesta ${days} días`)).catch(() => {});

  const saveMsg = (p: Prospect, field: "msgConnect" | "msgPitch", value: string) =>
    fetch(`/api/prospects/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    }).then((r) => {
      if (r.ok) setRows((rs) => rs.map((x) => (x.id === p.id ? { ...x, [field]: value } : x)));
    });

  // ---------- render ----------

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header: título + Apollo + búsqueda + orden */}
      <div className="flex items-center gap-3 px-6 pt-5 pb-3 shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight">Prospección</h1>
          <p className="text-[12.5px] text-muted-foreground truncate">
            Empresas contratando talento tech en LATAM, detectadas a diario en 4 bolsas de trabajo
          </p>
        </div>
        {apolloSet === false && (
          <Button variant="outline" size="sm" onClick={() => setApolloDialog(true)} className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> Conectar Apollo
          </Button>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar empresa, rol, stack..."
            className="h-8 w-56 rounded-lg border border-border bg-card pl-8 pr-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-8 rounded-lg border border-border bg-card px-2 text-[12.5px] text-muted-foreground cursor-pointer"
        >
          <option value="score">Por score</option>
          <option value="daysOpen">Por días abierta</option>
          <option value="jobCount">Por vacantes</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFiltersOpen((v) => !v)}
          className={cn("gap-1.5", activeFilterCount > 0 && "border-primary text-primary")}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
          {activeFilterCount > 0 && (
            <span className="text-[10px] font-bold rounded-full px-1.5 bg-primary text-primary-foreground">{activeFilterCount}</span>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5" title="Exportar la lista visible a CSV">
          <Download className="h-3.5 w-3.5" /> Exportar
        </Button>
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          {([["lista", LayoutList], ["embudo", Columns3]] as const).map(([v, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              title={v === "lista" ? "Vista lista" : "Vista embudo"}
              className={cn(
                "h-7 px-2.5 rounded-md flex items-center gap-1.5 text-[12px] capitalize cursor-pointer transition-colors",
                view === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {v}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros avanzados (mejora #12): país, fuente, remoto/on-site */}
      {filtersOpen && (
        <div className="flex items-center gap-2 px-6 pb-3 shrink-0">
          <select value={fCountry} onChange={(e) => setFCountry(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-[12.5px] cursor-pointer">
            <option value="">Todos los países</option>
            {filterOptions.countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={fSource} onChange={(e) => setFSource(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-[12.5px] cursor-pointer">
            <option value="">Todas las fuentes</option>
            {filterOptions.sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={fRemote} onChange={(e) => setFRemote(e.target.value as typeof fRemote)} className="h-8 rounded-lg border border-border bg-card px-2 text-[12.5px] cursor-pointer">
            <option value="">Remoto y presencial</option>
            <option value="remote">Solo remoto</option>
            <option value="onsite">Solo presencial</option>
          </select>
          {activeFilterCount > 0 && (
            <button onClick={() => { setFCountry(""); setFSource(""); setFRemote(""); }} className="text-[12px] text-muted-foreground hover:text-foreground cursor-pointer">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 px-6 pb-3 shrink-0">
        {[
          { label: "Empresas buscando", value: kpis.abiertas, icon: Building2 },
          { label: "Urgencia alta", value: kpis.urgentes, icon: Flame, hot: kpis.urgentes > 0 },
          { label: "Vacantes abiertas", value: kpis.vacantes, icon: Briefcase },
          { label: "Con decisor identificado", value: kpis.conContacto, icon: Users },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
              k.hot ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground")}>
              <k.icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[20px] font-semibold leading-6 tabular-nums">{k.value}</div>
              <div className="text-[11.5px] text-muted-foreground truncate">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs (solo lista; el embudo ya muestra los estados como columnas) */}
      {view === "lista" && (
      <div className="flex items-center gap-1 px-6 pb-2 shrink-0">
        {TABS.map((t) => {
          const active = tab === t.key;
          const n = counts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={active}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[13px] cursor-pointer flex items-center gap-1.5 transition-colors",
                active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {t.label}
              <span className={cn("text-[11px] font-bold tabular-nums rounded-full px-1.5", active ? "bg-card" : "bg-muted")}>
                {n}
              </span>
            </button>
          );
        })}
      </div>
      )}

      {/* Embudo de contacto: columnas por estado, drag & drop */}
      {view === "embudo" && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-6 pb-6">
          {/* Conversión entre etapas: cuántas de las que pasaron por la
              etapa anterior llegaron a esta (no es "% del total", es del
              flujo real, así que empresas descartadas no distorsionan). */}
          <div className="flex items-center gap-2 pb-3 shrink-0 text-[12px] text-muted-foreground">
            {FUNNEL_COLS.map((col, i) => {
              const n = rows.filter((r) => r.status === col.key).length;
              // "llegó hasta acá o más adelante": suma de esta etapa en
              // adelante sobre el total del embudo (descartadas no cuentan,
              // viven aparte). La primera etapa es siempre 100% por definición.
              const total = FUNNEL_COLS.reduce((sum, c) => sum + rows.filter((r) => r.status === c.key).length, 0);
              const atOrBeyond = FUNNEL_COLS.slice(i).reduce((sum, c) => sum + rows.filter((r) => r.status === c.key).length, 0);
              const pct = total > 0 ? Math.round((atOrBeyond / total) * 100) : 0;
              return (
                <span key={col.key} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted-foreground/40">→</span>}
                  <span>{col.label} <b className="text-foreground">{n}</b></span>
                  {i > 0 && <span className="text-[10.5px]">({pct}% llegó hasta acá)</span>}
                </span>
              );
            })}
          </div>
          <div className="flex-1 min-h-0 overflow-x-auto">
          <div className="flex gap-3 h-full min-w-max">
            {FUNNEL_COLS.map((col) => {
              const items = rows
                .filter((r) => r.status === col.key)
                .sort((a, b) => b.score - a.score);
              return (
                <div
                  key={col.key}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("text/prospect-id");
                    const prospect = rows.find((r) => r.id === id);
                    if (prospect && prospect.status !== col.key) setStatus(prospect, col.key);
                  }}
                  className="w-80 flex flex-col rounded-xl border border-border bg-muted/30 max-h-full"
                >
                  <div className="flex items-center gap-2 px-3 py-2.5 shrink-0">
                    <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                    <span className="text-[12.5px] font-semibold">{col.label}</span>
                    <span className="text-[11px] font-bold tabular-nums rounded-full px-1.5 bg-card text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-1.5">
                    {items.length === 0 && (
                      <div className="text-[11.5px] text-muted-foreground/60 text-center py-6">
                        Arrastrá una tarjeta acá
                      </div>
                    )}
                    {items.map((p) => {
                      const countries = j(p.countries);
                      const sources = j(p.sources);
                      const roles = j(p.roles);
                      return (
                        <div
                          key={p.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/prospect-id", p.id)}
                          onClick={() => setSelectedId(p.id)}
                          className="rounded-lg border border-border bg-card p-3 cursor-pointer space-y-1.5 hover:border-ring/40 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn("text-[12px] font-bold tabular-nums", scoreColor(p.score))}>{p.score}</span>
                            <span className="text-[13px] font-medium truncate flex-1">{p.company}</span>
                            <span className={cn("text-[10px] rounded-full px-1.5 py-px font-medium shrink-0", URGENCY_STYLE[p.urgency])}>
                              {p.urgency}
                            </span>
                          </div>
                          <div className="text-[11.5px] text-muted-foreground truncate">
                            {roles[0] ?? "Ingenieros de software"}{roles.length > 1 ? ` +${roles.length - 1}` : ""}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                            <span className="flex items-center gap-0.5"><Briefcase className="h-3 w-3" />{p.jobCount}</span>
                            <span className={cn("flex items-center gap-0.5", p.daysOpen >= 30 && "text-red-500 font-medium")}>
                              {p.daysOpen >= 30 && <Flame className="h-3 w-3" />}{p.daysOpen}d sin llenar
                            </span>
                            {countries.length > 0 && (
                              <span className="flex items-center gap-0.5 truncate"><MapPin className="h-3 w-3" />{countries[0]}</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground/80">
                            <span className="truncate">{sources.join(" · ")}</span>
                            <span className="shrink-0">hace {Math.max(0, Math.round((Date.now() - p.createdAt) / 86400000))}d</span>
                          </div>
                          {p.contactName && (
                            <div className="pt-1 border-t border-border/60 text-[11.5px] truncate">
                              <span className="font-medium">{p.contactName}</span>
                              {p.contactTitle && <span className="text-muted-foreground"> · {p.contactTitle}</span>}
                            </div>
                          )}
                          {contactLogSummary(p.contactLog) && (
                            <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                              <History className="h-3 w-3" /> {contactLogSummary(p.contactLog)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {view === "lista" && (
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-[13px]">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando prospectos...
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center gap-1">
            <Building2 className="h-8 w-8 text-muted-foreground/40" />
            <div className="text-[14px] font-medium">Nada por acá</div>
            <div className="text-[12.5px] text-muted-foreground max-w-sm">
              {tab === "new"
                ? "El radar corre todos los días a las 8:45 y las empresas nuevas caen en esta pestaña."
                : "Cuando muevas prospectos a este estado van a aparecer acá."}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {visible.map((p) => {
              const roles = j(p.roles);
              const stack = j(p.stack);
              const sources = j(p.sources);
              const acting = busy[p.id];
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(p.id);
                    }
                  }}
                  className="group flex items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3 cursor-pointer transition-colors hover:border-ring/40 hover:bg-[var(--hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ScoreRing score={p.score} breakdown={p.scoreBreakdown} />

                  {/* Empresa + señales */}
                  <div className="w-56 shrink-0 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-[13.5px] truncate">{p.company}</span>
                      {p.knownContactId && (
                        <span className="text-[10px] font-semibold rounded-full px-1.5 py-px bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                          En CRM
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      <span className={cn("rounded-full px-1.5 py-px font-medium", URGENCY_STYLE[p.urgency])}>
                        {p.urgency}
                      </span>
                      <span>{sources.join(" · ")}</span>
                    </div>
                  </div>

                  {/* Dolor: vacantes + días */}
                  <div className="w-40 shrink-0 text-[12.5px]">
                    <div className="flex items-center gap-1 font-medium tabular-nums">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                      {p.jobCount} vacante{p.jobCount !== 1 ? "s" : ""}
                    </div>
                    <div className={cn("flex items-center gap-1 tabular-nums", p.daysOpen >= 30 ? "text-red-500 font-medium" : "text-muted-foreground")}>
                      {p.daysOpen >= 30 && <Flame className="h-3.5 w-3.5" />}
                      {p.daysOpen} días sin llenar
                    </div>
                  </div>

                  {/* Qué buscan */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] truncate">{roles[0] ?? "Ingenieros de software"}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {roles.length > 1 && (
                        <span className="text-[11px] text-muted-foreground shrink-0">+{roles.length - 1} roles</span>
                      )}
                      {stack.slice(0, 2).map((s) => (
                        <span key={s} className="text-[10.5px] rounded bg-muted px-1.5 py-px text-muted-foreground whitespace-nowrap">
                          {s}
                        </span>
                      ))}
                      {stack.length > 2 && (
                        <span className="text-[10.5px] text-muted-foreground whitespace-nowrap">+{stack.length - 2} más</span>
                      )}
                    </div>
                  </div>

                  {/* Decisor */}
                  <div className="w-44 shrink-0 min-w-0 text-[12px]">
                    {p.contactName ? (
                      <>
                        <div className="font-medium truncate">{p.contactName}</div>
                        <div className="text-muted-foreground truncate">{p.contactTitle ?? "—"}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground/60">Sin decisor aún</span>
                    )}
                    {contactLogSummary(p.contactLog) && (
                      <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground mt-0.5">
                        <History className="h-3 w-3" /> {contactLogSummary(p.contactLog)}
                      </div>
                    )}
                  </div>

                  {/* Acciones rápidas */}
                  <div
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {acting ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-2" />
                    ) : p.status === "discarded" ? (
                      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-[12px]" onClick={() => setStatus(p, "new")}>
                        <RotateCcw className="h-3.5 w-3.5" /> Reactivar
                      </Button>
                    ) : (
                      <>
                        {!p.contactName && (
                          <Button variant="ghost" size="sm" title="Buscar decisor en Apollo" className="h-7 w-7 p-0" onClick={() => enrich(p)}>
                            <UserSearch className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" title="Generar mensajes IA" className="h-7 w-7 p-0" onClick={() => genMessages(p)}>
                          <Sparkles className="h-3.5 w-3.5" />
                        </Button>
                        {!p.knownContactId && (
                          <Button variant="ghost" size="sm" title="Pasar al Pipeline" className="h-7 w-7 p-0" onClick={() => convert(p)}>
                            <ArrowRightCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" title="Posponer 3 días" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => snooze(p, 3)}>
                          <Clock className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Descartar" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setStatus(p, "discarded")}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Popup de detalle */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="p-0 gap-0 sm:max-w-4xl w-[min(96vw,56rem)] max-h-[88vh] overflow-hidden flex flex-col">
          {selected && (
            <ProspectDetail
              key={selected.id}
              p={selected}
              busy={busy[selected.id]}
              onEnrich={() => enrich(selected)}
              onLinkedin={() => linkedinEnrich(selected)}
              onMessages={() => genMessages(selected)}
              onConvert={() => convert(selected)}
              onStatus={(s) => setStatus(selected, s)}
              onSaveMsg={(f, v) => saveMsg(selected, f, v)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ApolloConfigDialog
        open={apolloDialog}
        onClose={() => setApolloDialog(false)}
        onSaved={() => setApolloSet(true)}
      />
    </div>
  );
}

// ---------- panel de detalle ----------

function ProspectDetail({
  p, busy, onEnrich, onLinkedin, onMessages, onConvert, onStatus, onSaveMsg,
}: {
  p: Prospect;
  busy?: string;
  onEnrich: () => void;
  onLinkedin: () => void;
  onMessages: () => void;
  onConvert: () => void;
  onStatus: (s: string) => void;
  onSaveMsg: (field: "msgConnect" | "msgPitch", value: string) => void;
}) {
  const roles = j(p.roles);
  const jobs = (() => {
    try {
      const arr = p.jobs ? (JSON.parse(p.jobs) as { title: string; url: string; source: string }[]) : [];
      return Array.isArray(arr) ? arr.filter((x) => x && x.title) : [];
    } catch { return []; }
  })();
  const altContacts = (() => {
    try {
      const arr = p.altContacts ? (JSON.parse(p.altContacts) as { name: string; title: string | null; email: string | null; linkedin: string | null }[]) : [];
      return Array.isArray(arr) ? arr.filter((x) => x && x.name) : [];
    } catch { return []; }
  })();
  const stack = j(p.stack);
  const sources = j(p.sources);
  const countries = j(p.countries);
  const linkedinInfo = (() => {
    try {
      return p.linkedinCompanyInfo
        ? (JSON.parse(p.linkedinCompanyInfo) as { industry: string | null; size: string | null; headquarters: string | null; founded: string | null; description: string | null })
        : null;
    } catch { return null; }
  })();
  // key={p.id} en el mount: el estado arranca de props y se resetea por prospecto.
  const [connect, setConnect] = useState(p.msgConnect ?? "");
  const [pitch, setPitch] = useState(p.msgPitch ?? "");

  const salary = p.minSalary || p.maxSalary
    ? `${p.minSalary ? `$${p.minSalary.toLocaleString()}` : "?"} – ${p.maxSalary ? `$${p.maxSalary.toLocaleString()}` : "?"}`
    : null;

  return (
    <>
      {/* Header band */}
      <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0 space-y-0">
        <div className="flex items-start gap-4">
          <ScoreRing score={p.score} />
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-[19px] font-semibold tracking-tight truncate">
              {p.company}
            </DialogTitle>
            <DialogDescription className="text-[12.5px] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
              <span className={cn("rounded-full px-1.5 py-px font-medium", URGENCY_STYLE[p.urgency])}>
                urgencia {p.urgency}
              </span>
              <span>{p.isOpen ? "sigue publicando" : "dejó de publicar"}</span>
              <span>· {sources.join(", ")}</span>
              {countries.length > 0 && <span>· {countries.join(", ")}</span>}
              {p.seniority && <span>· {p.seniority}</span>}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0 mr-6">
            <select
              value={p.status}
              onChange={(e) => onStatus(e.target.value)}
              className="h-8 rounded-lg border border-border bg-card px-2 text-[12.5px] cursor-pointer"
            >
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {!p.knownContactId && (
              <Button size="sm" className="gap-1.5" onClick={onConvert} disabled={!!busy}>
                {busy === "convert" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightCircle className="h-3.5 w-3.5" />}
                Pasar al Pipeline
              </Button>
            )}
            {p.url && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(p.url!, "_blank")}>
                <ExternalLink className="h-3.5 w-3.5" /> Ver aviso
              </Button>
            )}
          </div>
        </div>
        {/* Métricas de dolor */}
        <div className="flex items-center gap-6 pt-3 text-[13px] tabular-nums">
          <div className="flex items-center gap-1.5">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{p.jobCount}</span>
            <span className="text-muted-foreground">vacante{p.jobCount !== 1 ? "s" : ""} abierta{p.jobCount !== 1 ? "s" : ""}</span>
          </div>
          <div className={cn("flex items-center gap-1.5", p.daysOpen >= 30 ? "text-red-500" : "")}>
            {p.daysOpen >= 30 ? <Flame className="h-4 w-4" /> : <Check className="h-4 w-4 text-muted-foreground" />}
            <span className="font-semibold">{p.daysOpen}</span>
            <span className={p.daysOpen >= 30 ? "" : "text-muted-foreground"}>días sin llenar la más vieja</span>
          </div>
          {salary && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="font-semibold text-foreground">{salary}</span> USD/mes
            </div>
          )}
        </div>
      </DialogHeader>

      {/* Cuerpo: 2 columnas */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x divide-border">
          {/* Columna izquierda: qué buscan */}
          <div className="px-6 py-5 space-y-4">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Qué están buscando
              </h3>
              <ul className="space-y-1.5">
                {(jobs.length > 0 ? jobs : roles.map((r) => ({ title: r, url: "", source: "" }))).map((job, i) => (
                  <li key={`${job.title}-${i}`} className="text-[13px] flex items-start gap-2 leading-snug">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    {job.url ? (
                      <button
                        onClick={() => openExternal(job.url)}
                        className="text-left hover:text-primary hover:underline cursor-pointer flex items-start gap-1 group/job"
                        title={`Ver el aviso original (${job.source})`}
                      >
                        {job.title}
                        <ExternalLink className="h-3 w-3 mt-0.5 opacity-0 group-hover/job:opacity-60 shrink-0" />
                      </button>
                    ) : (
                      job.title
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {stack.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Stack
                </h3>
                <div className="flex flex-wrap gap-1">
                  {stack.map((s) => (
                    <span key={s} className="text-[11px] rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {/* Decisor */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Decisor de contratación
                </h3>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[12px]" onClick={onEnrich} disabled={!!busy}>
                  {busy === "enrich" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserSearch className="h-3.5 w-3.5" />}
                  {p.contactName ? "Re-buscar" : "Buscar con Apollo"}
                </Button>
              </div>
              {p.contactName ? (
                <div className="space-y-2">
                  {[
                    { name: p.contactName, title: p.contactTitle, email: p.contactEmail, linkedin: p.contactLinkedin, phone: p.contactPhone, primary: true },
                    ...altContacts.map((c) => ({ ...c, phone: null as string | null, primary: false })),
                  ].map((c, i) => (
                    <div key={`${c.name}-${i}`} className={cn("rounded-lg border border-border p-3 space-y-1.5", c.primary ? "bg-muted/30" : "bg-card")}>
                      <div className="flex items-center gap-2">
                        <div className="text-[13.5px] font-medium flex-1 truncate">{c.name}</div>
                        {!c.primary && (
                          <span className="text-[10px] rounded-full px-1.5 py-px bg-muted text-muted-foreground shrink-0">alternativo</span>
                        )}
                      </div>
                      {c.title && <div className="text-[12px] text-muted-foreground">{c.title}</div>}
                      <div className="flex flex-col gap-1 pt-1">
                        {c.email && (
                          <div className="flex items-center gap-1.5 text-[12.5px]">
                            <button onClick={() => openExternal(`mailto:${c.email}`)} className="flex items-center gap-1.5 text-primary hover:underline cursor-pointer" title="Escribirle">
                              <Mail className="h-3.5 w-3.5" /> {c.email}
                            </button>
                            <button onClick={() => copy(c.email!, "Email")} className="text-muted-foreground hover:text-foreground cursor-pointer" title="Copiar">
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {c.phone && (
                          <button onClick={() => copy(c.phone!, "Teléfono")} className="flex items-center gap-1.5 text-[12.5px] hover:underline cursor-pointer w-fit">
                            <Phone className="h-3.5 w-3.5" /> {c.phone} <Copy className="h-3 w-3 opacity-50" />
                          </button>
                        )}
                        {c.linkedin && (
                          <button onClick={() => openExternal(c.linkedin!)} className="flex items-center gap-1.5 text-[12.5px] text-primary hover:underline cursor-pointer w-fit">
                            <ExternalLink className="h-3.5 w-3.5" /> Perfil de LinkedIn
                          </button>
                        )}
                        {!c.email && !c.linkedin && (
                          <span className="text-[12px] text-muted-foreground">Apollo no reveló email ni LinkedIn</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">
                  Todavía no buscamos quién decide acá (CTO, VP de Ingeniería, Head of Talent).
                </p>
              )}
            </div>

            {/* Sobre la empresa (LinkedIn): industria, tamaño, sede — para
                estudiar al cliente antes de contactarlo. */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Sobre la empresa
                </h3>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[12px]" onClick={onLinkedin} disabled={!!busy}>
                  {busy === "linkedin" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}
                  {linkedinInfo ? "Actualizar" : "Buscar en LinkedIn"}
                </Button>
              </div>
              {linkedinInfo ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-[12.5px]">
                  {linkedinInfo.description && <p className="text-foreground">{linkedinInfo.description}</p>}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-muted-foreground">
                    {linkedinInfo.industry && <span><span className="text-foreground font-medium">Industria:</span> {linkedinInfo.industry}</span>}
                    {linkedinInfo.size && <span><span className="text-foreground font-medium">Tamaño:</span> {linkedinInfo.size}</span>}
                    {linkedinInfo.headquarters && <span><span className="text-foreground font-medium">Sede:</span> {linkedinInfo.headquarters}</span>}
                    {linkedinInfo.founded && <span><span className="text-foreground font-medium">Fundada:</span> {linkedinInfo.founded}</span>}
                  </div>
                </div>
              ) : (
                <p className="text-[12.5px] text-muted-foreground">
                  Sin datos todavía. Buscar en LinkedIn trae industria, tamaño y sede de la empresa.
                </p>
              )}
            </div>
          </div>

          {/* Columna derecha: mensajes */}
          <div className="px-6 py-5 space-y-3 bg-muted/20">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Mensajes de outreach
              </h3>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[12px]" onClick={onMessages} disabled={!!busy}>
                {busy === "messages" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {p.msgConnect ? "Regenerar con IA" : "Generar con IA"}
              </Button>
            </div>
            {[
              { field: "msgConnect" as const, label: "1 · Conexión (sin vender)", value: connect, set: setConnect },
              { field: "msgPitch" as const, label: "2 · Oferta de staffing", value: pitch, set: setPitch },
            ].map((m) => (
              <div key={m.field}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium">{m.label}</span>
                  {m.value && (
                    <button onClick={() => copy(m.value, "Mensaje")} className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground cursor-pointer">
                      <Copy className="h-3 w-3" /> Copiar
                    </button>
                  )}
                </div>
                <Textarea
                  value={m.value}
                  onChange={(e) => m.set(e.target.value)}
                  onBlur={() => m.value !== (p[m.field] ?? "") && onSaveMsg(m.field, m.value)}
                  placeholder="Generá con IA o escribilo a mano..."
                  className="min-h-32 text-[13px] bg-card"
                />
              </div>
            ))}
            {p.msgConnect && (
              <p className="text-[11.5px] text-muted-foreground flex items-center gap-1">
                <Check className="h-3 w-3" /> Los cambios se guardan al salir del campo
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
