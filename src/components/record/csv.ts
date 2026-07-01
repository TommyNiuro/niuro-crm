/**
 * CSV del record-view: export (celda -> texto, por tipo de columna) e import
 * (parser RFC 4180 que tolera comillas y saltos de linea dentro de celdas).
 * Hand-rolled a proposito: no vale meter una dependencia (papaparse) para esto.
 */
import { parseTags } from "./FieldValue";
import type { ColumnDef, RecordConfig, RecordRow } from "./types";

/** Texto plano de una celda para CSV, según el tipo de columna (espeja FieldValue). */
export function cellText(col: ColumnDef, row: RecordRow): string {
  const value = row[col.key];
  if (value === null || value === undefined) return "";
  switch (col.type) {
    case "currency":
      return String((Number(value) || 0) / 100);
    case "status":
    case "select":
    case "temperature":
      return col.options?.find((o) => o.value === String(value))?.label ?? String(value);
    case "boolean":
      return value === true || value === 1 || value === "true" ? "Sí" : "No";
    case "date": {
      const d = new Date(value as string | number);
      return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    }
    case "tags":
      return parseTags(value).join("; ");
    case "relation":
      return String(row[col.relationConfig?.labelKey ?? col.key] ?? value);
    default:
      return String(value);
  }
}

/** Escapa una celda CSV + anti-injection: prefija ' si arranca con = + - @. */
export function csvCell(s: string): string {
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Genera el CSV de unas filas con las columnas dadas y dispara la descarga. */
export function exportCsv(config: RecordConfig, columns: ColumnDef[], rows: RecordRow[]) {
  const header = columns.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(cellText(c, r))).join(",")).join("\n");
  const blob = new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${config.object}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parsea CSV a matriz de strings. Soporta comillas dobles (escapadas como ""),
 * comas y saltos de linea dentro de celdas entrecomilladas, y CRLF/CR/LF.
 * Devuelve filas no vacias (descarta la fila final si quedo en blanco).
 */
export function parseCsv(text: string): string[][] {
  // Quita BOM si el archivo lo trae.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      // \r\n: consumimos el \n que sigue.
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  // Ultima celda/fila si el archivo no termina en salto de linea.
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Descarta filas totalmente vacias (ej. linea final en blanco).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

if (process.env.NODE_ENV === "test" || process.argv?.[1]?.endsWith("csv.ts")) {
  // ponytail: self-check del parser (lo no trivial). corre con `npx tsx src/components/record/csv.ts`.
  const out = parseCsv('a,b,c\n"x,1","y\n2","z""q"\n,,\nlast');
  const ok =
    out.length === 3 &&
    out[0].join("|") === "a|b|c" &&
    out[1].join("|") === "x,1|y\n2|z\"q" &&
    out[2].join("|") === "last";
  if (!ok) throw new Error("parseCsv self-check fallo: " + JSON.stringify(out));
  console.log("parseCsv OK");
}
