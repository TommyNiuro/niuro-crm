"use client";

import { Search, Table2, Columns3, CalendarDays, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type RecordView = "table" | "board" | "calendar";

interface Props {
  title: string;
  count: number;
  total: number;
  view: RecordView;
  onView: (v: RecordView) => void;
  hasBoard: boolean;
  hasCalendar: boolean;
  search: string;
  onSearch: (q: string) => void;
  onNew?: () => void;
  newLabel?: string;
  /** slot a la izquierda, junto al título (ej. dropdown de vistas guardadas) */
  leading?: React.ReactNode;
  /** chips de filtro / acciones extra a la derecha */
  children?: React.ReactNode;
}

export function RecordViewBar({
  title,
  count,
  total,
  view,
  onView,
  hasBoard,
  hasCalendar,
  search,
  onSearch,
  onNew,
  newLabel = "Nuevo",
  leading,
  children,
}: Props) {
  return (
    <div className="relative z-10 flex items-center justify-between gap-3 px-5 h-[52px] border-b border-border shrink-0 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-[15px] font-semibold tracking-tight truncate">{title}</h1>
        <span className="text-[12px] text-meta tabular-nums">
          {count === total ? total : `${count} / ${total}`}
        </span>
        {leading}
      </div>

      <div className="flex items-center gap-2">
        {children}

        {(hasBoard || hasCalendar) && (
          <div className="flex items-center rounded-md border border-border p-0.5 bg-card">
            <ViewBtn active={view === "table"} onClick={() => onView("table")} label="Tabla">
              <Table2 className="h-3.5 w-3.5" />
            </ViewBtn>
            {hasBoard && (
              <ViewBtn active={view === "board"} onClick={() => onView("board")} label="Kanban">
                <Columns3 className="h-3.5 w-3.5" />
              </ViewBtn>
            )}
            {hasCalendar && (
              <ViewBtn active={view === "calendar"} onClick={() => onView("calendar")} label="Calendario">
                <CalendarDays className="h-3.5 w-3.5" />
              </ViewBtn>
            )}
          </div>
        )}

        <div className="relative w-[200px] max-w-[40vw]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-meta" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar..."
            aria-label="Buscar"
            className="w-full bg-card border border-border rounded-md pl-8 pr-3 h-8 text-[13px] outline-none focus:border-primary"
          />
        </div>

        {onNew && (
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 h-8 rounded-md px-3 text-[13px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            {newLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "flex items-center gap-1.5 h-7 rounded px-2.5 text-[12px] font-medium transition-colors cursor-pointer",
        active ? "bg-[var(--selected)] text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
