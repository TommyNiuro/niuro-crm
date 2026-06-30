"use client";

import { Columns3, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "./types";

/** Estado de gestión de columnas, vive en RecordIndex. */
export interface ColumnState {
  /** orden de keys (incluye ocultas) */
  order: string[];
  hidden: Set<string>;
  /** anchos override por key (px) */
  widths: Record<string, number>;
}

interface Props {
  columns: ColumnDef[]; // todas las columnas de tabla (sin primary, sin detailOnly se filtra acá)
  state: ColumnState;
  onChange: (next: ColumnState) => void;
}

/** Popover "Columnas": mostrar/ocultar y reordenar. El resize vive en el header de RecordTable. */
export function RecordColumns({ columns, state, onChange }: Props) {
  // solo columnas de tabla manejables (primary siempre visible/fija; detailOnly nunca en tabla)
  const manageable = columns.filter((c) => !c.primary && !c.detailOnly);
  const byKey = new Map(manageable.map((c) => [c.key, c]));
  const ordered = orderColumns(manageable, state.order);

  const toggle = (key: string) => {
    const hidden = new Set(state.hidden);
    hidden.has(key) ? hidden.delete(key) : hidden.add(key);
    onChange({ ...state, hidden });
  };

  const move = (key: string, dir: -1 | 1) => {
    const keys = ordered.map((c) => c.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    onChange({ ...state, order: keys });
  };

  const hiddenCount = manageable.filter((c) => state.hidden.has(c.key)).length;

  return (
    <Popover>
      <PopoverTrigger
        className="flex items-center gap-1.5 h-8 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        aria-label="Gestionar columnas"
      >
        <Columns3 className="h-3.5 w-3.5" />
        Columnas
        {hiddenCount > 0 && <span className="text-meta tabular-nums">({manageable.length - hiddenCount})</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1">
        <p className="px-2 py-1.5 text-[11px] font-semibold text-meta uppercase tracking-wide">Columnas</p>
        <div className="max-h-80 overflow-y-auto">
          {ordered.map((c, i) => {
            const visible = !state.hidden.has(c.key);
            return (
              <div key={c.key} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-hover">
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  aria-label={visible ? `Ocultar ${c.label}` : `Mostrar ${c.label}`}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left text-[13px] cursor-pointer"
                >
                  {visible ? <Eye className="h-3.5 w-3.5 text-foreground shrink-0" /> : <EyeOff className="h-3.5 w-3.5 text-meta shrink-0" />}
                  <span className={cn("truncate", !visible && "text-meta")}>{c.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => move(c.key, -1)}
                  disabled={i === 0}
                  aria-label={`Subir ${c.label}`}
                  className="h-6 w-6 flex items-center justify-center rounded text-meta hover:text-foreground hover:bg-card disabled:opacity-25 disabled:cursor-default cursor-pointer"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(c.key, 1)}
                  disabled={i === ordered.length - 1}
                  aria-label={`Bajar ${c.label}`}
                  className="h-6 w-6 flex items-center justify-center rounded text-meta hover:text-foreground hover:bg-card disabled:opacity-25 disabled:cursor-default cursor-pointer"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        {byKey.size === 0 && <p className="px-2 py-3 text-[12px] text-meta">Sin columnas.</p>}
      </PopoverContent>
    </Popover>
  );
}

/** Aplica orden guardado; keys nuevas (no en order) van al final en su orden original. */
export function orderColumns<T extends { key: string }>(cols: T[], order: string[]): T[] {
  if (!order.length) return cols;
  const rank = new Map(order.map((k, i) => [k, i]));
  return [...cols].sort((a, b) => {
    const ra = rank.has(a.key) ? rank.get(a.key)! : Infinity;
    const rb = rank.has(b.key) ? rank.get(b.key)! : Infinity;
    return ra - rb;
  });
}
