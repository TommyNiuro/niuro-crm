"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseCsv } from "./csv";
import type { ColumnDef, RecordConfig } from "./types";

const IGNORE = "__ignore__";

/** Columnas mapeables del objeto: las editables (incluye custom) + el primary. */
function importableColumns(config: RecordConfig, columns: ColumnDef[]): ColumnDef[] {
  return columns.filter((c) => c.primary || (c.editable && !c.detailOnly && c.type !== "date"));
}

interface Props {
  open: boolean;
  onClose: () => void;
  config: RecordConfig;
  /** columnas resueltas (config + custom de metadata), como las arma RecordIndex. */
  columns: ColumnDef[];
  /** nombres de los campos custom (van por PUT tras crear, no en el POST). */
  customKeys: Set<string>;
  /** se llama al terminar una importación con al menos 1 fila ok. */
  onDone: () => void;
}

type Step = "upload" | "map" | "importing" | "done";

interface Result {
  ok: number;
  fail: number;
  errors: string[];
}

export function RecordImport({ open, onClose, config, columns, customKeys, onDone }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  // mapping[csvColumnIndex] = key de campo del objeto, o IGNORE.
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fields = useMemo(() => importableColumns(config, columns), [config, columns]);

  const reset = () => {
    setStep("upload");
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setResult(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    const matrix = parseCsv(text);
    if (matrix.length < 1) {
      toast.error("El CSV esta vacio");
      return;
    }
    const hs = matrix[0];
    const body = matrix.slice(1);
    // Auto-mapeo: si un header coincide (case-insensitive) con un label o key de campo.
    const auto: Record<number, string> = {};
    hs.forEach((h, i) => {
      const norm = h.trim().toLowerCase();
      const hit = fields.find(
        (f) => f.label.toLowerCase() === norm || f.key.toLowerCase() === norm
      );
      auto[i] = hit ? hit.key : IGNORE;
    });
    setHeaders(hs);
    setDataRows(body);
    setMapping(auto);
    setStep("map");
  };

  const mappedFields = Object.values(mapping).filter((k) => k !== IGNORE);
  const primaryKey = fields.find((f) => f.primary)?.key;
  // El primary (ej. name / title) es obligatorio: sin el, el POST rebota.
  const missingPrimary = !!primaryKey && !mappedFields.includes(primaryKey);

  const runImport = async () => {
    setStep("importing");
    const errors: string[] = [];
    let ok = 0;
    let fail = 0;

    for (let r = 0; r < dataRows.length; r++) {
      const csvRow = dataRows[r];
      const core: Record<string, unknown> = {};
      const custom: Record<string, unknown> = {};
      for (const [idxStr, key] of Object.entries(mapping)) {
        if (key === IGNORE) continue;
        const raw = csvRow[Number(idxStr)] ?? "";
        const val = raw.trim();
        if (val === "") continue;
        if (customKeys.has(key)) custom[key] = val;
        else core[key] = val;
      }
      if (primaryKey && !core[primaryKey]) {
        fail++;
        errors.push(`Fila ${r + 2}: falta ${primaryKey}`);
        continue;
      }
      try {
        const res = await fetch(config.listEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(core),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || `HTTP ${res.status}`);
        }
        const created = await res.json();
        // Campos custom: van por PUT sobre el id recien creado (el POST los ignora).
        if (created?.id && Object.keys(custom).length) {
          await fetch(config.updateEndpoint(created.id), {
            method: config.updateMethod ?? "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: created.id, ...custom }),
          }).catch(() => {});
        }
        ok++;
      } catch (e) {
        fail++;
        if (errors.length < 20) errors.push(`Fila ${r + 2}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    setResult({ ok, fail, errors });
    setStep("done");
    if (ok > 0) onDone();
  };

  const preview = dataRows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar {config.title}</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Subi un CSV. La primera fila debe ser el encabezado."}
            {step === "map" && "Mapea cada columna del CSV a un campo. Las que no uses, ignoralas."}
            {step === "importing" && "Importando..."}
            {step === "done" && "Resultado de la importacion."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
            className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border py-10 text-center"
          >
            <Upload className="h-7 w-7 text-meta" />
            <p className="text-[13px] text-muted-foreground">Arrastra un .csv o</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover transition-colors cursor-pointer"
            >
              Elegir archivo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="max-h-[40vh] overflow-auto rounded-md border border-border">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-meta">
                    <th className="px-3 py-2 font-medium">Columna CSV</th>
                    <th className="px-3 py-2 font-medium">Ejemplo</th>
                    <th className="px-3 py-2 font-medium">Mapear a</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium truncate max-w-[160px]">{h || `(col ${i + 1})`}</td>
                      <td className="px-3 py-2 text-meta truncate max-w-[160px]">{preview[0]?.[i] ?? ""}</td>
                      <td className="px-3 py-2">
                        <select
                          value={mapping[i] ?? IGNORE}
                          onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))}
                          className="w-full bg-card border border-border rounded px-2 h-7 text-[13px] outline-none focus:border-primary cursor-pointer"
                        >
                          <option value={IGNORE}>Ignorar</option>
                          {fields.map((f) => {
                            const usedElsewhere = Object.entries(mapping).some(
                              ([k, v]) => Number(k) !== i && v === f.key
                            );
                            return (
                              <option key={f.key} value={f.key} disabled={usedElsewhere}>
                                {f.label}
                                {f.primary ? " *" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-meta">
              {dataRows.length} fila{dataRows.length === 1 ? "" : "s"} a importar.
              {missingPrimary && primaryKey && (
                <span className="text-destructive"> Falta mapear el campo obligatorio.</span>
              )}
            </p>
          </div>
        )}

        {step === "importing" && (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Importando {dataRows.length} fila{dataRows.length === 1 ? "" : "s"}...
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3">
            <p className="text-[14px]">
              <span className="font-semibold text-foreground">{result.ok}</span> importado
              {result.ok === 1 ? "" : "s"}
              {result.fail > 0 && (
                <>
                  {", "}
                  <span className="font-semibold text-destructive">{result.fail}</span> con error
                </>
              )}
              .
            </p>
            {result.errors.length > 0 && (
              <div className="max-h-[30vh] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-[12px] text-muted-foreground space-y-1">
                {result.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "map" && (
            <>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="flex items-center gap-1 h-8 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Atras
              </button>
              <button
                type="button"
                disabled={missingPrimary || mappedFields.length === 0}
                onClick={runImport}
                className="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                Importar {dataRows.length}
              </button>
            </>
          )}
          {step === "done" && (
            <button
              type="button"
              onClick={close}
              className="h-8 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover transition-colors cursor-pointer"
            >
              Listo
            </button>
          )}
          {(step === "upload" || step === "importing") && (
            <button
              type="button"
              disabled={step === "importing"}
              onClick={close}
              className="h-8 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
