/**
 * Helpers del metadata engine (EAV). Los valores de campos custom viven en
 * custom_field_values (object_name, record_id, field_id) y se mergean en las
 * filas que devuelven los GET de cada objeto, keyed por field.name.
 *
 * Server-only: usa el handle better-sqlite3 crudo (rawDb).
 */
import { rawDb } from "@/db";
import type { FieldType } from "@/components/record/types";

// Tipos validos para un field custom: los del record-view (types.ts). Se valida
// en la API antes de crear el field.
export const FIELD_TYPES: FieldType[] = [
  "text", "number", "currency", "amount", "score", "select", "status", "stage",
  "temperature", "date", "tags", "longtext", "link", "email", "relation", "boolean",
  "rating", "multi_select", "links", "address", "full_name",
];

export function isValidFieldType(t: unknown): t is FieldType {
  return typeof t === "string" && (FIELD_TYPES as string[]).includes(t);
}

export interface CustomFieldMeta {
  id: string;
  name: string;
  type: FieldType;
}

/** Campos custom (id, name, type) de un objeto, ordenados por position. */
export function listCustomFields(objectName: string): CustomFieldMeta[] {
  return rawDb
    .prepare(
      `SELECT id, name, type FROM field_metadata
       WHERE object_name = ? AND is_custom = 1 ORDER BY position, created_at`
    )
    .all(objectName) as CustomFieldMeta[];
}

/**
 * Agrega a cada row sus valores de custom_field_values, keyed por field.name.
 * Una sola query por la tabla de valores (IN sobre los ids de la pagina).
 * No-op si el objeto no tiene campos custom.
 */
export function mergeCustomFields<T extends { id: string }>(
  objectName: string,
  rows: T[]
): (T & Record<string, unknown>)[] {
  if (!rows.length) return rows;
  const fields = listCustomFields(objectName);
  if (!fields.length) return rows;

  const fieldNameById = new Map(fields.map((f) => [f.id, f.name]));
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const values = rawDb
    .prepare(
      `SELECT record_id, field_id, value FROM custom_field_values
       WHERE object_name = ? AND record_id IN (${placeholders})`
    )
    .all(objectName, ...ids) as { record_id: string; field_id: string; value: string | null }[];

  const byRecord = new Map<string, Record<string, unknown>>();
  for (const v of values) {
    const name = fieldNameById.get(v.field_id);
    if (!name) continue;
    let bag = byRecord.get(v.record_id);
    if (!bag) byRecord.set(v.record_id, (bag = {}));
    bag[name] = v.value;
  }

  return rows.map((r) => {
    // Default: cada campo custom presente como null aunque no tenga valor, para
    // que el record-view sepa que la columna existe en la fila.
    const merged: Record<string, unknown> = {};
    for (const f of fields) merged[f.name] = null;
    return { ...r, ...merged, ...(byRecord.get(r.id) ?? {}) };
  });
}

/** Upsert de un valor de campo custom. value null borra (limpia la celda). */
export function saveCustomField(
  objectName: string,
  recordId: string,
  fieldName: string,
  value: unknown,
  fieldId?: string
): void {
  let id = fieldId;
  if (!id) {
    const row = rawDb
      .prepare(`SELECT id FROM field_metadata WHERE object_name = ? AND name = ? AND is_custom = 1`)
      .get(objectName, fieldName) as { id: string } | undefined;
    if (!row) return; // no es un campo custom de este objeto
    id = row.id;
  }
  if (value === null || value === undefined || value === "") {
    rawDb
      .prepare(`DELETE FROM custom_field_values WHERE object_name = ? AND record_id = ? AND field_id = ?`)
      .run(objectName, recordId, id);
    return;
  }
  const str = typeof value === "string" ? value : JSON.stringify(value);
  rawDb
    .prepare(
      `INSERT INTO custom_field_values (object_name, record_id, field_id, value)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(object_name, record_id, field_id) DO UPDATE SET value = excluded.value`
    )
    .run(objectName, recordId, id, str);
}

/**
 * Separa el body de un PUT: extrae las keys que son campos custom del objeto y
 * las guarda en custom_field_values; devuelve el resto (las columnas reales) para
 * que la ruta haga el UPDATE normal. Evita duplicar logica en cada ruta.
 */
export function applyCustomFieldsFromBody(
  objectName: string,
  recordId: string,
  body: Record<string, unknown>
): Record<string, unknown> {
  const fields = listCustomFields(objectName);
  if (!fields.length) return body;
  const byName = new Map(fields.map((f) => [f.name, f]));
  const rest: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(body)) {
    const f = byName.get(key);
    if (f) saveCustomField(objectName, recordId, f.name, val, f.id);
    else rest[key] = val;
  }
  return rest;
}
