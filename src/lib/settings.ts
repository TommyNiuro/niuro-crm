/**
 * Lectura/escritura de crm_settings desde código server-only (better-sqlite3).
 * NO importar en Client Components. Conexión fresca por llamada (evita el ciclo
 * operator.ts <-> db/index.ts). Fallback silencioso si la DB no existe todavía.
 */
import Database from "better-sqlite3";
import { sharedDb } from "./db-open";

/** Lee varias claves de una. Devuelve solo las presentes (value != null). */
export function readSettings(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (keys.length === 0) return out;
  try {
    // sharedDb(): conexión persistente. readSettings es HOT (hasAccount en el gate
    // del middleware, operator, bridge token...); abrir+cerrar por llamada re-derivaba
    // la llave (~55ms) en cada request.
    const q = sharedDb().prepare("SELECT value FROM crm_settings WHERE key = ?");
    for (const k of keys) {
      const row = q.get(k) as { value: string } | undefined;
      if (row?.value != null) out[k] = row.value;
    }
  } catch {
    // DB no disponible aún (pre-init): el caller usa su fallback.
  }
  return out;
}

/** Lee varias claves sobre una conexión YA ABIERTA por el caller (no la
 * cierra). Contraparte de writeSettingsOn: para componer un read-check-write
 * atómico (ej. un contador que no debe pisarse bajo llamadas concurrentes),
 * usá esta función + writeSettingsOn dentro de la MISMA transacción. */
export function readSettingsOn(sqlite: Database.Database, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (keys.length === 0) return out;
  const q = sqlite.prepare("SELECT value FROM crm_settings WHERE key = ?");
  for (const k of keys) {
    const row = q.get(k) as { value: string } | undefined;
    if (row?.value != null) out[k] = row.value;
  }
  return out;
}

/** Upsert de varias claves sobre una conexión YA ABIERTA por el caller (no la
 * cierra). Para componer con otra escritura en la MISMA transacción, ej. un
 * caller que también actualiza otra tabla y necesita atomicidad entre ambas
 * (auditoría adversarial: writeSettings() con conexión propia había roto esa
 * garantía en api/operator/route.ts). */
export function writeSettingsOn(sqlite: Database.Database, pairs: Record<string, string>): void {
  const stmt = sqlite.prepare("INSERT OR REPLACE INTO crm_settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(pairs)) stmt.run(k, String(v));
}

/** Escribe varias claves (upsert), conexión propia. Lanza si la DB no se puede
 * abrir en escritura. Si necesitás atomicidad con otra tabla, usá writeSettingsOn
 * sobre tu propia conexión en vez de esta. */
export function writeSettings(pairs: Record<string, string>): void {
  const sqlite = sharedDb();
  sqlite.transaction(() => writeSettingsOn(sqlite, pairs))();
}
