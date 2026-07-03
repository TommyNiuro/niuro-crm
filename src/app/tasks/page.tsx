"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, Sparkles, Search, Clock, X, CheckCircle2, Circle, Loader2, ListTodo,
} from "lucide-react";

// Tareas (antes "Agenda"), 2026-07-03: el centro de operaciones del día.
// Layout estilo HubSpot: vistas Todo / Vencen hoy / Atrasadas / Próximas con
// conteos, tabla con contacto, empresa, última interacción REAL del chat,
// origen y vencimiento, y acciones por fila (Listo / Posponer / Cancelar).
// El botón "Generar con IA" lee las conversaciones del pipeline y crea
// instrucciones accionables (src/lib/task-intel.ts).

interface TaskRow {
  id: string;
  contactId: string;
  title: string;
  stepName: string | null;
  dueAt: string | null;
  contactName: string | null;
  contactCompany: string | null;
  whatsappJid: string | null;
  lastInteractionAt: string | null;
}

type ViewKey = "all" | "today" | "overdue" | "upcoming";

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "today", label: "Vencen hoy" },
  { key: "overdue", label: "Atrasadas" },
  { key: "upcoming", label: "Próximas" },
];

function localDay(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDue(v: string | null): string {
  if (!v) return "Sin fecha";
  try { return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(new Date(v)); }
  catch { return ""; }
}

function relTime(ts: string | null): string {
  if (!ts) return "--";
  const diff = Date.now() - new Date(ts).getTime();
  if (isNaN(diff)) return "--";
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "hace <1h";
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d}d`;
  return `hace ${Math.floor(d / 30)}m`;
}

function origen(stepName: string | null): { label: string; cls: string } {
  if (stepName === "IA") return { label: "IA", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-300" };
  if (stepName === "Seguimiento") return { label: "Cadencia", cls: "bg-sky-500/12 text-sky-600 dark:text-sky-300" };
  if (stepName) return { label: "Playbook", cls: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" };
  return { label: "Manual", cls: "bg-muted text-muted-foreground" };
}

export default function TasksPage() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewKey>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const load = () => {
    fetch("/api/tasks?scope=open")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const today = localDay(new Date().toISOString())!;

  const buckets = useMemo(() => {
    const day = (t: TaskRow) => localDay(t.dueAt);
    return {
      all: rows,
      today: rows.filter((t) => day(t) === today),
      overdue: rows.filter((t) => { const d = day(t); return d != null && d < today; }),
      upcoming: rows.filter((t) => { const d = day(t); return d == null || d > today; }),
    };
  }, [rows, today]);

  const visible = useMemo(() => {
    const base = buckets[view];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter((t) =>
          t.title.toLowerCase().includes(q) ||
          (t.contactName ?? "").toLowerCase().includes(q) ||
          (t.contactCompany ?? "").toLowerCase().includes(q))
      : base;
    // Orden por urgencia: sin fecha al final, vencidas primero.
    return [...filtered].sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  }, [buckets, view, query]);

  const patch = async (id: string, body: Record<string, unknown>, okMsg: string) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      toast.success(okMsg);
      load();
    } catch { toast.error("No se pudo actualizar la tarea"); }
    finally { setBusy(null); }
  };

  const tomorrowAt10 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  };

  const runAi = async () => {
    setAiRunning(true);
    try {
      const r = await fetch("/api/tasks/ai-sync", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "error");
      if (d.analyzed === 0) toast.info("Nada nuevo que analizar: no hay conversaciones con mensajes nuevos");
      else toast.success(`IA: ${d.analyzed} conversaciones leídas, ${d.created} tarea${d.created === 1 ? "" : "s"} nueva${d.created === 1 ? "" : "s"}, ${d.observations} observación${d.observations === 1 ? "" : "es"}`);
      load();
    } catch (e) {
      toast.error(`La IA no pudo generar tareas: ${e instanceof Error ? e.message : "error"}`);
    } finally { setAiRunning(false); }
  };

  return (
    <div className="h-full overflow-y-auto fade-in">
      <div className="px-6 md:px-8 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Tareas</h1>
            <p className="text-[11px] text-muted-foreground">{rows.length} pendiente{rows.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runAi} disabled={aiRunning}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium rounded-lg px-3 py-2 cursor-pointer border border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 disabled:opacity-60"
              title="Lee las conversaciones del pipeline y crea tareas con los compromisos y seguimientos que detecte">
              {aiRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {aiRunning ? "Leyendo conversaciones…" : "Generar con IA"}
            </button>
            <button onClick={() => setShowNew((o) => !o)} aria-expanded={showNew}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium bg-primary text-primary-foreground rounded-lg px-3 py-2 cursor-pointer hover:bg-primary-hover">
              <Plus className="h-4 w-4" /> Crear tarea
            </button>
          </div>
        </div>

        {showNew && <NewTaskForm onDone={() => { setShowNew(false); load(); }} />}

        {/* Vistas con conteos, estilo pestañas */}
        <div className="flex items-center border-b border-border">
          {VIEWS.map((v) => {
            const n = buckets[v.key].length;
            const active = view === v.key;
            return (
              <button key={v.key} onClick={() => setView(v.key)} aria-pressed={active}
                className={`px-4 py-2.5 text-[13px] cursor-pointer border-b-2 -mb-px flex items-center gap-1.5 ${
                  active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                {v.label}
                <span className={`text-[11px] font-bold tabular-nums rounded-full px-1.5 ${
                  v.key === "overdue" && n > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                }`}>{n}</span>
              </button>
            );
          })}
          <div className="ml-auto relative pb-1.5">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-[60%] text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarea o contacto…"
              aria-label="Buscar tarea o contacto"
              className="bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-[12.5px] outline-none focus:border-primary w-60" />
          </div>
        </div>
      </div>

      {loading ? (
        <div role="status" aria-busy="true" className="px-6 md:px-8 py-4 grid gap-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-card rounded-lg animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="px-6 md:px-8 py-16 text-center">
          <ListTodo className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="font-medium">{query ? "Nada coincide con la búsqueda" : "Estás al día con todas tus tareas"}</p>
          {!query && <p className="text-sm text-muted-foreground mt-1">Probá &ldquo;Generar con IA&rdquo; para convertir tus conversaciones en próximos pasos.</p>}
        </div>
      ) : (
        <div className="px-6 md:px-8 py-3 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="py-2 pr-2 w-9 font-medium" aria-label="Completar" />
                <th className="py-2 pr-4 font-medium">Título</th>
                <th className="py-2 pr-4 font-medium">Contacto</th>
                <th className="py-2 pr-4 font-medium">Empresa</th>
                <th className="py-2 pr-4 font-medium">Última interacción</th>
                <th className="py-2 pr-4 font-medium">Origen</th>
                <th className="py-2 pr-4 font-medium">Vence</th>
                <th className="py-2 w-16 font-medium" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const d = localDay(t.dueAt);
                const overdue = d != null && d < today;
                const og = origen(t.stepName);
                return (
                  <tr key={t.id} className="border-b border-border/60 hover:bg-muted/40 group">
                    <td className="py-2.5 pr-2">
                      <button onClick={() => patch(t.id, { status: "completed" }, "Tarea completada")} disabled={busy !== null}
                        aria-label={`Completar: ${t.title}`} title="Marcar como completada"
                        className="cursor-pointer text-muted-foreground hover:text-emerald-500 disabled:opacity-50">
                        {busy === t.id ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : (
                          <span className="relative inline-block h-[18px] w-[18px]">
                            <Circle className="h-[18px] w-[18px] group-hover:opacity-0 transition-opacity" />
                            <CheckCircle2 className="h-[18px] w-[18px] absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500" />
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="py-2.5 pr-4 font-medium max-w-[380px]">
                      <span className="line-clamp-2">{t.title}</span>
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      {t.contactName ? (
                        <Link href={`/contacts/${t.contactId}`} className="text-primary hover:underline">{t.contactName}</Link>
                      ) : <span className="text-muted-foreground">--</span>}
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground max-w-[180px] truncate">
                      {t.contactCompany || "--"}
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
                      {t.whatsappJid ? (
                        <Link href={`/whatsapp?chat=${encodeURIComponent(t.whatsappJid)}`} className="hover:text-foreground hover:underline" title="Abrir chat">
                          {relTime(t.lastInteractionAt)}
                        </Link>
                      ) : relTime(t.lastInteractionAt)}
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      <span className={`text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${og.cls}`}>{og.label}</span>
                    </td>
                    <td className={`py-2.5 pr-4 whitespace-nowrap tabular-nums ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                      {fmtDue(t.dueAt)}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => patch(t.id, { dueAt: tomorrowAt10() }, "Pospuesta para mañana a las 10:00")} disabled={busy !== null}
                          title="Posponer para mañana a las 10:00" aria-label={`Posponer: ${t.title}`}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer disabled:opacity-50">
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => { if (confirm(`¿Cancelar la tarea "${t.title}"?`)) patch(t.id, { status: "cancelled" }, "Tarea cancelada"); }} disabled={busy !== null}
                          title="Cancelar tarea" aria-label={`Cancelar: ${t.title}`}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer disabled:opacity-50">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Alta manual: título + contacto (búsqueda) + fecha. */
function NewTaskForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [contact, setContact] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string) => {
    setContactQuery(q);
    setContact(null);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setOptions([]); return; }
    timer.current = setTimeout(() => {
      fetch(`/api/contacts?search=${encodeURIComponent(q)}&limit=8`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setOptions(Array.isArray(d) ? d.map((c) => ({ id: c.id, name: c.name })) : []))
        .catch(() => setOptions([]));
    }, 250);
  };

  const create = async () => {
    if (!title.trim() || !contact) return;
    setSaving(true);
    try {
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), contactId: contact.id, dueAt: date ? `${date}T10:00:00` : null }),
      });
      if (!r.ok) throw new Error();
      toast.success("Tarea creada");
      onDone();
    } catch { toast.error("No se pudo crear la tarea"); }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-4 grid gap-3 sm:grid-cols-[1fr_240px_150px_auto] max-w-4xl slide-in">
      <input aria-label="Título de la tarea" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qué hay que hacer…"
        className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
      <div className="relative">
        <input aria-label="Contacto asociado" value={contact?.name ?? contactQuery} onChange={(e) => search(e.target.value)} placeholder="Contacto…"
          className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary w-full" />
        {options.length > 0 && !contact && (
          <div className="absolute z-10 top-full mt-1 left-0 right-0 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
            {options.map((o) => (
              <button key={o.id} onClick={() => { setContact(o); setOptions([]); }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-muted cursor-pointer truncate">
                {o.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <input aria-label="Fecha de vencimiento" type="date" value={date} onChange={(e) => setDate(e.target.value)}
        className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary" />
      <button onClick={create} disabled={saving || !title.trim() || !contact}
        className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium cursor-pointer hover:bg-primary-hover disabled:opacity-50">
        {saving ? "Creando…" : "Crear"}
      </button>
    </div>
  );
}
