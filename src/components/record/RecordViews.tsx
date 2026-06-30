"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Plus, Trash2, LayoutGrid } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { RecordView } from "./RecordViewBar";
import type { ColumnState } from "./RecordColumns";
import type { Filter } from "./filters";

/** Snapshot serializable de TODO el estado de vista de un objeto. */
export interface ViewSnapshot {
  view: RecordView;
  search: string;
  filters: Filter[];
  colState: { order: string[]; hidden: string[]; widths: Record<string, number> };
}

export interface SavedView {
  id: string;
  name: string;
  snapshot: ViewSnapshot;
}

const DEFAULT_ID = "all";

interface Props {
  object: string;
  /** estado actual (para guardar una vista nueva) */
  current: { view: RecordView; search: string; filters: Filter[]; colState: ColumnState };
  /** aplica un snapshot al estado vivo de RecordIndex */
  onApply: (s: ViewSnapshot) => void;
}

const lsKey = (object: string) => `recordViews:${object}`;
const activeKey = (object: string) => `recordViews:${object}:active`;

function load(object: string): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(lsKey(object));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function snapshot(c: Props["current"]): ViewSnapshot {
  return {
    view: c.view,
    search: c.search,
    filters: c.filters,
    colState: { order: c.colState.order, hidden: [...c.colState.hidden], widths: c.colState.widths },
  };
}

/** Dropdown de vistas guardadas. Persiste en localStorage por objeto y aplica snapshots. */
export function RecordViews({ object, current, onApply }: Props) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeId, setActiveId] = useState<string>(DEFAULT_ID);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const hydrated = useRef(false);

  // Hidrata desde localStorage al montar (y al cambiar de objeto). Aplica la vista activa guardada.
  useEffect(() => {
    const saved = load(object);
    setViews(saved);
    const active = typeof window !== "undefined" ? window.localStorage.getItem(activeKey(object)) : null;
    const found = active && saved.find((v) => v.id === active);
    if (found) {
      setActiveId(found.id);
      onApply(found.snapshot);
    } else {
      setActiveId(DEFAULT_ID);
    }
    hydrated.current = true;
    // ponytail: onApply omitido de deps a propósito (solo corre al montar/cambiar objeto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object]);

  const persist = (next: SavedView[], active: string) => {
    setViews(next);
    setActiveId(active);
    try {
      window.localStorage.setItem(lsKey(object), JSON.stringify(next));
      window.localStorage.setItem(activeKey(object), active);
    } catch {
      /* localStorage lleno o bloqueado: la vista igual funciona en memoria */
    }
  };

  const apply = (v: SavedView | null) => {
    if (v) {
      onApply(v.snapshot);
      persist(views, v.id);
    } else {
      onApply({ view: "table", search: "", filters: [], colState: { order: [], hidden: [], widths: {} } });
      persist(views, DEFAULT_ID);
    }
    setOpen(false);
  };

  const create = () => {
    const n = name.trim();
    if (!n) return;
    const v: SavedView = { id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: n, snapshot: snapshot(current) };
    persist([...views, v], v.id);
    setName("");
    setCreating(false);
    setOpen(false);
  };

  const remove = (id: string) => {
    const next = views.filter((v) => v.id !== id);
    persist(next, activeId === id ? DEFAULT_ID : activeId);
    if (activeId === id) onApply({ view: "table", search: "", filters: [], colState: { order: [], hidden: [], widths: {} } });
  };

  const activeName = views.find((v) => v.id === activeId)?.name ?? "Todos";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center gap-1.5 h-8 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground hover:bg-hover transition-colors cursor-pointer"
        aria-label="Vistas guardadas"
      >
        <LayoutGrid className="h-3.5 w-3.5 text-meta" />
        <span className="max-w-[120px] truncate">{activeName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-meta" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1">
        <p className="px-2 py-1.5 text-[11px] font-semibold text-meta uppercase tracking-wide">Vistas</p>
        <div className="max-h-72 overflow-y-auto">
          <ViewRow name="Todos" active={activeId === DEFAULT_ID} onSelect={() => apply(null)} />
          {views.map((v) => (
            <ViewRow
              key={v.id}
              name={v.name}
              active={activeId === v.id}
              onSelect={() => apply(v)}
              onDelete={() => remove(v.id)}
            />
          ))}
        </div>

        <div className="border-t border-border mt-1 pt-1">
          {creating ? (
            <div className="flex items-center gap-1 px-1.5 py-1">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setName("");
                  }
                }}
                placeholder="Nombre de la vista"
                aria-label="Nombre de la vista"
                className="flex-1 min-w-0 bg-card border border-border rounded px-2 h-7 text-[13px] outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={create}
                disabled={!name.trim()}
                className="h-7 px-2 rounded text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-40 disabled:cursor-default cursor-pointer"
              >
                Guardar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-hover cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-meta" />
              Guardar vista actual
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ViewRow({
  name,
  active,
  onSelect,
  onDelete,
}: {
  name: string;
  active: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={cn("group flex items-center gap-1 rounded px-1.5 py-1 hover:bg-hover", active && "bg-[var(--selected)]")}>
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-2 flex-1 min-w-0 text-left text-[13px] cursor-pointer"
      >
        <Check className={cn("h-3.5 w-3.5 shrink-0", active ? "text-foreground" : "text-transparent")} />
        <span className="truncate">{name}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Borrar vista ${name}`}
          className="h-6 w-6 flex items-center justify-center rounded text-meta opacity-0 group-hover:opacity-100 hover:text-foreground cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
