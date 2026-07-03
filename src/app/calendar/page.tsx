"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Calendar as CalIcon, CheckSquare, Clock, X, List, LayoutGrid } from "lucide-react";
import { RecordCalendar } from "@/components/record/RecordCalendar";
import type { RecordRow, SelectOption } from "@/components/record/types";

// Agenda (Fase 4 auditoría 2026-07-02). Antes: lista plana con las tareas
// vencidas ESCONDIDAS detrás de un toggle "N pasados" y sin más acción que
// "Listo". Ahora: secciones Vencidas / Hoy / Esta semana / Más adelante /
// Sin fecha, acciones Listo / Posponer / Cancelar, distinción tarea vs evento
// y vista de mes reusando RecordCalendar.

interface TaskItem { id: string; title: string; stepName: string | null; dueAt: string | null; contactId: string; contactName: string | null; stage: string | null; }
interface EventItem { id: string; title: string; type: string; date: string; time: string | null; }

interface Item {
  id: string;
  taskId: string | null; // null = evento
  title: string;
  type: string;
  /** día local YYYY-MM-DD, o null si la tarea no tiene fecha */
  day: string | null;
  time: string | null;
  contactId: string | null;
  contactName: string | null;
  /** valor fecha parseable en LOCAL para la vista mes */
  calDate: string | null;
}

const TYPE_STYLE: Record<string, { c: string; bg: string; label: string }> = {
  task:     { c: "var(--primary)", bg: "var(--accent-dim)",  label: "Tarea" },
  meeting:  { c: "var(--info)",    bg: "var(--info-dim)",    label: "Reunión" },
  demo:     { c: "var(--primary)", bg: "var(--accent-dim)",  label: "Demo" },
  call:     { c: "var(--info)",    bg: "var(--info-dim)",    label: "Llamada" },
  deal:     { c: "var(--purple)",  bg: "var(--purple-dim)",  label: "Negocio" },
  reminder: { c: "var(--warning)", bg: "var(--warning-dim)", label: "Recordatorio" },
};

const CAL_GROUPS: SelectOption[] = Object.entries(TYPE_STYLE).map(([value, s]) => ({
  value, label: s.label, color: s.c,
}));

/** Día LOCAL de un timestamp/fecha. "YYYY-MM-DD" crudo parsea como UTC y corre
 *  un día en zonas negativas, por eso se le fija T00:00:00. */
function localDay(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
  if (isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDay(day: string): string {
  try { return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T00:00:00`)); }
  catch { return day; }
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d.toISOString().slice(0, 10) + "T00:00:00") ?? day;
}

export default function CalendarPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", type: "meeting", date: "", time: "" });
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [view, setView] = useState<"list" | "month">("list");
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/tasks?scope=open").then(r => r.ok ? r.json() : []),
      fetch("/api/events").then(r => r.ok ? r.json() : []),
    ]).then(([t, e]) => { setTasks(Array.isArray(t) ? t : []); setEvents(Array.isArray(e) ? e : []); }).finally(() => setLoading(false));
  };

  // fetch-on-mount estandar (load() marca loading=true antes del fetch).
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title || !form.date) return;
    await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ title: "", type: "meeting", date: "", time: "" }); setOpen(false); load();
  };

  const patchTask = async (id: string, body: Record<string, unknown>, okMsg: string) => {
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

  const today = localDay(new Date().toISOString())!;
  const weekEnd = addDays(today, 7);

  const items: Item[] = [
    ...tasks.map((t): Item => ({
      id: `t-${t.id}`, taskId: t.id, title: t.title, type: "task",
      day: localDay(t.dueAt), time: null,
      contactId: t.contactId, contactName: t.contactName,
      calDate: t.dueAt,
    })),
    ...events.map((e): Item => ({
      id: `e-${e.id}`, taskId: null, title: e.title, type: e.type,
      day: localDay(e.date), time: e.time,
      contactId: null, contactName: null,
      calDate: e.date ? `${e.date}T00:00:00` : null,
    })),
  ].sort((a, b) => (a.day ?? "9999").localeCompare(b.day ?? "9999") || (a.time ?? "").localeCompare(b.time ?? ""));

  // Secciones. La deuda (tareas vencidas) va ARRIBA y visible, no detrás de un
  // toggle. Los eventos pasados (reuniones que ya fueron) sí quedan ocultables.
  const overdueTasks = items.filter(i => i.taskId && i.day && i.day < today);
  const pastEvents   = items.filter(i => !i.taskId && i.day && i.day < today);
  const todayItems   = items.filter(i => i.day === today);
  const weekItems    = items.filter(i => i.day && i.day > today && i.day <= weekEnd);
  const laterItems   = items.filter(i => i.day && i.day > weekEnd);
  const noDateItems  = items.filter(i => !i.day);

  const snoozeAllOverdue = async () => {
    if (!confirm(`¿Posponer las ${overdueTasks.length} tareas vencidas para mañana a las 10:00?`)) return;
    const due = tomorrowAt10();
    setBusy("all");
    try {
      await Promise.all(overdueTasks.map(i =>
        fetch(`/api/tasks/${i.taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dueAt: due }) })
      ));
      toast.success("Tareas vencidas pospuestas para mañana");
      load();
    } catch { toast.error("Algunas tareas no se pudieron posponer"); }
    finally { setBusy(null); }
  };

  const isEmpty = !overdueTasks.length && !todayItems.length && !weekItems.length && !laterItems.length && !noDateItems.length;

  const Row = ({ i, overdue = false }: { i: Item; overdue?: boolean }) => {
    const st = TYPE_STYLE[i.type] ?? TYPE_STYLE.meeting;
    return (
      <div role="article" aria-label={`${st.label}: ${i.title}${overdue ? " — vencida" : ""}`}
        className={`rounded-xl border bg-card px-4 py-3 flex items-center gap-3 ${overdue ? "border-destructive/40" : "border-border"}`}>
        <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: st.bg, color: st.c }}>
          {i.taskId ? <CheckSquare className="h-4 w-4" /> : <span className="text-sm font-semibold">{st.label[0]}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{i.title}</div>
          <div className="text-xs text-muted-foreground">
            {st.label}
            {i.contactName && i.contactId && (
              <> · <Link href={`/contacts/${i.contactId}`} className="text-primary hover:underline">{i.contactName}</Link></>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          {i.time && <div className="text-sm font-medium tabular-nums">{i.time}</div>}
          {i.day && <div className={`text-[11px] ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>{fmtDay(i.day)}</div>}
        </div>
        {i.taskId && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => patchTask(i.taskId!, { status: "completed" }, "Tarea completada")} disabled={busy !== null}
              className="text-xs font-medium text-primary hover:underline cursor-pointer disabled:opacity-50 px-1.5 py-1">
              Listo
            </button>
            <button onClick={() => patchTask(i.taskId!, { dueAt: tomorrowAt10() }, "Pospuesta para mañana a las 10:00")} disabled={busy !== null}
              title="Posponer para mañana a las 10:00" aria-label={`Posponer: ${i.title}`}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer disabled:opacity-50">
              <Clock className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { if (confirm(`¿Cancelar la tarea "${i.title}"?`)) patchTask(i.taskId!, { status: "cancelled" }, "Tarea cancelada"); }} disabled={busy !== null}
              title="Cancelar tarea" aria-label={`Cancelar: ${i.title}`}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer disabled:opacity-50">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const Section = ({ title, items: sectionItems, tone, action }: { title: string; items: Item[]; tone?: "danger"; action?: React.ReactNode }) =>
    sectionItems.length === 0 ? null : (
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className={`text-[12px] font-semibold uppercase tracking-wide ${tone === "danger" ? "text-destructive" : "text-muted-foreground"}`}>
            {title}
          </h2>
          <span className={`text-[11px] font-bold tabular-nums rounded-full px-1.5 ${tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
            {sectionItems.length}
          </span>
          {action}
        </div>
        <div className="grid gap-2">{sectionItems.map(i => <Row key={i.id} i={i} overdue={tone === "danger"} />)}</div>
      </section>
    );

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Agenda</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setView("list")} aria-pressed={view === "list"}
              className={`px-2.5 py-1.5 text-[12px] flex items-center gap-1 cursor-pointer ${view === "list" ? "bg-muted font-medium" : "hover:bg-muted/50"}`}>
              <List className="h-3.5 w-3.5" /> Lista
            </button>
            <button onClick={() => setView("month")} aria-pressed={view === "month"}
              className={`px-2.5 py-1.5 text-[12px] flex items-center gap-1 cursor-pointer border-l border-border ${view === "month" ? "bg-muted font-medium" : "hover:bg-muted/50"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Mes
            </button>
          </div>
          <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="new-event-form"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium bg-primary text-primary-foreground rounded-lg px-3 py-2 cursor-pointer hover:bg-primary-hover">
            <Plus className="h-4 w-4" /> Nuevo evento
          </button>
        </div>
      </div>

      {open && (
        <div id="new-event-form" className="rounded-xl border border-border bg-card p-4 mb-5 grid gap-3 sm:grid-cols-2 max-w-2xl slide-in">
          <input aria-label="Titulo del evento" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Titulo" className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary sm:col-span-2" />
          <select aria-label="Tipo de evento" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none">
            {["meeting", "demo", "call", "deal", "reminder"].map(t => <option key={t} value={t}>{TYPE_STYLE[t].label}</option>)}
          </select>
          <input aria-label="Fecha del evento" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none" />
          <input aria-label="Hora del evento" type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none" />
          <button onClick={create} aria-label="Crear evento" className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium cursor-pointer hover:bg-primary-hover">Crear</button>
        </div>
      )}

      {loading ? (
        <div role="status" aria-label="Cargando agenda..." aria-busy="true" className="grid gap-3 max-w-3xl">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-card rounded-xl animate-pulse" />)}</div>
      ) : view === "month" ? (
        <RecordCalendar
          rows={items.filter(i => i.calDate).map((i): RecordRow => ({ id: i.id, title: i.title, type: i.type, date: i.calDate, contactId: i.contactId }))}
          dateKey="date"
          primaryKey="title"
          groupKey="type"
          groups={CAL_GROUPS}
          onOpen={(row) => { if (row.contactId) router.push(`/contacts/${row.contactId}`); }}
        />
      ) : isEmpty ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center bg-card max-w-3xl">
          <CalIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="font-medium">Sin pendientes</p>
          <p className="text-sm text-muted-foreground mt-1">Cuando muevas un contacto por el pipeline, los seguimientos van a aparecer acá solos.</p>
        </div>
      ) : (
        <div className="max-w-3xl">
          <Section
            title="Vencidas"
            items={overdueTasks}
            tone="danger"
            action={overdueTasks.length > 1 ? (
              <button onClick={snoozeAllOverdue} disabled={busy !== null}
                className="ml-auto text-[11px] text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50">
                Posponer todas a mañana
              </button>
            ) : undefined}
          />
          <Section title="Hoy" items={todayItems} />
          <Section title="Esta semana" items={weekItems} />
          <Section title="Más adelante" items={laterItems} />
          <Section title="Sin fecha" items={noDateItems} />
          {pastEvents.length > 0 && (
            <div className="mt-2 mb-6">
              <button onClick={() => setShowPastEvents(p => !p)} className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">
                {showPastEvents ? "Ocultar eventos pasados" : `Eventos pasados (${pastEvents.length})`}
              </button>
              {showPastEvents && <div className="grid gap-2 mt-2 opacity-70">{pastEvents.map(i => <Row key={i.id} i={i} />)}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
