"use client";

import { useMemo, useState, useRef } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { RowActionButtons } from "./RowActionButtons";
import { Avatar } from "@/components/ds";
import { InlineField } from "./InlineField";
import { FieldValue } from "./FieldValue";
import { orderColumns } from "./RecordColumns";
import { compareRows } from "./field-logic";
import type { ColumnDef, RecordRow, RowAction } from "./types";
import { cn } from "@/lib/utils";

const TEMP_DOT: Record<string, string> = {
  hot: "var(--destructive)",
  warm: "var(--warning)",
  cold: "var(--meta)",
};

interface Props {
  columns: ColumnDef[];
  rows: RecordRow[];
  onSave: (id: string, key: string, value: unknown) => void | Promise<void>;
  onOpen: (row: RecordRow) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  hasAvatar?: boolean;
  subtitleKey?: string;
  rowActions?: RowAction[];
  /** recarga la lista tras una rowAction de mutación (onClick) */
  onAction?: () => void;
  /** gestión de columnas (vive en RecordIndex) */
  columnOrder?: string[];
  hiddenKeys?: Set<string>;
  widthOverrides?: Record<string, number>;
  onResize?: (key: string, width: number) => void;
}

export function RecordTable({
  columns,
  rows,
  onSave,
  onOpen,
  selected,
  onToggleSelect,
  onToggleAll,
  hasAvatar = true,
  subtitleKey,
  rowActions,
  onAction,
  columnOrder = [],
  hiddenKeys,
  widthOverrides,
  onResize,
}: Props) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compareRows(a, b, sortKey, col, dir));
  }, [rows, sortKey, sortDir, columns]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const allIds = sorted.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const primaryCol = columns.find((c) => c.primary);
  const restCols = useMemo(() => {
    const base = columns.filter((c) => !c.primary && !c.detailOnly && !(hiddenKeys?.has(c.key)));
    const ordered = orderColumns(base, columnOrder);
    return widthOverrides
      ? ordered.map((c) => (widthOverrides[c.key] ? { ...c, width: widthOverrides[c.key] } : c))
      : ordered;
  }, [columns, columnOrder, hiddenKeys, widthOverrides]);

  return (
    <div className="h-full overflow-auto">
      <table className="border-collapse text-[13px]" style={{ minWidth: "max-content" }}>
        <thead className="sticky top-0 z-[3]">
          <tr className="bg-background border-b border-border">
            <th className="sticky left-0 z-[4] bg-background w-9 px-0">
              <div className="flex items-center justify-center h-9">
                <Check checked={allSelected} onChange={() => onToggleAll(allIds)} label="Seleccionar todo" />
              </div>
            </th>
            {primaryCol && (
              <Th col={primaryCol} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} sticky left={36} primary />
            )}
            {restCols.map((c) => (
              <Th key={c.key} col={c} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} onResize={onResize} />
            ))}
            {rowActions?.length ? <th className="w-px" /> : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const isSel = selected.has(row.id);
            return (
              <tr key={row.id} className="group border-b border-border-soft">
                <td
                  className="sticky left-0 z-[2] w-9 px-0 bg-background group-hover:bg-[var(--hover)]"
                  style={isSel ? { background: "var(--selected)" } : undefined}
                >
                  <div className="flex items-center justify-center h-[42px]">
                    <Check checked={isSel} onChange={() => onToggleSelect(row.id)} label={`Seleccionar ${String(row.name ?? row.id)}`} />
                  </div>
                </td>

                {primaryCol && (
                  <td
                    className="sticky left-9 z-[2] border-r border-border-soft bg-background group-hover:bg-[var(--hover)]"
                    style={{ width: primaryCol.width ?? 240, ...(isSel ? { background: "var(--selected)" } : {}) }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(row)}
                      className="flex items-center gap-2.5 w-full text-left px-3 py-2 cursor-pointer"
                      aria-label={`Abrir ${String(row[primaryCol.key] ?? "registro")}`}
                    >
                      {hasAvatar ? (
                        <Avatar name={String(row[primaryCol.key] ?? "?")} size={26} online={Boolean(row.online)} country={(row.country as string) ?? null} />
                      ) : (
                        <span className="h-[26px] w-[26px] shrink-0 rounded-md bg-surface-2 border border-border-soft flex items-center justify-center text-[11px] font-semibold text-meta">
                          {String(row[primaryCol.key] ?? "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium truncate text-foreground">{String(row[primaryCol.key] ?? "—")}</span>
                        {subtitleKey && row[subtitleKey] ? <span className="block text-[11px] text-meta truncate">{String(row[subtitleKey])}</span> : null}
                      </span>
                    </button>
                  </td>
                )}

                {restCols.map((col) => (
                  <td key={col.key} className="align-middle group-hover:bg-[var(--hover)]" style={{ width: col.width ?? 160 }}>
                    {col.type === "score" ? (
                      <div className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums">
                          <span className="h-2 w-2 rounded-full" style={{ background: TEMP_DOT[String(row.temperature)] ?? "var(--meta)" }} />
                          {Number(row[col.key] ?? 0)}
                        </span>
                      </div>
                    ) : col.editable ? (
                      <InlineField
                        col={col}
                        value={row[col.key]}
                        relationLabel={col.relationConfig?.labelKey ? String(row[col.relationConfig.labelKey] ?? "") : undefined}
                        onSave={(v) => onSave(row.id, col.key, v)}
                      />
                    ) : (
                      <div className="px-3 py-2">
                        <FieldValue
                          col={col}
                          value={row[col.key]}
                          relationLabel={col.relationConfig?.labelKey ? String(row[col.relationConfig.labelKey] ?? "") : undefined}
                        />
                      </div>
                    )}
                  </td>
                ))}

                {rowActions?.length ? (
                  <td className="px-2 whitespace-nowrap group-hover:bg-[var(--hover)]">
                    <div className="flex items-center gap-1">
                      <RowActionButtons actions={rowActions} row={row} onMutated={onAction} variant="table" />
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="p-12 text-center text-[13px] text-muted-foreground">Sin resultados.</div>
      )}
    </div>
  );
}

function Th({
  col,
  sortKey,
  sortDir,
  onSort,
  sticky,
  left,
  primary,
  onResize,
}: {
  col: ColumnDef;
  sortKey: string | null;
  sortDir: "asc" | "desc";
  onSort: (k: string) => void;
  sticky?: boolean;
  left?: number;
  primary?: boolean;
  onResize?: (key: string, width: number) => void;
}) {
  const active = sortKey === col.key;
  const thRef = useRef<HTMLTableCellElement>(null);

  // resize por drag del borde derecho del header; min 80px. Listeners se limpian al soltar.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = thRef.current?.offsetWidth ?? col.width ?? 160;
    const onMove = (ev: PointerEvent) => onResize!(col.key, Math.max(80, startW + (ev.clientX - startX)));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <th
      ref={thRef}
      className={cn(
        "relative text-left text-[11px] font-semibold text-meta uppercase tracking-wide h-9 select-none",
        sticky && "sticky z-[4] bg-background border-r border-border-soft"
      )}
      style={{ left: sticky ? left : undefined, width: col.width ?? (primary ? 240 : 160) }}
    >
      <button
        type="button"
        onClick={() => col.sortable !== false && onSort(col.key)}
        className={cn("flex items-center gap-1 px-3 h-full w-full", col.sortable !== false && "hover:text-foreground cursor-pointer")}
      >
        {col.label}
        {col.sortable !== false &&
          (active ? (
            sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover:opacity-40" />
          ))}
      </button>
      {onResize && (
        <span
          onPointerDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label={`Redimensionar ${col.label}`}
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 z-[5]"
        />
      )}
    </th>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "h-4 w-4 rounded border flex items-center justify-center transition-colors cursor-pointer",
        checked ? "bg-primary border-primary" : "border-input hover:border-meta"
      )}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="var(--primary-foreground)" strokeWidth={2}>
          <path d="M2.5 6.5L5 9l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
