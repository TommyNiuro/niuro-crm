"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Calendar as CalIcon } from "lucide-react";

interface TaskItem { id: string; title: string; stepName: string | null; dueAt: string | null; contactId: string; contactName: string | null; stage: string | null; }
interface EventItem { id: string; title: string; type: string; date: string; time: string | null; }

const TYPE_STYLE: Record<string, { c: string; bg: string }> = {
  demo: { c: "var(--primary)", bg: "var(--accent-dim)" },
  call: { c: "var(--info)", bg: "var(--info-dim)" },
  deal: { c: "var(--purple)", bg: "var(--purple-dim)" },
  reminder: { c: "var(--warning)", bg: "var(--warning-dim)" },
  meeting: { c: "var(--info)", bg: "var(--info-dim)" },
  task: { c: "var(--primary)", bg: "var(--accent-dim)" },
};

function isoDate(v: string | null) { try { return v ? new Date(v).toISOString().slice(0, 10) : null; } catch { return null; } }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtDate(v: string | null) { try { return v ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(new Date(v)) : ""; } catch { return ""; } }

export default function CalendarPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", type: "meeting", date: "", time: "" });
  const [showPast, setShowPast] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/tasks?scope=open").then(r => r.ok ? r.json() : []),
      fetch("/api/events").then(r => r.ok ? r.json() : []),
    ]).then(([t, e]) => { setTasks(Array.isArray(t) ? t : []); setEvents(Array.isArray(e) ? e : []); }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title || !form.date) return;
    await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ title: "", type: "meeting", date: "", time: "" }); setOpen(false); load();
  };

  const completeTask = async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "completed" }) });
    load();
  };

  const today = todayStr();

  // Combinar: tasks como pseudo-eventos
  const combined = [
    ...tasks.map(t => ({ id: `t-${t.id}`, _taskId: t.id, title: t.title, type: "task", date: isoDate(t.dueAt) || "9999-12-31", time: null, overdue: !!t.dueAt && new Date(t.dueAt) < new Date(), contactId: t.contactId, contactName: t.contactName })),
    ...events.map(e => ({ id: `e-${e.id}`, _taskId: null as string | null, title: e.title, type: e.type, date: e.date, time: e.time, overdue: false, contactId: null as string | null, contactName: null as string | null })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const pastCount = combined.filter((e) => e.date < today && e.date !== "9999-12-31").length;
  const visible = showPast ? combined : combined.filter((e) => e.date >= today || e.date === "9999-12-31");
  const isEmpty = visible.length === 0;

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Agenda</h1>
        <div className="flex items-center gap-2">
          {pastCount > 0 && (
            <button onClick={() => setShowPast((p) => !p)} className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">
              {showPast ? "Ocultar pasados" : `${pastCount} pasado${pastCount !== 1 ? "s" : ""}`}
            </button>
          )}
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="new-event-form" className="inline-flex items-center gap-1.5 text-[13px] font-medium bg-primary text-primary-foreground rounded-lg px-3 py-2 cursor-pointer hover:bg-primary-hover">
          <Plus className="h-4 w-4" /> Nuevo evento
        </button>
        </div>
      </div>

      {open && (
        <div id="new-event-form" className="rounded-xl border border-border bg-card p-4 mb-5 grid gap-3 sm:grid-cols-2 max-w-2xl slide-in">
          <input aria-label="Titulo del evento" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Titulo" className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary sm:col-span-2" />
          <select aria-label="Tipo de evento" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none">
            {["meeting", "demo", "call", "deal", "reminder"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input aria-label="Fecha del evento" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none" />
          <input aria-label="Hora del evento" type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none" />
          <button onClick={create} aria-label="Crear evento" className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium cursor-pointer hover:bg-primary-hover">Crear</button>
        </div>
      )}

      {loading ? (
        <div role="status" aria-label="Cargando agenda..." aria-busy="true" className="grid gap-3 max-w-3xl">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-card rounded-xl animate-pulse" />)}</div>
      ) : isEmpty ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center bg-card max-w-3xl">
          <CalIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="font-medium">Sin eventos</p>
          <p className="text-sm text-muted-foreground mt-1">Cuando muevas un lead por el pipeline, los seguimientos van a aparecer aca solos.</p>
        </div>
      ) : (
        <div className="grid gap-3 max-w-3xl">
          {visible.map(e => {
            const st = TYPE_STYLE[e.type] || TYPE_STYLE.meeting;
            return (
              <div key={e.id} role="article" aria-label={`${e.type}: ${e.title}${e.overdue ? " — vencido" : ""}`} className={`rounded-xl border bg-card p-4 flex items-center gap-4 ${e.overdue ? "border-destructive/40" : "border-border"}`}>
                <div className="h-12 w-12 rounded-lg flex items-center justify-center text-lg font-semibold shrink-0" style={{ background: st.bg, color: st.c }}>
                  {e.type[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{e.title}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {e.type === "task" ? "Tarea del playbook" : e.type}
                    {e.contactName && <> · <Link href={`/contacts/${e.contactId}`} className="text-primary hover:underline">{e.contactName}</Link></>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-medium">{e.time || "--"}</div>
                    <div className={`text-[11px] ${e.overdue ? "text-destructive" : "text-muted-foreground"}`}>{fmtDate(e.date)}</div>
                  </div>
                  {e._taskId && (
                    <button onClick={() => completeTask(e._taskId!)} aria-label={`Marcar como completada: ${e.title}`} className="text-xs text-primary hover:underline cursor-pointer">Listo</button>
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
