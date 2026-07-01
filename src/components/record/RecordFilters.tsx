"use client";

import { useState } from "react";
import { Filter as FilterIcon, Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ColumnDef } from "./types";
import {
  type Filter,
  type FilterOp,
  opsForType,
  opDef,
  filterableColumns,
} from "./filters";

interface Props {
  columns: ColumnDef[];
  filters: Filter[];
  onChange: (filters: Filter[]) => void;
}

/** Chips de filtros activos + popover para agregar/editar. Vive en el slot de RecordViewBar. */
export function RecordFilters({ columns, filters, onChange }: Props) {
  const cols = filterableColumns(columns);
  const byKey = new Map(columns.map((c) => [c.key, c]));

  const update = (id: string, patch: Partial<Filter>) =>
    onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id: string) => onChange(filters.filter((f) => f.id !== id));

  const add = (col: ColumnDef) => {
    const op = opsForType(col.type)[0].op;
    // Corre solo en el click handler (linea 65), no durante render; la regla
    // no distingue closures y marca el Date.now/Math.random igual.
    // eslint-disable-next-line react-hooks/purity
    const id = `${col.key}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChange([...filters, { id, key: col.key, op, value: "" }]);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {filters.map((f) => {
        const col = byKey.get(f.key);
        if (!col) return null;
        return <FilterChip key={f.id} filter={f} col={col} onUpdate={(p) => update(f.id, p)} onRemove={() => remove(f.id)} />;
      })}

      <Popover>
        <PopoverTrigger
          className={cn(
            "flex items-center gap-1.5 h-8 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer",
            filters.length > 0 && "text-foreground"
          )}
          aria-label="Agregar filtro"
        >
          <FilterIcon className="h-3.5 w-3.5" />
          {filters.length === 0 ? "Filtrar" : <Plus className="h-3.5 w-3.5" />}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          <p className="px-2 py-1.5 text-[11px] font-semibold text-meta uppercase tracking-wide">Filtrar por</p>
          <div className="max-h-72 overflow-y-auto">
            {cols.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => add(c)}
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-[13px] hover:bg-hover cursor-pointer"
              >
                {c.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FilterChip({
  filter,
  col,
  onUpdate,
  onRemove,
}: {
  filter: Filter;
  col: ColumnDef;
  onUpdate: (patch: Partial<Filter>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ops = opsForType(col.type);
  const def = opDef(col.type, filter.op) ?? ops[0];
  const inputs = def.inputs ?? 1;

  const summary = () => {
    if (inputs === 0) return def.label;
    if (filter.value === "") return def.label + " …";
    let v = filter.value;
    if (def.select) v = col.options?.find((o) => o.value === filter.value)?.label ?? filter.value;
    if (inputs === 2 && filter.value2) return `${def.label} ${v} y ${filter.value2}`;
    return `${def.label} ${v}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center h-8 rounded-md border border-primary/40 bg-[var(--selected)] text-[12px] overflow-hidden">
        <PopoverTrigger className="flex items-center gap-1 pl-2.5 pr-1.5 h-full hover:bg-hover cursor-pointer" aria-label={`Editar filtro ${col.label}`}>
          <span className="font-medium text-foreground">{col.label}</span>
          <span className="text-muted-foreground truncate max-w-[140px]">{summary()}</span>
        </PopoverTrigger>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar filtro ${col.label}`}
          className="flex items-center justify-center h-full w-6 text-meta hover:text-foreground hover:bg-hover cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <PopoverContent align="start" className="w-60 gap-2 p-2.5">
        <p className="text-[12px] font-semibold text-foreground">{col.label}</p>

        <select
          value={filter.op}
          onChange={(e) => {
            const op = e.target.value as FilterOp;
            const nextInputs = opDef(col.type, op)?.inputs ?? 1;
            onUpdate({ op, ...(nextInputs === 0 ? { value: "", value2: undefined } : {}) });
          }}
          className="w-full h-8 rounded-md border border-border bg-card px-2 text-[13px] outline-none focus:border-primary cursor-pointer"
        >
          {ops.map((o) => (
            <option key={o.op} value={o.op}>
              {o.label}
            </option>
          ))}
        </select>

        {inputs > 0 &&
          (def.select ? (
            <select
              value={filter.value}
              onChange={(e) => onUpdate({ value: e.target.value })}
              className="w-full h-8 rounded-md border border-border bg-card px-2 text-[13px] outline-none focus:border-primary cursor-pointer"
            >
              <option value="">Elegir…</option>
              {(col.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type={inputType(col.type)}
                value={filter.value}
                onChange={(e) => onUpdate({ value: e.target.value })}
                placeholder={inputs === 2 ? "Desde" : "Valor"}
                className="w-full h-8 rounded-md border border-border bg-card px-2 text-[13px] outline-none focus:border-primary"
                autoFocus
              />
              {inputs === 2 && (
                <input
                  type={inputType(col.type)}
                  value={filter.value2 ?? ""}
                  onChange={(e) => onUpdate({ value2: e.target.value })}
                  placeholder="Hasta"
                  className="w-full h-8 rounded-md border border-border bg-card px-2 text-[13px] outline-none focus:border-primary"
                />
              )}
            </div>
          ))}
      </PopoverContent>
    </Popover>
  );
}

function inputType(type: ColumnDef["type"]): string {
  if (type === "date") return "date";
  if (type === "number" || type === "currency" || type === "amount" || type === "score") return "number";
  return "text";
}
