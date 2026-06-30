/**
 * Capa de filtros del record-view. Pura (sin React): define operadores por tipo
 * de columna y aplica una lista de filtros (combinados con AND) sobre las filas.
 * El filtrado corre client-side en RecordIndex, sumado al search de texto.
 */
import { parseTags } from "./FieldValue";
import type { ColumnDef, FieldType, RecordRow } from "./types";

export type FilterOp =
  | "contains"
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "between"
  | "is"
  | "isNot"
  | "before"
  | "after"
  | "true"
  | "false";

export interface Filter {
  /** id único para la lista de React (key de columna + nonce) */
  id: string;
  key: string;
  op: FilterOp;
  value: string;
  /** segundo valor para el operador "between" */
  value2?: string;
}

interface OpDef {
  op: FilterOp;
  label: string;
  /** cuántos inputs de valor necesita: 0 (true/false), 1 (default), 2 (between) */
  inputs?: 0 | 1 | 2;
  /** el input es un select de options en vez de texto libre */
  select?: boolean;
}

const TEXT_OPS: OpDef[] = [
  { op: "contains", label: "contiene" },
  { op: "eq", label: "es igual a" },
];

const NUM_OPS: OpDef[] = [
  { op: "eq", label: "=" },
  { op: "gt", label: ">" },
  { op: "lt", label: "<" },
  { op: "between", label: "entre", inputs: 2 },
];

const SELECT_OPS: OpDef[] = [
  { op: "is", label: "es", select: true },
  { op: "isNot", label: "no es", select: true },
];

const DATE_OPS: OpDef[] = [
  { op: "before", label: "antes de" },
  { op: "after", label: "después de" },
];

const BOOL_OPS: OpDef[] = [
  { op: "true", label: "sí", inputs: 0 },
  { op: "false", label: "no", inputs: 0 },
];

/** Operadores disponibles según el tipo de columna. */
export function opsForType(type: FieldType | "boolean"): OpDef[] {
  switch (type) {
    case "number":
    case "currency":
    case "amount":
    case "score":
      return NUM_OPS;
    case "select":
    case "status":
    case "stage":
    case "temperature":
      return SELECT_OPS;
    case "date":
      return DATE_OPS;
    case "boolean":
      return BOOL_OPS;
    default:
      return TEXT_OPS; // text, longtext, link, tags
  }
}

export function opDef(type: FieldType | "boolean", op: FilterOp): OpDef | undefined {
  return opsForType(type).find((o) => o.op === op);
}

/** Columnas filtrables: todas menos las que no tienen un valor escalar útil. */
export function filterableColumns(columns: ColumnDef[]): ColumnDef[] {
  return columns.filter((c) => c.type !== "longtext");
}

function num(v: unknown): number {
  return Number(v);
}

function dateMs(v: unknown): number {
  const d = new Date(v as string | number);
  return d.getTime();
}

/** ¿la fila pasa este filtro? Valor/columna ausente o filtro incompleto => pasa. */
function matchOne(row: RecordRow, f: Filter, col: ColumnDef): boolean {
  const raw = row[f.key];
  const type = col.type;

  switch (f.op) {
    case "contains":
    case "eq": {
      if (f.value === "") return true;
      const needle = f.value.toLowerCase();
      const hay =
        type === "tags"
          ? parseTags(raw).join(" ")
          : String(raw ?? "");
      const h = hay.toLowerCase();
      return f.op === "contains" ? h.includes(needle) : h === needle;
    }
    case "gt":
    case "lt": {
      if (f.value === "" || raw == null) return raw == null ? false : true;
      return f.op === "gt" ? num(raw) > num(f.value) : num(raw) < num(f.value);
    }
    case "between": {
      if (f.value === "" || f.value2 === "" || f.value2 == null || raw == null) return raw != null;
      const lo = Math.min(num(f.value), num(f.value2));
      const hi = Math.max(num(f.value), num(f.value2));
      return num(raw) >= lo && num(raw) <= hi;
    }
    case "is":
    case "isNot": {
      if (f.value === "") return true;
      const equal = String(raw ?? "") === f.value;
      return f.op === "is" ? equal : !equal;
    }
    case "before":
    case "after": {
      if (f.value === "" || raw == null) return false;
      const target = dateMs(f.value);
      const v = dateMs(raw);
      if (isNaN(v) || isNaN(target)) return false;
      return f.op === "before" ? v < target : v > target;
    }
    case "true":
      return raw === true || raw === 1 || raw === "true";
    case "false":
      return !(raw === true || raw === 1 || raw === "true");
    default:
      return true;
  }
}

/** Aplica todos los filtros (AND). Ignora filtros cuya columna ya no existe. */
export function applyFilters(rows: RecordRow[], filters: Filter[], columns: ColumnDef[]): RecordRow[] {
  if (!filters.length) return rows;
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const active = filters.filter((f) => byKey.has(f.key));
  if (!active.length) return rows;
  return rows.filter((row) => active.every((f) => matchOne(row, f, byKey.get(f.key)!)));
}

// ponytail: self-check inline; corre con `npx tsx filters.ts`. Sin framework.
if (typeof process !== "undefined" && process.env.RUN_FILTER_DEMO) {
  const cols: ColumnDef[] = [
    { key: "name", label: "Nombre", type: "text" },
    { key: "score", label: "Score", type: "score" },
    { key: "stage", label: "Etapa", type: "status" },
    { key: "created", label: "Creado", type: "date" },
  ];
  const rows: RecordRow[] = [
    { id: "1", name: "Ana", score: 80, stage: "won", created: "2024-01-10" },
    { id: "2", name: "Beto", score: 20, stage: "lost", created: "2024-06-01" },
    { id: "3", name: "Caro", score: 50, stage: "won", created: "2024-03-15" },
  ];
  const a = (assert: boolean, msg: string) => {
    if (!assert) throw new Error("FAIL: " + msg);
  };
  a(applyFilters(rows, [{ id: "f1", key: "name", op: "contains", value: "a" }], cols).length === 2, "contains a");
  a(applyFilters(rows, [{ id: "f2", key: "score", op: "gt", value: "40" }], cols).length === 2, "score>40");
  a(applyFilters(rows, [{ id: "f3", key: "score", op: "between", value: "40", value2: "90" }], cols).length === 2, "between");
  a(applyFilters(rows, [{ id: "f4", key: "stage", op: "is", value: "won" }], cols).length === 2, "stage is won");
  a(applyFilters(rows, [{ id: "f5", key: "stage", op: "isNot", value: "won" }], cols).length === 1, "stage isNot won");
  a(applyFilters(rows, [{ id: "f6", key: "created", op: "after", value: "2024-04-01" }], cols).length === 1, "after date");
  a(
    applyFilters(
      rows,
      [
        { id: "f7", key: "stage", op: "is", value: "won" },
        { id: "f8", key: "score", op: "gt", value: "60" },
      ],
      cols
    ).length === 1,
    "AND combinado"
  );
  // eslint-disable-next-line no-console
  console.log("filters.ts: todos los checks OK");
}
