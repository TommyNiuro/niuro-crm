"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { STAGE_CFG } from "@/lib/crm-ui";
import type { RecordRow, SelectOption } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  rows: RecordRow[];
  /** key del campo fecha que ubica cada registro en la grilla. */
  dateKey: string;
  /** key del campo título (primary) de la tarjeta. */
  primaryKey: string;
  /** key del campo estado/etapa para colorear la tarjeta (opcional). */
  groupKey?: string;
  /** opciones del grupo (value -> color/label) para resolver el color. */
  groups: SelectOption[];
  onOpen: (row: RecordRow) => void;
}

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Día local (YYYY-MM-DD) de un valor fecha; null si no parsea. */
function dayKey(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = new Date(value as string | number);
  if (isNaN(d.getTime())) return null;
  // ponytail: usamos fecha local (no UTC) para que el registro caiga en el día que ve el operador
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Color de la tarjeta a partir del valor de grupo (mismo criterio que RecordBoard). */
function colorFor(value: unknown, groups: SelectOption[]): string | undefined {
  const v = String(value ?? "");
  const g = groups.find((o) => o.value === v);
  return g?.color ?? STAGE_CFG[v]?.text;
}

export function RecordCalendar({ rows, dateKey, primaryKey, groupKey, groups, onOpen }: Props) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  // Registros agrupados por día local.
  const byDay = useMemo(() => {
    const m = new Map<string, RecordRow[]>();
    for (const r of rows) {
      const k = dayKey(r[dateKey]);
      if (!k) continue;
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return m;
  }, [rows, dateKey]);

  // Celdas de la grilla: arranca el lunes de la semana del día 1 y cubre semanas completas.
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7; // lun=0 ... dom=6
    const out: Date[] = [];
    // 6 semanas (42 celdas) cubre cualquier mes; recortamos filas vacías sobrantes abajo.
    // Cada celda se construye desde el día 1 del mes restando el offset y sumando i,
    // dejando que Date normalice el cruce de mes/año.
    for (let i = 0; i < 42; i++) out.push(new Date(year, month, 1 - offset + i));
    // recorta la última fila si entera fuera del mes
    while (out.length > 35 && out[out.length - 7].getMonth() !== month) out.length -= 7;
    return out;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString("es", { month: "long", year: "numeric" });
  const todayKey = dayKey(new Date());

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2.5 shrink-0">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="text-[14px] font-semibold capitalize">{monthLabel}</span>
        <button
          type="button"
          onClick={() => {
            const n = new Date();
            setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
          }}
          className="ml-1 h-7 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Hoy
        </button>
      </div>

      <div className="grid grid-cols-7 border-t border-l border-border-soft shrink-0">
        {WEEKDAYS.map((w) => (
          <div key={w} className="border-r border-b border-border-soft px-2 py-1 text-[11px] font-semibold text-meta">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-border-soft flex-1 min-h-0 overflow-y-auto auto-rows-fr">
        {cells.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const items = byDay.get(k) ?? [];
          return (
            <div
              key={k}
              className={cn(
                "border-r border-b border-border-soft p-1 min-h-[88px] flex flex-col gap-1",
                !inMonth && "bg-surface-2/40"
              )}
            >
              <span
                className={cn(
                  "text-[11px] tabular-nums px-1",
                  k === todayKey
                    ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold"
                    : inMonth
                      ? "text-muted-foreground"
                      : "text-meta"
                )}
              >
                {d.getDate()}
              </span>
              {items.map((r) => {
                const color = groupKey ? colorFor(r[groupKey], groups) : undefined;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onOpen(r)}
                    title={String(r[primaryKey] ?? "")}
                    className="flex items-center gap-1.5 rounded border border-border bg-card px-1.5 py-1 text-left text-[11px] hover:border-meta transition-colors cursor-pointer"
                  >
                    {color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />}
                    <span className="truncate">{String(r[primaryKey] ?? "—")}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
