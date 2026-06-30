"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { RecordRow, RowAction } from "./types";

/** Renderiza las rowActions de una fila: href => <Link> (navega), onClick =>
 *  <button> (muta y recarga via onMutated). Compartido por tabla y detalle. */
export function RowActionButtons({
  actions,
  row,
  onMutated,
  variant = "table",
}: {
  actions: RowAction[];
  row: RecordRow;
  /** se llama tras una mutación exitosa (onClick) para refrescar la lista. */
  onMutated?: () => void;
  variant?: "table" | "detail";
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const cls =
    variant === "detail"
      ? "inline-flex items-center gap-1 h-8 rounded-md border border-primary/40 bg-[var(--selected)] px-2.5 text-[12px] font-medium text-foreground hover:bg-hover transition-colors disabled:opacity-50"
      : "inline-flex items-center gap-1 h-7 rounded-md border border-border bg-card px-2 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-hover transition-colors disabled:opacity-50";

  return (
    <>
      {actions.map((a) => {
        if (a.show && !a.show(row)) return null;
        const Icon = a.icon;

        if (a.onClick) {
          return (
            <button
              key={a.label}
              type="button"
              disabled={busy === a.label}
              onClick={async (e) => {
                e.stopPropagation();
                setBusy(a.label);
                try {
                  await a.onClick!(row);
                  onMutated?.();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "No se pudo completar la accion");
                } finally {
                  setBusy(null);
                }
              }}
              className={cls}
            >
              {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
              {a.label}
            </button>
          );
        }

        const href = a.href?.(row);
        if (!href) return null;
        return (
          <Link key={a.label} href={href} onClick={(e) => e.stopPropagation()} className={cls}>
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {a.label}
          </Link>
        );
      })}
    </>
  );
}
