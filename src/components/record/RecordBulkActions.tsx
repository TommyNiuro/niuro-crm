"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Archive, Trash2, Tag, X, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportCsv } from "./csv";
import type { ColumnDef, RecordConfig, RecordRow, SelectOption } from "./types";

// cellText/csvCell viven en ./csv (compartidos con el import). Re-export para no
// romper imports existentes (tests).
export { cellText, csvCell } from "./csv";

/** Aplica una acción a cada id en serie; tolera errores por fila y reporta al final. */
async function runSerial(ids: string[], fn: (id: string) => Promise<void>): Promise<number> {
  let fails = 0;
  for (const id of ids) {
    try {
      await fn(id);
    } catch {
      fails++;
    }
  }
  return fails;
}

interface Props {
  config: RecordConfig;
  /** columnas visibles y en orden (para el CSV). */
  exportColumns: ColumnDef[];
  selectedIds: string[];
  rows: RecordRow[];
  /** opciones del campo de estado (boardGroupKey), ya resueltas (dinámicas incluidas). */
  statusOptions: SelectOption[];
  /** guarda 1 campo de 1 fila (optimista, ya en RecordIndex). */
  save: (id: string, key: string, value: unknown) => Promise<void>;
  /** refresca la lista del server tras borrar. */
  refresh: () => void;
  clearSelection: () => void;
}

export function RecordBulkActions({
  config,
  exportColumns,
  selectedIds,
  rows,
  statusOptions,
  save,
  refresh,
  clearSelection,
}: Props) {
  const [busy, setBusy] = useState(false);
  // confirm: "archive" | "delete" | null
  const [confirm, setConfirm] = useState<null | "archive" | "delete">(null);

  const n = selectedIds.length;
  const hasArchive = !!config.archivable || config.columns.some((c) => c.key === "archived");
  const hasDelete = !!config.deleteEndpoint;
  const canChangeStatus = !!config.boardGroupKey && statusOptions.length > 0;

  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));

  const changeStatus = async (value: string) => {
    setBusy(true);
    const fails = await runSerial(selectedIds, (id) => save(id, config.boardGroupKey!, value));
    setBusy(false);
    if (fails) toast.error(`${fails} de ${n} no se pudieron cambiar`);
    else toast.success(`${n} actualizado${n === 1 ? "" : "s"}`);
    clearSelection();
  };

  const doArchive = async () => {
    setConfirm(null);
    setBusy(true);
    const fails = await runSerial(selectedIds, (id) => save(id, "archived", true));
    setBusy(false);
    if (fails) toast.error(`${fails} de ${n} no se pudieron archivar`);
    else toast.success(`${n} archivado${n === 1 ? "" : "s"}`);
    clearSelection();
  };

  const doDelete = async () => {
    setConfirm(null);
    setBusy(true);
    const del = config.deleteEndpoint!;
    const fails = await runSerial(selectedIds, async (id) => {
      const res = await fetch(del(id), { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });
    setBusy(false);
    if (fails) toast.error(`${fails} de ${n} no se pudieron borrar`);
    else toast.success(`${n} borrado${n === 1 ? "" : "s"}`);
    refresh();
    clearSelection();
  };

  return (
    <>
      <div className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-[var(--selected)] pl-2.5 pr-1.5 h-8">
        <span className="text-[12px] font-medium text-foreground tabular-nums">
          {n} seleccionado{n === 1 ? "" : "s"}
        </span>
        <span className="h-4 w-px bg-border mx-0.5" />

        {canChangeStatus && (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={busy}
              className="flex items-center gap-1 h-6 rounded px-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer disabled:opacity-50"
            >
              <Tag className="h-3.5 w-3.5" />
              Cambiar estado
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-meta">
                  Cambiar estado
                </DropdownMenuLabel>
                {statusOptions.map((o) => (
                  <DropdownMenuItem key={o.value} onClick={() => changeStatus(o.value)} className="text-[13px] cursor-pointer">
                    {o.color && <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />}
                    {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <BulkBtn disabled={busy} onClick={() => exportCsv(config, exportColumns, selectedRows)}>
          <Download className="h-3.5 w-3.5" />
          Exportar
        </BulkBtn>

        {hasArchive && (
          <BulkBtn disabled={busy} onClick={() => setConfirm("archive")}>
            <Archive className="h-3.5 w-3.5" />
            Archivar
          </BulkBtn>
        )}

        {hasDelete && (
          <BulkBtn disabled={busy} onClick={() => setConfirm("delete")} danger>
            <Trash2 className="h-3.5 w-3.5" />
            Borrar
          </BulkBtn>
        )}

        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-meta" />}

        <span className="h-4 w-px bg-border mx-0.5" />
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Limpiar selección"
          className="h-6 w-6 flex items-center justify-center rounded text-meta hover:text-foreground hover:bg-card transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "delete" ? "Borrar" : "Archivar"} {n} {config.singular}
              {n === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "delete"
                ? "Esta accion no se puede deshacer. Se borraran los registros seleccionados."
                : "Los registros seleccionados se marcaran como archivados."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="h-8 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirm === "delete" ? doDelete : doArchive}
              className={
                "h-8 rounded-md px-3 text-[13px] font-medium text-white transition-colors cursor-pointer " +
                (confirm === "delete" ? "bg-destructive hover:opacity-90" : "bg-primary hover:bg-primary-hover")
              }
            >
              {confirm === "delete" ? "Borrar" : "Archivar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BulkBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "flex items-center gap-1 h-6 rounded px-1.5 text-[12px] transition-colors cursor-pointer disabled:opacity-50 " +
        (danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:text-foreground hover:bg-card")
      }
    >
      {children}
    </button>
  );
}
