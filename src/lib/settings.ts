/**
 * Lectura/escritura de crm_settings desde código server-only (better-sqlite3).
 * NO importar en Client Components. Conexión fresca por llamada (evita el ciclo
 * operator.ts <-> db/index.ts). Fallback silencioso si la DB no existe todavía.
 */
import Database from "better-sqlite3";
import path from "path";

function dbPath(): string {
  return process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
}

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

/** Escribe varias claves (upsert). Lanza si la DB no se puede abrir en escritura. */
export function writeSettings(pairs: Record<string, string>): void {
  const sqlite = new Database(dbPath(), { timeout: 15000 });
  try {
    const stmt = sqlite.prepare("INSERT OR REPLACE INTO crm_settings (key, value) VALUES (?, ?)");
    const tx = sqlite.transaction((entries: [string, string][]) => {
      for (const [k, v] of entries) stmt.run(k, String(v));
    });
    tx(Object.entries(pairs));
  } finally {
    sqlite.close();
  }
}
