"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  FieldValue,
  parseTags,
  parseJson,
  Stars,
  ADDRESS_FIELDS,
  type AddressValue,
  type FullNameValue,
} from "./FieldValue";
import { numericEditorInitial, normalizeNumericInput } from "./field-logic";
import type { ColumnDef } from "./types";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  col: ColumnDef;
  value: unknown;
  /** guarda el nuevo valor; recibe el valor ya normalizado para el API */
  onSave: (value: unknown) => void | Promise<void>;
  /** "cell" (tabla, click para editar) | "card" (panel de detalle) */
  variant?: "cell" | "card";
  className?: string;
  /** label legible del registro vinculado (type 'relation'). */
  relationLabel?: string;
}

/** Campo con display de solo-lectura que pasa a editor al hacer click (estilo Twenty). */
export function InlineField({ col, value, onSave, variant = "cell", className, relationLabel }: Props) {
  const [editing, setEditing] = useState(false);

  // Relation editable: el editor es un popover de búsqueda (combobox), no inline-text.
  if (col.editable && col.type === "relation") {
    return (
      <RelationPicker
        col={col}
        value={value}
        relationLabel={relationLabel}
        variant={variant}
        className={className}
        onSave={onSave}
      />
    );
  }

  // Rating editable: click directo en la estrella, sin modo edición aparte.
  if (col.editable && col.type === "rating") {
    return (
      <div className={cn(variant === "cell" ? "px-3 py-2" : "py-1", className)}>
        <Stars value={Number(value) || 0} onPick={(n) => onSave(n)} />
      </div>
    );
  }

  // Multi-select editable: popover con checkboxes (toggle de opciones).
  if (col.editable && col.type === "multi_select") {
    return (
      <MultiSelectPicker col={col} value={value} variant={variant} className={className} onSave={onSave} />
    );
  }

  if (!col.editable) {
    return (
      <div className={cn(variant === "cell" ? "px-3 py-2" : "py-1", className)}>
        <FieldValue col={col} value={value} relationLabel={relationLabel} />
      </div>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Editar ${col.label}`}
        className={cn(
          "group/edit flex w-full items-center text-left rounded-sm transition-colors cursor-text",
          variant === "cell" ? "px-3 py-2 hover:bg-[var(--hover)]" : "px-2 py-1.5 hover:bg-[var(--hover)]",
          className
        )}
      >
        <FieldValue col={col} value={value} relationLabel={relationLabel} />
      </button>
    );
  }

  return (
    <Editor
      col={col}
      value={value}
      variant={variant}
      onCancel={() => setEditing(false)}
      onCommit={async (v) => {
        setEditing(false);
        if (v !== value) await onSave(v);
      }}
    />
  );
}

function Editor({
  col,
  value,
  variant,
  onCommit,
  onCancel,
}: {
  col: ColumnDef;
  value: unknown;
  variant: "cell" | "card";
  onCommit: (v: unknown) => void;
  onCancel: () => void;
}) {
  const base = cn(
    "w-full bg-card border border-primary rounded-sm outline-none text-[13px]",
    variant === "cell" ? "px-2.5 py-1.5" : "px-2 py-1.5"
  );

  // Select (stage / status / temperature / select): <select> nativo, robusto dentro de la tabla
  if (col.type === "select" || col.type === "stage" || col.type === "status" || col.type === "temperature") {
    const opts = col.options ?? [];
    return (
      <select
        autoFocus
        defaultValue={String(value ?? "")}
        className={base}
        onChange={(e) => onCommit(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  // Numérico / moneda / score
  if (col.type === "number" || col.type === "currency" || col.type === "amount" || col.type === "score") {
    return (
      <TextInput
        type="number"
        initial={numericEditorInitial(col.type, value)}
        className={base}
        onCancel={onCancel}
        onCommit={(raw) => {
          const n = normalizeNumericInput(col.type, raw);
          return n === null ? onCancel() : onCommit(n);
        }}
      />
    );
  }

  // Fecha: <input type="date"> nativo. Guarda al cambiar/salir; valor ISO YYYY-MM-DD.
  if (col.type === "date") {
    const d = value ? new Date(value as string | number) : null;
    const initial = d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
    return (
      <input
        type="date"
        autoFocus
        defaultValue={initial}
        className={base}
        onBlur={(e) => onCommit(e.target.value || null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") onCancel();
        }}
      />
    );
  }

  // Email: input de texto normal (mailto se arma en el display). Cae al default.

  // Booleano: <select> Sí/No nativo.
  if (col.type === "boolean") {
    const on = value === true || value === 1 || value === "true";
    return (
      <select
        autoFocus
        defaultValue={on ? "true" : "false"}
        className={base}
        onChange={(e) => onCommit(e.target.value === "true")}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        <option value="false">No</option>
        <option value="true">Sí</option>
      </select>
    );
  }

  // Texto largo: textarea (Enter = salto de línea; guarda al salir; Esc cancela)
  if (col.type === "longtext") {
    return (
      <TextArea
        initial={value == null ? "" : String(value)}
        className={cn(base, "min-h-24 resize-y leading-relaxed")}
        onCancel={onCancel}
        onCommit={(raw) => onCommit(raw)}
      />
    );
  }

  // Tags: coma-separado
  if (col.type === "tags") {
    return (
      <TextInput
        initial={parseTags(value).join(", ")}
        className={base}
        onCancel={onCancel}
        onCommit={(raw) =>
          onCommit(raw.split(",").map((s) => s.trim()).filter(Boolean))
        }
      />
    );
  }

  // Links: textarea, una URL por línea. Guarda JSON array.
  if (col.type === "links") {
    return (
      <TextArea
        initial={parseJson<string[]>(value, []).join("\n")}
        className={cn(base, "min-h-20 resize-y leading-relaxed")}
        onCancel={onCancel}
        onCommit={(raw) => onCommit(raw.split("\n").map((s) => s.trim()).filter(Boolean))}
      />
    );
  }

  // Address: inputs por campo. Guarda JSON object (solo campos no vacíos).
  if (col.type === "address") {
    return (
      <SubFieldForm
        fields={ADDRESS_FIELDS.map((f) => ({ key: f.key, label: f.label }))}
        initial={parseJson<AddressValue>(value, {}) as Record<string, unknown>}
        onCancel={onCancel}
        onCommit={onCommit}
      />
    );
  }

  // Full name: first + last. Guarda JSON object.
  if (col.type === "full_name") {
    return (
      <SubFieldForm
        fields={[
          { key: "first", label: "Nombre" },
          { key: "last", label: "Apellido" },
        ]}
        initial={parseJson<FullNameValue>(value, {}) as Record<string, unknown>}
        onCancel={onCancel}
        onCommit={onCommit}
      />
    );
  }

  // Texto por defecto
  return (
    <TextInput
      initial={value == null ? "" : String(value)}
      className={base}
      onCancel={onCancel}
      onCommit={(raw) => onCommit(raw)}
    />
  );
}

/** Form de sub-campos (address, full_name): inputs que commitean un JSON object
 *  al guardar (Cmd/Ctrl+Enter o botón Guardar). Esc cancela. Vacío -> object {}. */
function SubFieldForm({
  fields,
  initial,
  onCommit,
  onCancel,
}: {
  fields: { key: string; label: string }[];
  initial: Record<string, unknown>;
  onCommit: (v: unknown) => void;
  onCancel: () => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, initial[f.key] == null ? "" : String(initial[f.key])]))
  );
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const commit = () => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = vals[f.key]?.trim();
      if (v) out[f.key] = v;
    }
    onCommit(out); // {} si todo vacío -> display muestra "—"
  };

  return (
    <div className="flex flex-col gap-1.5 bg-card border border-primary rounded-sm p-2">
      {fields.map((f, i) => (
        <input
          key={f.key}
          ref={i === 0 ? firstRef : undefined}
          value={vals[f.key]}
          placeholder={f.label}
          className="w-full bg-surface-2 border border-border-soft rounded-sm outline-none text-[13px] px-2 py-1 focus:border-primary"
          onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
        />
      ))}
      <div className="flex justify-end gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-meta hover:text-foreground px-2 py-1 rounded-sm cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={commit}
          className="text-[12px] text-primary-foreground bg-primary hover:opacity-90 px-2.5 py-1 rounded-sm cursor-pointer"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

/** Editor de multi_select: popover con toggle de opciones (checkbox visual).
 *  Guarda JSON array de values al cerrar/cambiar. */
function MultiSelectPicker({
  col,
  value,
  variant,
  className,
  onSave,
}: {
  col: ColumnDef;
  value: unknown;
  variant: "cell" | "card";
  className?: string;
  onSave: (value: unknown) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseJson<string[]>(value, []);
  const opts = col.options ?? [];

  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    void onSave(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Editar ${col.label}`}
        className={cn(
          "group/edit flex w-full items-center text-left rounded-sm transition-colors cursor-pointer",
          variant === "cell" ? "px-3 py-2 hover:bg-[var(--hover)]" : "px-2 py-1.5 hover:bg-[var(--hover)]",
          className
        )}
      >
        <FieldValue col={col} value={value} />
      </PopoverTrigger>
      <PopoverContent className="p-0 w-64" align="start">
        <Command>
          <CommandInput placeholder={`Buscar ${col.label.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>Sin opciones.</CommandEmpty>
            <CommandGroup>
              {opts.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                    <Check className={cn("h-4 w-4 mr-2", on ? "opacity-100" : "opacity-0")} />
                    {o.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Editor de campo 'relation': popover con buscador (combobox shadcn).
 *  Carga opciones de col.relationConfig.searchEndpoint y guarda el id elegido. */
function RelationPicker({
  col,
  value,
  relationLabel,
  variant,
  className,
  onSave,
}: {
  col: ColumnDef;
  value: unknown;
  relationLabel?: string;
  variant: "cell" | "card";
  className?: string;
  onSave: (value: unknown) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<{ id: string; label: string }[] | null>(null);
  const cfg = col.relationConfig;

  useEffect(() => {
    if (!open || opts !== null || !cfg?.searchEndpoint) return;
    let alive = true;
    fetch(cfg.searchEndpoint)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: unknown) => {
        if (!alive) return;
        const rows = Array.isArray(d) ? d : Array.isArray((d as { items?: unknown[] })?.items) ? (d as { items: unknown[] }).items : [];
        const map = cfg.searchMap ?? ((raw: Record<string, unknown>) => ({ id: String(raw.id), label: String(raw.name ?? raw.title ?? raw.id) }));
        setOpts((rows as Record<string, unknown>[]).map(map));
      })
      .catch(() => alive && setOpts([]));
    return () => {
      alive = false;
    };
  }, [open, opts, cfg]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Editar ${col.label}`}
        className={cn(
          "group/edit flex w-full items-center text-left rounded-sm transition-colors cursor-pointer",
          variant === "cell" ? "px-3 py-2 hover:bg-[var(--hover)]" : "px-2 py-1.5 hover:bg-[var(--hover)]",
          className
        )}
      >
        {value ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 border border-border-soft px-2 py-0.5 text-[12px] text-foreground max-w-full">
            <span className="truncate">{relationLabel || String(value)}</span>
          </span>
        ) : (
          <span className="text-meta text-[13px]">—</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="p-0 w-64" align="start">
        <Command>
          <CommandInput placeholder={`Buscar ${col.label.toLowerCase()}...`} />
          <CommandList>
            {opts === null ? (
              <div className="py-4 text-center text-[13px] text-meta">Cargando...</div>
            ) : (
              <>
                <CommandEmpty>Sin resultados.</CommandEmpty>
                <CommandGroup>
                  {opts.map((o) => (
                    <CommandItem
                      key={o.id}
                      value={o.label}
                      onSelect={async () => {
                        setOpen(false);
                        if (o.id !== value) await onSave(o.id);
                      }}
                    >
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TextInput({
  initial,
  type = "text",
  className,
  onCommit,
  onCancel,
}: {
  initial: string;
  type?: string;
  className?: string;
  onCommit: (raw: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(initial);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      type={type}
      value={v}
      className={className}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(v);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

function TextArea({
  initial,
  className,
  onCommit,
  onCancel,
}: {
  initial: string;
  className?: string;
  onCommit: (raw: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [v, setV] = useState(initial);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <textarea
      ref={ref}
      value={v}
      className={className}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}
