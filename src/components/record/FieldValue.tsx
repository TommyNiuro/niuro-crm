"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, Star } from "lucide-react";
import { StagePill } from "@/components/ds";
import { cn } from "@/lib/utils";
import type { ColumnDef, SelectOption } from "./types";

const TEMP: Record<string, { label: string; color: string }> = {
  hot: { label: "Caliente", color: "var(--destructive)" },
  warm: { label: "Tibio", color: "var(--warning)" },
  cold: { label: "Frio", color: "var(--meta)" },
};

export function parseTags(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return v.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

/** Parsea un valor que puede venir como JSON string (EAV) u objeto/array ya nativo. */
export function parseJson<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

export interface AddressValue {
  street?: string;
  city?: string;
  region?: string;
  zip?: string;
  country?: string;
}
export interface FullNameValue {
  first?: string;
  last?: string;
}

export const ADDRESS_FIELDS: { key: keyof AddressValue; label: string }[] = [
  { key: "street", label: "Calle" },
  { key: "city", label: "Ciudad" },
  { key: "region", label: "Region" },
  { key: "zip", label: "Codigo postal" },
  { key: "country", label: "Pais" },
];

export function formatCurrencyUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);
}

function optionLabel(options: SelectOption[] | undefined, value: string): string {
  return options?.find((o) => o.value === value)?.label ?? value;
}

/** Render de solo-lectura del valor de un campo según su tipo.
 *  `relationLabel` es el texto legible del registro vinculado (type 'relation'),
 *  cuando el id (value) no alcanza para mostrarlo. */
export function FieldValue({
  col,
  value,
  relationLabel,
}: {
  col: ColumnDef;
  value: unknown;
  relationLabel?: string;
}) {
  if (value === null || value === undefined || value === "") {
    if (col.type === "stage" && typeof value === "string") {
      /* fallthrough */
    } else if (col.type === "rating") {
      return <Stars value={0} />;
    } else {
      return <span className="text-meta">—</span>;
    }
  }

  switch (col.type) {
    case "stage":
      return <StagePill stage={String(value)} />;
    case "temperature": {
      const t = TEMP[String(value)] ?? { label: String(value), color: "var(--meta)" };
      return (
        <span className="inline-flex items-center gap-1.5 text-[13px]">
          <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
          {t.label}
        </span>
      );
    }
    case "score": {
      const temp = TEMP["cold"]; // color por defecto; el dot real se calcula en la tabla
      return (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums" style={{ color: temp.color }}>
          {Number(value)}
        </span>
      );
    }
    case "currency":
      return <span className="text-[13px] tabular-nums">{formatCurrencyUSD(Number(value))}</span>;
    case "amount":
      return (
        <span className="text-[13px] tabular-nums">
          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0)}
        </span>
      );
    case "number":
      return <span className="text-[13px] tabular-nums">{Number(value)}</span>;
    case "status": {
      const opt = col.options?.find((o) => o.value === String(value));
      const color = opt?.color ?? "var(--meta)";
      return (
        <span
          className="inline-flex items-center font-semibold whitespace-nowrap rounded"
          style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)`, fontSize: 10, padding: "2px 8px" }}
        >
          {opt?.label ?? String(value)}
        </span>
      );
    }
    case "select":
      return <span className="text-[13px]">{optionLabel(col.options, String(value))}</span>;
    case "boolean": {
      const on = value === true || value === 1 || value === "true";
      return <span className="text-[13px] text-muted-foreground">{on ? "Sí" : "No"}</span>;
    }
    case "date": {
      const d = new Date(value as string | number);
      if (isNaN(d.getTime())) return <span className="text-meta">—</span>;
      return (
        <span className="text-[13px] text-muted-foreground">
          {d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      );
    }
    case "tags": {
      const tags = parseTags(value);
      if (!tags.length) return <span className="text-meta">—</span>;
      return (
        <span className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {t}
            </span>
          ))}
        </span>
      );
    }
    case "longtext": {
      const text = String(value);
      return (
        <div className="relative text-[13px] text-foreground whitespace-pre-wrap leading-relaxed bg-surface-2 rounded-md p-2.5 pr-8 max-h-72 overflow-y-auto">
          {text}
          <CopyButton text={text} />
        </div>
      );
    }
    case "email": {
      const addr = String(value);
      return (
        <a
          href={`mailto:${addr}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[13px] text-primary hover:underline truncate inline-block max-w-full"
        >
          {addr}
        </a>
      );
    }
    case "relation": {
      const id = String(value);
      const href = col.relationConfig?.href(id) ?? "#";
      const label = relationLabel ?? id;
      return (
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md bg-surface-2 border border-border-soft px-2 py-0.5 text-[12px] text-foreground hover:bg-hover transition-colors max-w-full"
        >
          <span className="truncate">{label}</span>
        </Link>
      );
    }
    case "link": {
      const href = String(value);
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[13px] text-primary hover:underline truncate inline-block max-w-full"
        >
          {href.replace(/^https?:\/\//, "")}
        </a>
      );
    }
    case "rating":
      return <Stars value={Number(value) || 0} />;
    case "multi_select": {
      const vals = parseJson<string[]>(value, []);
      if (!vals.length) return <span className="text-meta">—</span>;
      return (
        <span className="flex flex-wrap gap-1">
          {vals.map((v) => {
            const opt = col.options?.find((o) => o.value === v);
            const color = opt?.color;
            return (
              <span
                key={v}
                className={cn("rounded px-1.5 py-0.5 text-[11px]", !color && "bg-surface-2 text-muted-foreground")}
                style={color ? { color, background: `color-mix(in srgb, ${color} 14%, transparent)` } : undefined}
              >
                {opt?.label ?? v}
              </span>
            );
          })}
        </span>
      );
    }
    case "links": {
      const urls = parseJson<string[]>(value, []);
      if (!urls.length) return <span className="text-meta">—</span>;
      return (
        <span className="flex flex-wrap gap-1.5">
          {urls.map((u) => (
            <a
              key={u}
              href={u}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded bg-surface-2 border border-border-soft px-1.5 py-0.5 text-[11px] text-primary hover:underline max-w-full truncate"
            >
              {u.replace(/^https?:\/\//, "")}
            </a>
          ))}
        </span>
      );
    }
    case "address": {
      const a = parseJson<AddressValue>(value, {});
      const parts = [a.street, a.city, a.region, a.zip, a.country].filter(Boolean);
      if (!parts.length) return <span className="text-meta">—</span>;
      return <span className="text-[13px] text-foreground">{parts.join(", ")}</span>;
    }
    case "full_name": {
      const n = parseJson<FullNameValue>(value, {});
      const full = [n.first, n.last].filter(Boolean).join(" ");
      if (!full) return <span className="text-meta">—</span>;
      return <span className="text-[13px] text-foreground">{full}</span>;
    }
    default:
      return <span className="text-[13px] text-foreground">{String(value)}</span>;
  }
}

/** Estrellas 0-5. Solo display; el editor (InlineField) maneja el click. */
function Stars({ value, onPick }: { value: number; onPick?: (n: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "h-3.5 w-3.5",
            n <= value ? "fill-warning text-warning" : "text-meta",
            onPick && "cursor-pointer"
          )}
          onClick={
            onPick
              ? (e) => {
                  e.stopPropagation();
                  onPick(n === value ? 0 : n); // click en la estrella actual = limpiar
                }
              : undefined
          }
        />
      ))}
    </span>
  );
}

export { Stars };

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copiar"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="absolute top-1.5 right-1.5 h-6 w-6 rounded flex items-center justify-center text-meta hover:text-foreground hover:bg-hover transition-colors cursor-pointer"
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
