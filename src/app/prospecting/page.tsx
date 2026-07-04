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
  Sparkles,
  UserSearch,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copiado`),
    () => toast.error("No se pudo copiar")
  );
}

/** Anillo de score estilo ficha de contacto: SVG chico con el número adentro. */
function ScoreRing({ score }: { score: number }) {
  const r = 15, c = 2 * Math.PI * r;
  return (
    <div className="relative h-10 w-10 shrink-0" title={`Score ${score}`}>
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
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((r) =>
        [r.company, r.roles ?? "", r.stack ?? "", r.contactName ?? ""].join(" ").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => (b[sort] as number) - (a[sort] as number));
  }, [rows, tab, query, sort]);

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
          <p className="text-[12.5px] text-muted-foreground">
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
      </div>

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

      {/* Tabs */}
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

      {/* Lista */}
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
                  onClick={() => setSelectedId(p.id)}
                  className="group flex items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3 cursor-pointer transition-colors hover:border-ring/40 hover:bg-[var(--hover)]"
                >
                  <ScoreRing score={p.score} />

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
                  </div>

                  {/* Acciones rápidas */}
                  <div
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
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

      {/* Panel de detalle */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
          {selected && (
            <ProspectDetail
              key={selected.id}
              p={selected}
              busy={busy[selected.id]}
              onEnrich={() => enrich(selected)}
              onMessages={() => genMessages(selected)}
              onConvert={() => convert(selected)}
              onStatus={(s) => setStatus(selected, s)}
              onSaveMsg={(f, v) => saveMsg(selected, f, v)}
            />
          )}
        </SheetContent>
      </Sheet>

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
  p, busy, onEnrich, onMessages, onConvert, onStatus, onSaveMsg,
}: {
  p: Prospect;
  busy?: string;
  onEnrich: () => void;
  onMessages: () => void;
  onConvert: () => void;
  onStatus: (s: string) => void;
  onSaveMsg: (field: "msgConnect" | "msgPitch", value: string) => void;
}) {
  const roles = j(p.roles);
  const stack = j(p.stack);
  const sources = j(p.sources);
  const countries = j(p.countries);
  // key={p.id} en el mount: el estado arranca de props y se resetea por prospecto.
  const [connect, setConnect] = useState(p.msgConnect ?? "");
  const [pitch, setPitch] = useState(p.msgPitch ?? "");

  const salary = p.minSalary || p.maxSalary
    ? `${p.minSalary ? `$${p.minSalary.toLocaleString()}` : "?"} – ${p.maxSalary ? `$${p.maxSalary.toLocaleString()}` : "?"}`
    : null;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <SheetHeader className="px-5 pt-5 pb-4 border-b border-border space-y-2">
        <div className="flex items-center gap-3">
          <ScoreRing score={p.score} />
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-[17px] truncate">{p.company}</SheetTitle>
            <SheetDescription className="text-[12.5px] flex items-center gap-1.5">
              <span className={cn("rounded-full px-1.5 py-px font-medium", URGENCY_STYLE[p.urgency])}>
                urgencia {p.urgency}
              </span>
              {p.isOpen ? "sigue publicando" : "dejó de publicar"} · {sources.join(", ")}
              {countries.length > 0 && <> · {countries.join(", ")}</>}
            </SheetDescription>
          </div>
          <select
            value={p.status}
            onChange={(e) => onStatus(e.target.value)}
            className="h-8 rounded-lg border border-border bg-card px-2 text-[12.5px] cursor-pointer shrink-0"
          >
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          {!p.knownContactId && (
            <Button size="sm" className="gap-1.5 flex-1" onClick={onConvert} disabled={!!busy}>
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
      </SheetHeader>

      {/* Vacantes */}
      <section className="px-5 py-4 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Qué están buscando
        </h3>
        <div className="flex items-center gap-3 text-[12.5px] mb-2 tabular-nums">
          <span className="font-medium">{p.jobCount} vacante{p.jobCount !== 1 ? "s" : ""} abierta{p.jobCount !== 1 ? "s" : ""}</span>
          <span className={cn(p.daysOpen >= 30 ? "text-red-500 font-medium" : "text-muted-foreground")}>
            {p.daysOpen >= 30 && <Flame className="h-3.5 w-3.5 inline mr-0.5 -mt-0.5" />}
            la más vieja lleva {p.daysOpen} días
          </span>
          {salary && <span className="text-muted-foreground">{salary}</span>}
        </div>
        <ul className="space-y-1 mb-2">
          {roles.map((r) => (
            <li key={r} className="text-[13px] flex items-start gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
        {stack.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {stack.map((s) => (
              <span key={s} className="text-[11px] rounded-md bg-muted px-2 py-0.5 text-muted-foreground">{s}</span>
            ))}
          </div>
        )}
      </section>

      {/* Decisor */}
      <section className="px-5 py-4 border-b border-border">
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
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
            <div className="text-[13.5px] font-medium">{p.contactName}</div>
            {p.contactTitle && <div className="text-[12px] text-muted-foreground">{p.contactTitle}</div>}
            <div className="flex flex-col gap-1 pt-1">
              {p.contactEmail && (
                <button onClick={() => copy(p.contactEmail!, "Email")} className="flex items-center gap-1.5 text-[12.5px] text-primary hover:underline cursor-pointer w-fit">
                  <Mail className="h-3.5 w-3.5" /> {p.contactEmail} <Copy className="h-3 w-3 opacity-50" />
                </button>
              )}
              {p.contactPhone && (
                <button onClick={() => copy(p.contactPhone!, "Teléfono")} className="flex items-center gap-1.5 text-[12.5px] hover:underline cursor-pointer w-fit">
                  <Phone className="h-3.5 w-3.5" /> {p.contactPhone} <Copy className="h-3 w-3 opacity-50" />
                </button>
              )}
              {p.contactLinkedin && (
                <a href={p.contactLinkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[12.5px] text-primary hover:underline w-fit">
                  <ExternalLink className="h-3.5 w-3.5" /> Perfil de LinkedIn
                </a>
              )}
              {!p.contactEmail && !p.contactPhone && (
                <span className="text-[12px] text-muted-foreground">Apollo no reveló email ni teléfono (créditos o plan)</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            Todavía no buscamos quién decide acá (CTO, VP de Ingeniería, Head of Talent).
          </p>
        )}
      </section>

      {/* Mensajes */}
      <section className="px-5 py-4 space-y-3">
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
              className="min-h-24 text-[13px]"
            />
          </div>
        ))}
        {p.msgConnect && (
          <p className="text-[11.5px] text-muted-foreground flex items-center gap-1">
            <Check className="h-3 w-3" /> Los cambios se guardan al salir del campo
          </p>
        )}
      </section>
    </div>
  );
}
