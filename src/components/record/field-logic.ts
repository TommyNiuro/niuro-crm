import type { ColumnDef, FieldType, RecordRow } from "./types";

/**
 * Valor inicial que muestra el editor numerico. Para 'currency' los montos se
 * guardan en CENTAVOS USD: se dividen por 100 para editar en unidades.
 */
export function numericEditorInitial(type: FieldType, value: unknown): string {
  if (type === "currency") return String((Number(value) || 0) / 100);
  return String(Number(value) || 0);
}

/**
 * Normaliza lo que escribio el usuario al valor que persiste el API.
 * Devuelve `null` si el input no es numero (el caller cancela la edicion).
 * 'currency' multiplica por 100 (unidades -> centavos). Clamps por tipo.
 */
export function normalizeNumericInput(type: FieldType, raw: string): number | null {
  const n = Number(raw);
  if (isNaN(n)) return null;
  if (type === "currency") return Math.max(0, Math.round(n * 100));
  if (type === "amount") return Math.max(0, Math.round(n));
  if (type === "score") return Math.max(0, Math.min(100, Math.round(n)));
  return n;
}

/**
 * Comparador de filas del RecordTable. `dir` = 1 (asc) | -1 (desc).
 * Nulls SIEMPRE al final (independiente de la direccion). Numerico para
 * number/currency/score; localeCompare es para el resto.
 */
export function compareRows(
  a: RecordRow,
  b: RecordRow,
  key: string,
  col: ColumnDef | undefined,
  dir: 1 | -1
): number {
  const av = a[key];
  const bv = b[key];
  if (av == null) return 1;
  if (bv == null) return -1;
  if (col && (col.type === "number" || col.type === "currency" || col.type === "score")) {
    return (Number(av) - Number(bv)) * dir;
  }
  return String(av).localeCompare(String(bv), "es") * dir;
}
