"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Toggle } from "@/components/ds";

// UI de workflows (b4-ui). Lista + editor lineal + panel de runs sobre la API
// /api/workflows. Reemplaza el display legacy de "automations" (esa tabla es otro
// modelo: dashboard de jobs built-in, no se toca). Un solo archivo: una sola ruta,
// sin abstracciones que reusar en otro lado.

// Objetos y columnas escribibles: espejan el whitelist del engine (engine.ts
// RECORD_TABLES). Si cambia allá, cambia acá. Usado por el picker de record_event
// y como ayuda de campos en update/create.
const OBJECTS: Record<string, string[]> = {
  contacts: ["name", "email", "phone", "company", "country", "source", "temperature", "score", "notes", "stage", "channel", "probability", "value_cents", "next_action", "agent_id", "tags", "archived"],
  deals: ["title", "value", "stage_id", "contact_id", "expected_close", "probability", "notes"],
  companies: ["name", "domain", "industry", "size", "country", "linkedin", "notes", "archived"],
  proposals: ["contact_id", "deal_id", "mode", "status", "client", "role", "duration", "notes", "summary", "priority"],
  tickets: ["code", "subject", "status", "priority", "sla", "agent_id", "contact_id"],
};
const OBJECT_NAMES = Object.keys(OBJECTS);
const EVENTS = ["created", "updated", "deleted"];
const STEP_TYPES = ["update_record", "create_record", "delete_record", "http_request", "send_email", "ai_step", "delay", "branch"] as const;
type StepType = (typeof STEP_TYPES)[number];

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: string;
  steps: string;
  active: number;
  version: number;
  created_at: number;
}
interface RunLog { step: number; type: string; ok: boolean; detail?: string; at: number; }
interface Run { id: string; status: string; logs: string; started_at: number; finished_at: number | null; }
interface Step { type: StepType; [k: string]: unknown; }
interface Draft {
  id?: string;
  name: string;
  description: string;
  triggerType: "record_event" | "scheduled" | "manual";
  triggerConfig: { objectName?: string; event?: string; intervalMinutes?: number };
  steps: Step[];
  active: boolean;
}

const fmtDate = (sec: number) => new Date(sec * 1000).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function triggerLabel(w: WorkflowRow): string {
  if (w.trigger_type === "manual") return "Manual";
  let cfg: { objectName?: string; event?: string; intervalMinutes?: number } = {};
  try { cfg = JSON.parse(w.trigger_config || "{}"); } catch { /* config vacío */ }
  if (w.trigger_type === "record_event") return `${cfg.objectName ?? "?"} · ${cfg.event ?? "?"}`;
  if (w.trigger_type === "scheduled") return `Cada ${cfg.intervalMinutes ?? "?"} min`;
  return w.trigger_type;
}

function emptyStep(type: StepType): Step {
  if (type === "update_record" || type === "create_record") return { type, objectName: "contacts", recordId: "{{record.id}}", fields: {} };
  if (type === "delete_record") return { type, objectName: "contacts", recordId: "{{record.id}}" };
  if (type === "http_request") return { type, method: "POST", url: "", body: "" };
  if (type === "send_email") return { type, to: "", subject: "", body: "" };
  if (type === "ai_step") return { type, prompt: "", saveAs: "aiOutput" };
  if (type === "delay") return { type, seconds: 5 };
  return { type, condition: "", then: [], else: [] };
}

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50";
const labelCls = "text-[11px] font-medium text-muted-foreground mb-1 block";

export default function AutomationsPage() {
  const [items, setItems] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);

  const load = useCallback(() => {
    fetch("/api/workflows")
      .then(r => (r.ok ? r.json() : []))
      .then(rows => { setItems(Array.isArray(rows) ? rows : []); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (w: WorkflowRow, active: boolean) => {
    const snapshot = items;
    setItems(prev => prev.map(x => x.id === w.id ? { ...x, active: active ? 1 : 0 } : x));
    try {
      const r = await fetch(`/api/workflows/${w.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch { setItems(snapshot); toast.error("No se pudo actualizar el workflow"); }
  };

  const newWorkflow = () => setEditing({ name: "", description: "", triggerType: "manual", triggerConfig: {}, steps: [], active: false });

  const edit = (w: WorkflowRow) => {
    let steps: Step[] = []; let cfg = {};
    try { steps = JSON.parse(w.steps || "[]"); } catch { /* steps vacío */ }
    try { cfg = JSON.parse(w.trigger_config || "{}"); } catch { /* config vacío */ }
    setEditing({ id: w.id, name: w.name, description: w.description ?? "", triggerType: w.trigger_type as Draft["triggerType"], triggerConfig: cfg, steps, active: !!w.active });
  };

  const remove = async (w: WorkflowRow) => {
    if (!confirm(`Eliminar workflow "${w.name}"?`)) return;
    await fetch(`/api/workflows/${w.id}`, { method: "DELETE" });
    toast.success("Workflow eliminado");
    load();
  };

  if (editing) return <Editor draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />;

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Workflows</h1>
        <button onClick={newWorkflow} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">Nuevo workflow</button>
      </div>

      {loading ? (
        <div role="status" aria-busy="true" className="grid gap-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-card rounded-xl animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay workflows todavia. Crea el primero con &quot;Nuevo workflow&quot;.</p>
      ) : (
        <div className="grid gap-3">
          {items.map(w => (
            <div key={w.id} role="article" aria-label={w.name} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{w.name || "(sin nombre)"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{triggerLabel(w)} · v{w.version}</div>
              </div>
              <Toggle active={!!w.active} onChange={v => toggle(w, v)} aria-label={`${w.active ? "Desactivar" : "Activar"} ${w.name}`} />
              <button onClick={() => edit(w)} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">Editar</button>
              <button onClick={() => remove(w)} className="rounded-lg border border-border px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10">Borrar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Editor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [saving, setSaving] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);

  const set = (patch: Partial<Draft>) => setD(prev => ({ ...prev, ...patch }));
  const setCfg = (patch: Partial<Draft["triggerConfig"]>) => setD(prev => ({ ...prev, triggerConfig: { ...prev.triggerConfig, ...patch } }));

  const loadRuns = useCallback((id: string) => {
    fetch(`/api/workflows/${id}/runs?limit=20`).then(r => r.ok ? r.json() : []).then(rs => setRuns(Array.isArray(rs) ? rs : []));
  }, []);
  useEffect(() => { if (d.id) loadRuns(d.id); }, [d.id, loadRuns]);

  // Steps
  const addStep = (type: StepType) => set({ steps: [...d.steps, emptyStep(type)] });
  const updateStep = (i: number, patch: Partial<Step>) => set({ steps: d.steps.map((s, j) => j === i ? { ...s, ...patch } : s) });
  const removeStep = (i: number) => set({ steps: d.steps.filter((_, j) => j !== i) });
  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= d.steps.length) return;
    const next = [...d.steps];
    [next[i], next[j]] = [next[j], next[i]];
    set({ steps: next });
  };

  const payload = () => ({
    name: d.name.trim(),
    description: d.description,
    triggerType: d.triggerType,
    triggerConfig: d.triggerConfig,
    steps: d.steps,
    active: d.active,
  });

  const save = async (): Promise<string | null> => {
    if (!d.name.trim()) { toast.error("El nombre es obligatorio"); return null; }
    setSaving(true);
    try {
      const url = d.id ? `/api/workflows/${d.id}` : "/api/workflows";
      const method = d.id ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const row = await r.json();
      toast.success("Workflow guardado");
      if (!d.id && row?.id) setD(prev => ({ ...prev, id: row.id }));
      return d.id ?? row?.id ?? null;
    } catch (e) {
      toast.error(`No se pudo guardar: ${e instanceof Error ? e.message : e}`);
      return null;
    } finally { setSaving(false); }
  };

  // Guarda (si hace falta) y dispara manual. recordId opcional para probar un
  // record_event con un registro real.
  const run = async () => {
    const id = await save();
    if (!id) return;
    setRunning(true);
    try {
      const body: Record<string, unknown> = {};
      if (d.triggerType === "record_event") {
        const rid = prompt("recordId para la prueba (vacio = sin registro):", "");
        if (rid) body.recordId = rid;
      }
      const r = await fetch(`/api/workflows/${id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const res = await r.json();
      if (!r.ok) throw new Error(res?.error || `HTTP ${r.status}`);
      toast[res.status === "success" ? "success" : "error"](`Ejecucion ${res.status}`);
      loadRuns(id);
    } catch (e) {
      toast.error(`Error al ejecutar: ${e instanceof Error ? e.message : e}`);
    } finally { setRunning(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 fade-in max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">&larr; Volver</button>
        <div className="flex gap-2">
          <button onClick={run} disabled={running || saving} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">{running ? "Ejecutando..." : "Ejecutar"}</button>
          <button onClick={async () => { if (await save()) onSaved(); }} disabled={saving} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{saving ? "Guardando..." : "Guardar"}</button>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={labelCls}>Nombre</label><input className={inputCls} value={d.name} onChange={e => set({ name: e.target.value })} placeholder="Nombre del workflow" /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Descripcion</label><input className={inputCls} value={d.description} onChange={e => set({ description: e.target.value })} placeholder="(opcional)" /></div>
        </div>

        {/* Trigger */}
        <fieldset className="rounded-xl border border-border bg-card p-4">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">Disparador</legend>
          <div className="grid gap-3 sm:grid-cols-3 mt-2">
            <div>
              <label className={labelCls}>Tipo</label>
              <select className={inputCls} value={d.triggerType} onChange={e => set({ triggerType: e.target.value as Draft["triggerType"], triggerConfig: {} })}>
                <option value="manual">Manual</option>
                <option value="record_event">Evento de registro</option>
                <option value="scheduled">Programado</option>
              </select>
            </div>
            {d.triggerType === "record_event" && (<>
              <div>
                <label className={labelCls}>Objeto</label>
                <select className={inputCls} value={d.triggerConfig.objectName ?? ""} onChange={e => setCfg({ objectName: e.target.value })}>
                  <option value="">Elegir...</option>
                  {OBJECT_NAMES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Evento</label>
                <select className={inputCls} value={d.triggerConfig.event ?? ""} onChange={e => setCfg({ event: e.target.value })}>
                  <option value="">Elegir...</option>
                  {EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </div>
            </>)}
            {d.triggerType === "scheduled" && (
              <div>
                <label className={labelCls}>Intervalo (min)</label>
                <input type="number" min={1} className={inputCls} value={d.triggerConfig.intervalMinutes ?? ""} onChange={e => setCfg({ intervalMinutes: Number(e.target.value) })} />
              </div>
            )}
          </div>
        </fieldset>

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Pasos ({d.steps.length})</h2>
          </div>
          <div className="space-y-3">
            {d.steps.map((s, i) => (
              <StepCard key={i} step={s} index={i} total={d.steps.length}
                onChange={patch => updateStep(i, patch)} onRemove={() => removeStep(i)}
                onMove={dir => moveStep(i, dir)} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {STEP_TYPES.map(t => (
              <button key={t} onClick={() => addStep(t)} className="rounded-lg border border-dashed border-border px-2.5 py-1 text-xs hover:bg-muted">+ {t}</button>
            ))}
          </div>
        </div>

        {/* Runs */}
        {d.id && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Ejecuciones</h2>
              <button onClick={() => loadRuns(d.id!)} className="text-xs text-muted-foreground hover:text-foreground">Refrescar</button>
            </div>
            {runs.length === 0 ? <p className="text-xs text-muted-foreground">Sin ejecuciones todavia.</p> : (
              <div className="space-y-2">{runs.map(r => <RunRow key={r.id} run={r} />)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RunRow({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);
  let logs: RunLog[] = [];
  try { logs = JSON.parse(run.logs || "[]"); } catch { /* logs vacío */ }
  const ok = run.status === "success";
  return (
    <div className="rounded-lg border border-border bg-card">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
        <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : run.status === "running" ? "bg-amber-500" : "bg-destructive"}`} />
        <span className="text-xs font-medium">{run.status}</span>
        <span className="text-xs text-muted-foreground">{fmtDate(run.started_at)}</span>
        <span className="ml-auto text-xs text-muted-foreground">{logs.length} paso{logs.length !== 1 ? "s" : ""} {open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 space-y-1">
          {logs.length === 0 ? <p className="text-xs text-muted-foreground">Sin logs.</p> : logs.map((l, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={l.ok ? "text-emerald-600" : "text-destructive"}>{l.ok ? "✓" : "✗"}</span>
              <span className="font-mono">#{l.step} {l.type}</span>
              {l.detail && <span className="text-muted-foreground">— {l.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Editor de un step. Config por tipo. fields (update/create) se editan como
// pares clave/valor; el resto como inputs simples. Los valores soportan {{path}}.
function StepCard({ step, index, total, onChange, onRemove, onMove }: {
  step: Step; index: number; total: number;
  onChange: (patch: Partial<Step>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const objectName = typeof step.objectName === "string" ? step.objectName : "contacts";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-mono text-muted-foreground">#{index}</span>
        <span className="text-sm font-semibold">{step.type}</span>
        <div className="ml-auto flex gap-1">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="rounded border border-border px-1.5 py-0.5 text-xs disabled:opacity-30">↑</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="rounded border border-border px-1.5 py-0.5 text-xs disabled:opacity-30">↓</button>
          <button onClick={onRemove} className="rounded border border-border px-1.5 py-0.5 text-xs text-destructive">✕</button>
        </div>
      </div>

      {(step.type === "update_record" || step.type === "create_record" || step.type === "delete_record") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Objeto</label>
            <select className={inputCls} value={objectName} onChange={e => onChange({ objectName: e.target.value })}>
              {OBJECT_NAMES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {step.type !== "create_record" && (
            <div>
              <label className={labelCls}>recordId</label>
              <input className={inputCls} value={String(step.recordId ?? "")} onChange={e => onChange({ recordId: e.target.value })} placeholder="{{record.id}}" />
            </div>
          )}
          {step.type !== "delete_record" && (
            <div className="sm:col-span-2">
              <label className={labelCls}>Campos (cols: {OBJECTS[objectName]?.slice(0, 6).join(", ")}…)</label>
              <FieldsEditor value={(step.fields as Record<string, string>) ?? {}} onChange={fields => onChange({ fields })} />
            </div>
          )}
        </div>
      )}

      {step.type === "http_request" && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div><label className={labelCls}>Metodo</label>
            <select className={inputCls} value={String(step.method ?? "POST")} onChange={e => onChange({ method: e.target.value })}>
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="sm:col-span-3"><label className={labelCls}>URL</label><input className={inputCls} value={String(step.url ?? "")} onChange={e => onChange({ url: e.target.value })} placeholder="https://..." /></div>
          <div className="sm:col-span-4"><label className={labelCls}>Body (texto o {"{{var}}"})</label><textarea className={inputCls} rows={2} value={String(step.body ?? "")} onChange={e => onChange({ body: e.target.value })} /></div>
        </div>
      )}

      {step.type === "send_email" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls}>Para</label><input className={inputCls} value={String(step.to ?? "")} onChange={e => onChange({ to: e.target.value })} placeholder="{{record.email}}" /></div>
          <div><label className={labelCls}>Asunto</label><input className={inputCls} value={String(step.subject ?? "")} onChange={e => onChange({ subject: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Cuerpo (HTML)</label><textarea className={inputCls} rows={3} value={String(step.body ?? "")} onChange={e => onChange({ body: e.target.value })} /></div>
        </div>
      )}

      {step.type === "ai_step" && (
        <div className="grid gap-3 sm:grid-cols-1">
          <div><label className={labelCls}>Prompt</label><textarea className={inputCls} rows={3} value={String(step.prompt ?? "")} onChange={e => onChange({ prompt: e.target.value })} placeholder="Resume esta nota: {{record.notes}}" /></div>
          <div><label className={labelCls}>Guardar resultado en (saveAs)</label><input className={inputCls} value={String(step.saveAs ?? "")} onChange={e => onChange({ saveAs: e.target.value })} placeholder="resumen" /></div>
        </div>
      )}

      {step.type === "delay" && (
        <div><label className={labelCls}>Segundos (tope 60)</label><input type="number" min={0} max={60} className={inputCls} value={Number(step.seconds ?? 0)} onChange={e => onChange({ seconds: Number(e.target.value) })} /></div>
      )}

      {step.type === "branch" && (
        <div><label className={labelCls}>Condicion (ej. {"{{record.score}}"} {">"} 50)</label>
          <input className={inputCls} value={String(step.condition ?? "")} onChange={e => onChange({ condition: e.target.value })} />
          <p className="text-[11px] text-muted-foreground mt-1">ponytail: branch then/else anidados no editables desde la UI (solo la condicion). Si no hay ramas definidas, no hace nada.</p>
        </div>
      )}
    </div>
  );
}

// Editor de pares clave/valor para los `fields` de create/update_record.
function FieldsEditor({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const entries = Object.entries(value);
  const setKey = (oldK: string, newK: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of entries) next[k === oldK ? newK : k] = v;
    onChange(next);
  };
  const setVal = (k: string, v: string) => onChange({ ...value, [k]: v });
  const removeKey = (k: string) => { const next = { ...value }; delete next[k]; onChange(next); };
  const add = () => onChange({ ...value, "": "" });
  return (
    <div className="space-y-2">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <input className={`${inputCls} flex-1`} value={k} onChange={e => setKey(k, e.target.value)} placeholder="columna" />
          <input className={`${inputCls} flex-1`} value={v} onChange={e => setVal(k, e.target.value)} placeholder="valor o {{var}}" />
          <button onClick={() => removeKey(k)} className="rounded border border-border px-2 text-xs text-destructive">✕</button>
        </div>
      ))}
      <button onClick={add} className="rounded-lg border border-dashed border-border px-2.5 py-1 text-xs hover:bg-muted">+ campo</button>
    </div>
  );
}
