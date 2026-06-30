"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Trash2, Paperclip, Check, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar } from "@/components/ds";
import { InlineField } from "./InlineField";
import { RowActionButtons } from "./RowActionButtons";
import { FavoriteStar } from "./FavoriteStar";
import type { ColumnDef, RecordConfig, RecordRow } from "./types";

interface Activity {
  id: string;
  type: string;
  description: string;
  createdAt: number | string;
}

interface Props {
  config: RecordConfig;
  row: RecordRow | null;
  onClose: () => void;
  onSave: (id: string, key: string, value: unknown) => void | Promise<void>;
  /** recarga la lista tras una rowAction de mutación; cierra el panel. */
  onAction?: () => void;
}

export function RecordDetailPanel({ config, row, onClose, onSave, onAction }: Props) {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  // hasActivity: activities vienen embebidas en el GET de detalle (contacts).
  // hasTimeline: se leen del timeline de auditoría genérico (/api/timeline).
  const hasActivity = config.hasActivity ?? false;
  const hasTimeline = config.hasTimeline ?? false;
  const showActivity = hasActivity || hasTimeline;
  const showNotes = config.hasNotes ?? false;
  // tasks vive en la tabla tasks (keyed por contactId): solo aplica a contactos.
  const showTasks = (config.hasTasks ?? false) && config.object === "contacts";
  const showFiles = config.hasFiles ?? false;
  const relatedSections = config.relatedSections ?? [];
  // El GET de detalle trae activities (hasActivity) y/o los arrays de relatedSections.
  const needsDetail = hasActivity || relatedSections.length > 0;

  useEffect(() => {
    if (!row || !needsDetail) return;
    setActivities(null);
    setDetail(null);
    let alive = true;
    fetch(`${config.listEndpoint}/${row.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setActivities(Array.isArray(d?.activities) ? d.activities : []);
        setDetail(d ?? {});
      })
      .catch(() => {
        if (alive) {
          setActivities([]);
          setDetail({});
        }
      });
    return () => {
      alive = false;
    };
  }, [row, config.listEndpoint, needsDetail]);

  // Timeline de auditoría genérico (b7): para objetos sin activities embebidas.
  useEffect(() => {
    if (!row || hasActivity || !hasTimeline) return;
    setActivities(null);
    let alive = true;
    fetch(`/api/timeline?objectName=${encodeURIComponent(config.object)}&recordId=${encodeURIComponent(row.id)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => alive && setActivities(Array.isArray(d) ? d : []))
      .catch(() => alive && setActivities([]));
    return () => {
      alive = false;
    };
  }, [row, config.object, hasActivity, hasTimeline]);

  const primaryCol = config.columns.find((c) => c.primary) ?? ({ key: "name", label: "Nombre", type: "text" } as ColumnDef);
  const editPrimary: ColumnDef = { ...primaryCol, editable: true };
  const fieldCols = config.columns.filter((c) => !c.primary);
  const hasAvatar = config.hasAvatar ?? true;
  const title = row ? String(row[primaryCol.key] ?? "—") : "";
  const subtitle = row && config.subtitleKey ? row[config.subtitleKey] : null;

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[440px] p-0 gap-0 flex flex-col">
        {row && (
          <>
            <SheetHeader className="px-5 py-4 border-b border-border space-y-0">
              <div className="flex items-center gap-3">
                {hasAvatar ? (
                  <Avatar name={title} size={40} online={Boolean(row.online)} country={(row.country as string) ?? null} />
                ) : (
                  <span className="h-10 w-10 shrink-0 rounded-md bg-surface-2 border border-border-soft flex items-center justify-center text-[15px] font-semibold text-meta">
                    {title.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-[15px] font-semibold truncate">{title}</SheetTitle>
                  {subtitle ? <div className="text-[12px] text-meta truncate">{String(subtitle)}</div> : null}
                </div>
                <FavoriteStar
                  targetType={config.object}
                  targetId={row.id}
                  label={title}
                  href={config.detailHref ? config.detailHref(row.id) : `${config.listEndpoint.replace("/api", "")}`}
                />
                {config.rowActions?.length ? (
                  <RowActionButtons
                    actions={config.rowActions}
                    row={row}
                    onMutated={() => {
                      onClose();
                      onAction?.();
                    }}
                    variant="detail"
                  />
                ) : null}
                {config.detailHref && (
                  <Link
                    href={config.detailHref(row.id)}
                    className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ficha
                  </Link>
                )}
              </div>
            </SheetHeader>

            <Tabs defaultValue="detalles" className="flex-1 min-h-0 flex flex-col">
              <TabsList className="mx-5 mt-3 shrink-0">
                <TabsTrigger value="detalles">Detalles</TabsTrigger>
                {showNotes && <TabsTrigger value="notas">Notas</TabsTrigger>}
                {showTasks && <TabsTrigger value="tareas">Tareas</TabsTrigger>}
                {showFiles && <TabsTrigger value="archivos">Archivos</TabsTrigger>}
                {showActivity && <TabsTrigger value="actividad">Actividad</TabsTrigger>}
              </TabsList>

              <TabsContent value="detalles" className="flex-1 min-h-0 overflow-y-auto px-3 py-2 mt-0">
                <FieldCard col={editPrimary} value={row[primaryCol.key]} onSave={(v) => onSave(row.id, primaryCol.key, v)} />
                {fieldCols.map((col) => (
                  <FieldCard
                    key={col.key}
                    col={col}
                    value={row[col.key]}
                    relationLabel={col.relationConfig?.labelKey ? String(row[col.relationConfig.labelKey] ?? "") : undefined}
                    onSave={(v) => onSave(row.id, col.key, v)}
                  />
                ))}

                {relatedSections.map((sec) => {
                  const items = detail && Array.isArray(detail[sec.dataKey]) ? (detail[sec.dataKey] as RecordRow[]) : [];
                  return (
                    <section key={sec.label} className="mt-4 px-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-meta mb-1.5">
                        {sec.label}
                        {detail ? <span className="ml-1.5 font-normal text-meta/70">{items.length}</span> : null}
                      </div>
                      {!detail ? (
                        <div className="space-y-1.5">
                          {[...Array(2)].map((_, i) => (
                            <div key={i} className="h-9 bg-muted rounded animate-pulse" />
                          ))}
                        </div>
                      ) : items.length === 0 ? (
                        <div className="text-[12px] text-meta py-1.5">Ninguno.</div>
                      ) : (
                        <ul className="space-y-1">
                          {items.map((it) => {
                            const sub = sec.subtitleKey ? it[sec.subtitleKey] : null;
                            return (
                              <li key={it.id}>
                                <Link
                                  href={sec.href(it)}
                                  onClick={onClose}
                                  className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 bg-surface-2 border border-border-soft hover:bg-hover transition-colors"
                                >
                                  <div className="min-w-0">
                                    <div className="text-[13px] text-foreground truncate">{String(it[sec.titleKey] ?? "—")}</div>
                                    {sub ? <div className="text-[11px] text-meta truncate">{String(sub)}</div> : null}
                                  </div>
                                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-meta" />
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </TabsContent>

              {showActivity && (
              <TabsContent value="actividad" className="flex-1 min-h-0 overflow-y-auto px-5 py-3 mt-0">
                {activities === null ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                    ))}
                  </div>
                ) : activities.length === 0 ? (
                  <div className="text-[13px] text-meta text-center py-8">Sin actividad registrada.</div>
                ) : (
                  <ol className="relative border-l border-border-soft ml-1.5 space-y-4">
                    {activities
                      .slice()
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((a) => (
                        <li key={a.id} className="ml-4">
                          <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-meta" />
                          <div className="text-[13px] text-foreground">{a.description}</div>
                          <div className="text-[11px] text-meta mt-0.5">
                            {new Date(a.createdAt).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </li>
                      ))}
                  </ol>
                )}
              </TabsContent>
              )}

              {showNotes && (
                <TabsContent value="notas" className="flex-1 min-h-0 overflow-y-auto px-5 py-3 mt-0">
                  <NotesTab targetType={config.object} targetId={row.id} />
                </TabsContent>
              )}
              {showTasks && (
                <TabsContent value="tareas" className="flex-1 min-h-0 overflow-y-auto px-5 py-3 mt-0">
                  <TasksTab contactId={row.id} />
                </TabsContent>
              )}
              {showFiles && (
                <TabsContent value="archivos" className="flex-1 min-h-0 overflow-y-auto px-5 py-3 mt-0">
                  <FilesTab targetType={config.object} targetId={row.id} />
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function fmtDate(v: number | string | null | undefined): string {
  if (!v) return "";
  return new Date(v).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

interface Note {
  id: string;
  body: string;
  createdAt: number | string;
}

function NotesTab({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/notes?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setNotes(Array.isArray(d) ? d : []))
      .catch(() => setNotes([]));
  }, [targetType, targetId]);

  useEffect(() => {
    setNotes(null);
    load();
  }, [load]);

  async function add() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, body }),
      });
      if (r.ok) {
        setDraft("");
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    setNotes((prev) => prev?.filter((n) => n.id !== id) ?? prev);
    await fetch(`/api/notes?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribir una nota…"
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-ring"
        />
        <button
          onClick={add}
          disabled={!draft.trim() || saving}
          className="ml-auto flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      </div>
      {notes === null ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="text-[13px] text-meta text-center py-6">Sin notas.</div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="group rounded-md border border-border-soft bg-surface-2 px-3 py-2">
              <div className="text-[13px] text-foreground whitespace-pre-wrap break-words">{n.body}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] text-meta">{fmtDate(n.createdAt)}</span>
                <button
                  onClick={() => del(n.id)}
                  className="text-meta opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  aria-label="Borrar nota"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Task {
  id: string;
  title: string;
  status: string;
  dueAt: number | string | null;
}

function TasksTab({ contactId }: { contactId: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/tasks?contactId=${encodeURIComponent(contactId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTasks(Array.isArray(d) ? d : []))
      .catch(() => setTasks([]));
  }, [contactId]);

  useEffect(() => {
    setTasks(null);
    load();
  }, [load]);

  async function add() {
    const title = draft.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, title }),
      });
      if (r.ok) {
        setDraft("");
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function complete(id: string) {
    setTasks((prev) => prev?.map((t) => (t.id === id ? { ...t, status: "completed" } : t)) ?? prev);
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    }).catch(() => {});
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nueva tarea…"
          className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-[13px] outline-none focus:border-ring"
        />
        <button
          onClick={add}
          disabled={!draft.trim() || saving}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {tasks === null ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-[13px] text-meta text-center py-6">Sin tareas.</div>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((t) => {
            const done = t.status !== "open";
            return (
              <li
                key={t.id}
                className="flex items-center gap-2.5 rounded-md border border-border-soft bg-surface-2 px-3 py-2"
              >
                <button
                  onClick={() => !done && complete(t.id)}
                  disabled={done}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    done ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary"
                  }`}
                  aria-label="Completar tarea"
                >
                  {done && <Check className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-[13px] truncate ${done ? "text-meta line-through" : "text-foreground"}`}>
                    {t.title}
                  </div>
                  {t.dueAt ? <div className="text-[11px] text-meta">{fmtDate(t.dueAt)}</div> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface Attachment {
  id: string;
  name: string;
  createdAt: number | string;
}

function FilesTab({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch(`/api/attachments?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setFiles(Array.isArray(d) ? d : []))
      .catch(() => setFiles([]));
  }, [targetType, targetId]);

  useEffect(() => {
    setFiles(null);
    load();
  }, [load]);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("targetType", targetType);
        form.append("targetId", targetId);
        const r = await fetch("/api/attachments", { method: "POST", body: form });
        if (r.ok) {
          load();
        } else {
          const d = await r.json().catch(() => null);
          setError(d?.error ?? "No se pudo subir el archivo");
        }
      } catch {
        setError("No se pudo subir el archivo");
      } finally {
        setUploading(false);
      }
    },
    [targetType, targetId, load]
  );

  async function del(id: string) {
    setFiles((prev) => prev?.filter((f) => f.id !== id) ?? prev);
    await fetch(`/api/attachments?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-surface-2 px-3 py-6 text-center hover:border-ring"
      >
        <Paperclip className="h-5 w-5 text-meta" />
        <span className="text-[12px] text-meta">
          {uploading ? "Subiendo…" : "Arrastra un archivo o haz clic para subir"}
        </span>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>
      {error ? <div className="text-[12px] text-destructive">{error}</div> : null}
      {files === null ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="text-[13px] text-meta text-center py-4">Sin archivos.</div>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="group flex items-center gap-2.5 rounded-md border border-border-soft bg-surface-2 px-3 py-2"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-meta" />
              <a
                href={`/api/attachments?id=${f.id}`}
                className="min-w-0 flex-1 text-[13px] text-foreground truncate hover:underline"
              >
                {f.name}
              </a>
              <span className="text-[11px] text-meta shrink-0">{fmtDate(f.createdAt)}</span>
              <button
                onClick={() => del(f.id)}
                className="text-meta opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                aria-label="Borrar archivo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FieldCard({
  col,
  value,
  onSave,
  relationLabel,
}: {
  col: ColumnDef;
  value: unknown;
  onSave: (v: unknown) => void | Promise<void>;
  relationLabel?: string;
}) {
  return (
    <div className="flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-surface-2">
      <div className="w-28 shrink-0 text-[12px] text-meta pt-2">{col.label}</div>
      <div className="flex-1 min-w-0">
        <InlineField col={col} value={value} onSave={onSave} variant="card" relationLabel={relationLabel} />
      </div>
    </div>
  );
}
