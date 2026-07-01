"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Trash2, Download, Upload, Merge } from "lucide-react";
import { RecordViewBar, type RecordView } from "./RecordViewBar";
import { RecordTable } from "./RecordTable";
import { RecordBoard } from "./RecordBoard";
import { RecordCalendar } from "./RecordCalendar";
import { RecordDetailPanel } from "./RecordDetailPanel";
import { RecordFilters } from "./RecordFilters";
import { RecordColumns, type ColumnState, orderColumns } from "./RecordColumns";
import { RecordBulkActions } from "./RecordBulkActions";
import { RecordViews, type ViewSnapshot } from "./RecordViews";
import { RecordImport } from "./RecordImport";
import { RecordMergeDialog } from "./RecordMergeDialog";
import { exportCsv } from "./csv";
import { applyFilters, type Filter } from "./filters";
import { parseTags } from "./FieldValue";
import type { ColumnDef, RecordConfig, RecordRow, SelectOption } from "./types";

/** Row de field_metadata tal como la devuelve GET /api/metadata/objects/[name]. */
interface FieldMetaRow {
  name: string;
  label: string;
  type: ColumnDef["type"];
  options: string | null; // JSON serializado o null
  is_custom: number;
}

/** Convierte los fields custom de la metadata en ColumnDefs editables del motor. */
function metaToColumns(fields: FieldMetaRow[]): ColumnDef[] {
  return fields
    .filter((f) => f.is_custom === 1)
    .map((f) => {
      let options: SelectOption[] | undefined;
      if (f.options) {
        try {
          const parsed = JSON.parse(f.options);
          if (Array.isArray(parsed)) options = parsed;
        } catch {
          // ponytail: options corrupto en DB => columna sin opciones, no rompe la tabla
        }
      }
      return { key: f.name, label: f.label, type: f.type, editable: true, options };
    });
}

export function RecordIndex({
  config,
  onNew,
  newLabel,
  reloadSignal = 0,
  pollWhile,
}: {
  config: RecordConfig;
  onNew?: () => void;
  newLabel?: string;
  reloadSignal?: number;
  /** Si alguna fila cumple este predicado, re-fetchea la lista cada ~3s (ej. genStatus==='generating'). */
  pollWhile?: (row: RecordRow) => boolean;
}) {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<RecordView>("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dynGroups, setDynGroups] = useState<SelectOption[] | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [colState, setColState] = useState<ColumnState>({ order: [], hidden: new Set(), widths: {} });
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false); // papelera: lista solo los borrados
  const [customCols, setCustomCols] = useState<ColumnDef[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  // Campos custom desde el metadata engine: se appendean a config.columns como
  // ColumnDefs editables (aparecen en tabla, panel de detalle, filtros y columnas).
  useEffect(() => {
    let alive = true;
    fetch(`/api/metadata/objects/${config.object}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && Array.isArray(d.fields)) setCustomCols(metaToColumns(d.fields));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [config.object]);

  // Papelera tiene prioridad sobre archivados: en la papelera mostramos los
  // borrados (incluye archivados-y-borrados), no la lista normal.
  const listUrl = (() => {
    const sep = config.listEndpoint.includes("?") ? "&" : "?";
    if (config.softDelete && showTrash) return `${config.listEndpoint}${sep}deleted=1&includeArchived=1`;
    if (config.archivable && showArchived) return `${config.listEndpoint}${sep}includeArchived=1`;
    return config.listEndpoint;
  })();

  // id -> timestamp (ms) de la última escritura CONFIRMADA por el servidor. Un
  // poll silencioso (withSpinner=false) cuya respuesta sea más vieja que esto
  // ignora esa fila en vez de pisarla: sin esto, un GET despachado antes de que
  // un save() comitee podía revertir visualmente un cambio ya confirmado (ej.
  // drag-and-drop en el kanban de proposals mientras otra fila está generándose
  // con IA, que activa el poll de 3s). ponytail: ventana de POLL_INTERVAL_MS en
  // vez de correlacionar requests exactos — alcanza porque el próximo poll (3s
  // después) siempre trae el estado ya consistente. (click-path-audit CLICK-PATH-001)
  const lastConfirmedWrite = useRef<Map<string, number>>(new Map());
  const POLL_INTERVAL_MS = 3000;

  const fetchRows = useCallback(
    (withSpinner: boolean) => {
      if (withSpinner) setLoading(true);
      return fetch(listUrl)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => {
          const list: RecordRow[] = Array.isArray(d) ? d : [];
          if (withSpinner) {
            setRows(list);
            return;
          }
          const now = Date.now();
          setRows((prev) => {
            const prevById = new Map(prev.map((r) => [r.id, r]));
            return list.map((row) => {
              const confirmedAt = lastConfirmedWrite.current.get(String(row.id));
              if (confirmedAt && now - confirmedAt < POLL_INTERVAL_MS) {
                return prevById.get(row.id) ?? row;
              }
              return row;
            });
          });
        })
        .catch(() => withSpinner && setRows([]))
        .finally(() => withSpinner && setLoading(false));
    },
    [listUrl]
  );

  useEffect(() => {
    fetchRows(true);
  }, [fetchRows, reloadSignal]);

  // Polling: mientras alguna fila cumpla pollWhile (ej. propuesta generandose con IA),
  // re-fetchea en silencio cada 3s. Se detiene solo cuando ninguna fila matchea.
  const shouldPoll = !!pollWhile && rows.some((r) => pollWhile(r));
  useEffect(() => {
    if (!shouldPoll) return;
    const t = setInterval(() => fetchRows(false), 3000);
    return () => clearInterval(t);
  }, [shouldPoll, fetchRows]);

  // Grupos/opciones dinámicos (ej. etapas del pipeline desde /api/pipeline)
  useEffect(() => {
    const ep = config.boardGroupsEndpoint;
    const map = config.boardGroupsMap;
    if (!ep || !map) return;
    let alive = true;
    fetch(ep)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const arr = Array.isArray(d) ? d : Array.isArray(d?.stages) ? d.stages : [];
        if (alive) setDynGroups(arr.map((x: Record<string, unknown>) => map(x)));
      })
      .catch(() => alive && setDynGroups([]));
    return () => {
      alive = false;
    };
  }, [config.boardGroupsEndpoint, config.boardGroupsMap]);

  const groups = config.boardGroups ?? dynGroups ?? [];

  // Inyecta las opciones dinámicas en la columna boardGroupKey (para el select inline
  // y el chip) y appendea los campos custom de la metadata al final.
  const columns = useMemo(() => {
    const base =
      config.boardGroupKey && groups.length
        ? config.columns.map((c) => (c.key === config.boardGroupKey ? { ...c, options: groups } : c))
        : config.columns;
    const merged = customCols.length ? [...base, ...customCols] : base;
    // Objetos custom no traen primary en su config (columns: []): marcamos el primer
    // campo de texto (o el primero) como título clicable de la tabla. No-op en built-ins.
    if (merged.length && !merged.some((c) => c.primary)) {
      const idx = Math.max(
        0,
        merged.findIndex((c) => c.type === "text" || c.type === "full_name" || c.type === "email")
      );
      return merged.map((c, i) => (i === idx ? { ...c, primary: true } : c));
    }
    return merged;
  }, [config.columns, config.boardGroupKey, groups, customCols]);

  const hasBoard = !!(config.boardGroupKey && groups.length);
  const hasCalendar = !!config.calendarDateKey;
  const primaryKey = columns.find((c) => c.primary)?.key ?? "name";

  // Columnas para exportar a CSV: primary + visibles, en el orden de la tabla.
  const exportColumns = useMemo(() => {
    const manageable = columns.filter((c) => !c.primary && !c.detailOnly && !colState.hidden.has(c.key));
    const primary = columns.filter((c) => c.primary);
    return [...primary, ...orderColumns(manageable, colState.order)];
  }, [columns, colState.hidden, colState.order]);

  // Set de keys de campos custom (van por PUT en el import, no en el POST).
  const customKeys = useMemo(() => new Set(customCols.map((c) => c.key)), [customCols]);

  const save = useCallback(
    async (id: string, key: string, value: unknown) => {
      let prevRow: RecordRow | undefined;
      setRows((rs) =>
        rs.map((r) => {
          if (r.id === id) {
            prevRow = r;
            return { ...r, [key]: value };
          }
          return r;
        })
      );
      try {
        const res = await fetch(config.updateEndpoint(id), {
          method: config.updateMethod ?? "PUT",
          headers: { "Content-Type": "application/json" },
          // incluimos id en el body: los endpoints REST por /[id] lo ignoran;
          // los que actualizan por body (ej. PATCH /api/tickets) lo necesitan.
          body: JSON.stringify({ id, [key]: value }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const updated = await res.json();
        if (updated && typeof updated === "object" && updated.id) {
          lastConfirmedWrite.current.set(String(id), Date.now());
          // merge solo sobreescribe las keys que el endpoint devuelve; preserva campos denormalizados (joins)
          setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...updated } : r)));
        }
      } catch {
        setRows((rs) => rs.map((r) => (r.id === id && prevRow ? prevRow : r)));
        toast.error("No se pudo guardar el cambio");
      }
    },
    [config]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const bySearch = !s
      ? rows
      : rows.filter((r) =>
          config.searchKeys.some((k) => {
            const v = r[k];
            if (Array.isArray(v) || (typeof v === "string" && v.startsWith("["))) {
              return parseTags(v).join(" ").toLowerCase().includes(s);
            }
            return String(v ?? "").toLowerCase().includes(s);
          })
        );
    return applyFilters(bySearch, filters, columns);
  }, [rows, search, config.searchKeys, filters, columns]);

  const activeRow = activeId ? rows.find((r) => r.id === activeId) ?? null : null;

  const toggleSelect = (id: string) =>
    setSelected((sel) => {
      const n = new Set(sel);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = (ids: string[]) =>
    setSelected((sel) => (ids.every((id) => sel.has(id)) ? new Set() : new Set(ids)));
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // En la papelera, las acciones de fila normales se reemplazan por Restaurar /
  // Borrar definitivo. Restaurar = PUT { deletedAt: null } (via save, optimista).
  // Borrar definitivo = DELETE ?hard=1 (purga real); RowActionButtons recarga al
  // resolver (onMutated => fetchRows) y muestra toast si lanza.
  const inTrash = !!(config.softDelete && showTrash);
  const trashActions = useMemo(
    () =>
      inTrash
        ? [
            {
              label: "Restaurar",
              icon: RotateCcw,
              onClick: async (row: RecordRow) => {
                await save(row.id, "deletedAt", null);
                setRows((rs) => rs.filter((r) => r.id !== row.id)); // sale de la papelera
              },
            },
            {
              label: "Borrar definitivo",
              icon: Trash2,
              onClick: async (row: RecordRow) => {
                const res = await fetch(`${config.deleteEndpoint!(row.id)}?hard=1`, { method: "DELETE" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                setRows((rs) => rs.filter((r) => r.id !== row.id));
              },
            },
          ]
        : config.rowActions,
    [inTrash, config.rowActions, config.deleteEndpoint, save]
  );

  // Fusión de duplicados (b7): exactamente 2 seleccionadas habilita el dialog.
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const doMerge = useCallback(
    async (survivorId: string, loserId: string, fields: Record<string, unknown>) => {
      const res = await fetch(config.mergeEndpoint!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survivorId, loserId, fields }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      clearSelection();
      await fetchRows(true);
    },
    [config.mergeEndpoint, clearSelection, fetchRows]
  );

  const applyView = useCallback((s: ViewSnapshot) => {
    setView(s.view);
    setSearch(s.search);
    setFilters(s.filters);
    setColState({ order: s.colState.order, hidden: new Set(s.colState.hidden), widths: s.colState.widths });
  }, []);

  return (
    <div className="flex flex-col h-full">
      <RecordViewBar
        title={config.title}
        count={filtered.length}
        total={rows.length}
        view={view}
        onView={setView}
        hasBoard={hasBoard}
        hasCalendar={hasCalendar}
        search={search}
        onSearch={setSearch}
        onNew={onNew}
        newLabel={newLabel}
        leading={
          <RecordViews
            object={config.object}
            current={{ view, search, filters, colState }}
            onApply={applyView}
          />
        }
      >
        {selected.size > 0 && !inTrash && (
          <RecordBulkActions
            config={config}
            exportColumns={exportColumns}
            selectedIds={[...selected]}
            rows={rows}
            statusOptions={config.boardGroupKey ? columns.find((c) => c.key === config.boardGroupKey)?.options ?? groups : []}
            save={save}
            refresh={() => fetchRows(true)}
            clearSelection={clearSelection}
          />
        )}
        {config.mergeEndpoint && selected.size === 2 && !inTrash && (
          <button
            type="button"
            onClick={() => setShowMerge(true)}
            className="flex items-center gap-1.5 h-8 rounded-md border border-primary/40 bg-[var(--selected)] px-2.5 text-[12px] font-medium text-foreground hover:bg-card transition-colors cursor-pointer"
          >
            <Merge className="h-3.5 w-3.5" />
            Fusionar
          </button>
        )}
        <RecordFilters columns={columns} filters={filters} onChange={setFilters} />
        {config.archivable && !showTrash && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={
              "flex items-center h-8 rounded-md border px-2.5 text-[12px] font-medium transition-colors cursor-pointer " +
              (showArchived
                ? "border-primary/40 bg-[var(--selected)] text-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground")
            }
          >
            {showArchived ? "Mostrando archivados" : "Ver archivados"}
          </button>
        )}
        {config.softDelete && (
          <button
            type="button"
            onClick={() => {
              setShowTrash((v) => !v);
              setShowArchived(false);
              setView("table"); // la papelera siempre en tabla (las acciones de fila viven ahí)
              clearSelection();
            }}
            className={
              "flex items-center gap-1.5 h-8 rounded-md border px-2.5 text-[12px] font-medium transition-colors cursor-pointer " +
              (showTrash
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-border bg-card text-muted-foreground hover:text-foreground")
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
            {showTrash ? "Saliendo de papelera" : "Papelera"}
          </button>
        )}
        {!inTrash && (
          <>
            <button
              type="button"
              onClick={() => {
                const sel = selected.size ? rows.filter((r) => selected.has(r.id)) : filtered;
                if (!sel.length) {
                  toast.error("No hay filas para exportar");
                  return;
                }
                exportCsv(config, exportColumns, sel);
              }}
              title={selected.size ? `Exportar ${selected.size} seleccionados` : "Exportar filas visibles"}
              className="flex items-center gap-1.5 h-8 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar
            </button>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 h-8 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              Importar
            </button>
          </>
        )}
        {view === "table" && <RecordColumns columns={columns} state={colState} onChange={setColState} />}
      </RecordViewBar>

      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="p-5 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-11 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : view === "board" && hasBoard && !inTrash ? (
          <RecordBoard
            rows={filtered}
            groupKey={config.boardGroupKey!}
            groups={groups}
            card={{
              primaryKey,
              hasAvatar: config.hasAvatar ?? true,
              subtitleKey: config.subtitleKey,
              cardFields: config.cardFields ?? [],
              columns,
            }}
            onMove={(id, group) => save(id, config.boardGroupKey!, group)}
            onOpen={(r) => setActiveId(r.id)}
          />
        ) : view === "calendar" && hasCalendar && !inTrash ? (
          <RecordCalendar
            rows={filtered}
            dateKey={config.calendarDateKey!}
            primaryKey={primaryKey}
            groupKey={config.boardGroupKey}
            groups={groups}
            onOpen={(r) => setActiveId(r.id)}
          />
        ) : (
          <RecordTable
            columns={columns}
            rows={filtered}
            onSave={save}
            onOpen={(r) => setActiveId(r.id)}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            hasAvatar={config.hasAvatar ?? true}
            subtitleKey={config.subtitleKey}
            rowActions={trashActions}
            onAction={() => fetchRows(true)}
            columnOrder={colState.order}
            hiddenKeys={colState.hidden}
            widthOverrides={colState.widths}
            onResize={(key, width) => setColState((s) => ({ ...s, widths: { ...s.widths, [key]: width } }))}
          />
        )}
      </div>

      <RecordDetailPanel config={{ ...config, columns, rowActions: trashActions }} row={activeRow} onClose={() => setActiveId(null)} onSave={save} onAction={() => fetchRows(true)} />

      <RecordImport
        open={showImport}
        onClose={() => setShowImport(false)}
        config={config}
        columns={columns}
        customKeys={customKeys}
        onDone={() => fetchRows(true)}
      />

      {config.mergeEndpoint && showMerge && selectedRows.length === 2 && (
        <RecordMergeDialog
          open={showMerge}
          onClose={() => setShowMerge(false)}
          columns={columns}
          rows={selectedRows}
          singular={config.singular}
          onMerge={doMerge}
        />
      )}
    </div>
  );
}
