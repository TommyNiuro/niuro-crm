/**
 * Lectura/escritura de crm_settings desde código server-only (better-sqlite3).
 * NO importar en Client Components. Conexión fresca por llamada (evita el ciclo
 * operator.ts <-> db/index.ts). Fallback silencioso si la DB no existe todavía.
 */
import Database from "better-sqlite3";
import { dbPath } from "./paths";

/** Lee varias claves de una. Devuelve solo las presentes (value != null). */
export function readSettings(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (keys.length === 0) return out;
  try {
    const sqlite = new Database(dbPath(), { readonly: true, timeout: 5000 });
    try {
      const q = sqlite.prepare("SELECT value FROM crm_settings WHERE key = ?");
      for (const k of keys) {
        const row = q.get(k) as { value: string } | undefined;
        if (row?.value != null) out[k] = row.value;
      }
    } finally {
      sqlite.close();
    }
  } catch {
    // DB no disponible aún (pre-init): el caller usa su fallback.
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
  const sqlite = new Database(dbPath(), { timeout: 15000 });
  try {
    sqlite.transaction(() => writeSettingsOn(sqlite, pairs))();
  } finally {
    sqlite.close();
  }
}
