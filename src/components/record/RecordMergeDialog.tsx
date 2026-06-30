"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Merge, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cellText } from "./csv";
import type { ColumnDef, RecordRow } from "./types";

/**
 * Fusiona 2 registros duplicados. Muestra ambos lado a lado por campo y deja
 * elegir cuál registro sobrevive (encabezado) y, por campo, de cuál de los dos
 * tomar el valor. Default por campo: el primer valor NO vacío (empezando por el
 * superviviente). Al confirmar llama onMerge(survivorId, loserId, fields).
 */
export function RecordMergeDialog({
  open,
  onClose,
  columns,
  rows,
  singular,
  onMerge,
}: {
  open: boolean;
  onClose: () => void;
  columns: ColumnDef[];
  /** exactamente 2 filas del mismo objeto. */
  rows: RecordRow[];
  singular: string;
  /** ejecuta la fusión en el backend; fields = overrides del superviviente. */
  onMerge: (survivorId: string, loserId: string, fields: Record<string, unknown>) => Promise<void>;
}) {
  // Cuál de los 2 sobrevive (índice 0 o 1). El otro se borra (soft).
  const [survivorIdx, setSurvivorIdx] = useState(0);
  // Por columna, de cuál fila tomar el valor (índice 0 o 1).
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  // Campos a comparar: editables y no detail-only de relación; saltea primary
  // sólo si no es editable. Mostramos todo lo que tenga valor en alguno.
  const fields = useMemo(
    () => columns.filter((c) => c.type !== "relation" && c.key !== "archived"),
    [columns]
  );

  const isEmpty = (v: unknown) =>
    v === null || v === undefined || (typeof v === "string" && v.trim() === "");

  // Default por campo: si el valor del superviviente está vacío y el del perdedor
  // no, propone el del perdedor. Calculado on-the-fly (no estado) salvo override.
  const pickFor = (key: string): number => {
    if (key in picks) return picks[key];
    const loserIdx = survivorIdx === 0 ? 1 : 0;
    const sv = rows[survivorIdx]?.[key];
    const lv = rows[loserIdx]?.[key];
    return isEmpty(sv) && !isEmpty(lv) ? loserIdx : survivorIdx;
  };

  if (rows.length !== 2) return null;

  const confirm = async () => {
    setBusy(true);
    const survivor = rows[survivorIdx];
    const loser = rows[survivorIdx === 0 ? 1 : 0];
    // overrides: campos cuyo valor elegido viene del perdedor (el superviviente ya
    // tiene su propio valor; sólo mandamos lo que hay que cambiar).
    const overrides: Record<string, unknown> = {};
    for (const col of fields) {
      const from = rows[pickFor(col.key)];
      if (from.id !== survivor.id && !isEmpty(from[col.key])) overrides[col.key] = from[col.key];
    }
    try {
      await onMerge(survivor.id, loser.id, overrides);
      toast.success("Contactos fusionados");
      onClose();
    } catch {
      toast.error("No se pudo fusionar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fusionar {singular}s duplicados</DialogTitle>
          <DialogDescription>
            Elige el registro que sobrevive y, por cada campo, el valor a conservar. El otro se mueve a la papelera y sus relaciones (deals, propuestas, notas, tareas, archivos) se reasignan.
          </DialogDescription>
        </DialogHeader>

        {/* Encabezado: elegir superviviente */}
        <div className="grid grid-cols-[140px_1fr_1fr] gap-2 items-center">
          <div />
          {rows.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSurvivorIdx(i)}
              className={
                "rounded-md border px-3 py-2 text-left text-[13px] transition-colors cursor-pointer " +
                (survivorIdx === i
                  ? "border-primary bg-[var(--selected)] text-foreground font-medium"
                  : "border-border bg-card text-muted-foreground hover:text-foreground")
              }
            >
              <div className="truncate">{String(r.name ?? "—")}</div>
              <div className="text-[11px] text-meta">{survivorIdx === i ? "Sobrevive" : "Se descarta"}</div>
            </button>
          ))}
        </div>

        {/* Tabla de campos */}
        <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
          {fields.map((col) => {
            const picked = pickFor(col.key);
            const a = cellText(col, rows[0]);
            const b = cellText(col, rows[1]);
            if (isEmpty(a) && isEmpty(b)) return null;
            return (
              <div key={col.key} className="grid grid-cols-[140px_1fr_1fr] gap-2 items-stretch py-1">
                <div className="text-[12px] text-meta pt-2">{col.label}</div>
                {[0, 1].map((i) => {
                  const txt = i === 0 ? a : b;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPicks((p) => ({ ...p, [col.key]: i }))}
                      className={
                        "rounded-md border px-2.5 py-1.5 text-left text-[13px] min-h-[34px] break-words transition-colors cursor-pointer " +
                        (picked === i
                          ? "border-primary/60 bg-[var(--selected)] text-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground")
                      }
                    >
                      {isEmpty(txt) ? <span className="text-meta italic">vacío</span> : txt}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-8 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="flex items-center gap-1.5 h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Merge className="h-3.5 w-3.5" />}
            Fusionar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
