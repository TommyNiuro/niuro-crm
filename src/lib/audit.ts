/**
 * Audit log inmutable con hash-chain (auditoria SaaS 2026-07-01, fase 1).
 *
 * Cada fila encadena el hash de la anterior: hash = sha256(prev_hash + payload).
 * Editar o borrar una fila posterior rompe la cadena y `verifyAuditChain()` lo
 * detecta. No es inmutabilidad a nivel motor (SQLite no la ofrece sin triggers
 * fragiles); es tamper-evidence: el registro puede alterarse, pero no sin dejar
 * rastro. Cubre lo que el timeline mutable existente no cubre: login/logout,
 * cambios de credencial, borrados administrativos.
 *
 * Server-only (usa better-sqlite3). Conexion fresca por llamada, mismo patron
 * que lib/settings.ts (evita el ciclo con @/db). Fallback silencioso si la DB
 * no esta lista (pre-init): auditar nunca debe romper el flujo que audita.
 */
import crypto from "crypto";
import Database from "better-sqlite3";
import { dbPath } from "./paths";

export interface AuditEntry {
  actor: string;
  action: string;
  objectType?: string | null;
  objectId?: string | null;
  detail?: Record<string, unknown> | null;
}

interface AuditRow {
  id: string;
  ts: number;
  actor: string;
  action: string;
  object_type: string | null;
  object_id: string | null;
  detail: string | null;
  prev_hash: string;
  hash: string;
}

const GENESIS = ""; // prev_hash de la primera fila

/** Contenido canonico que entra al hash (todo menos el hash mismo). */
function canonical(row: Omit<AuditRow, "hash">): string {
  return JSON.stringify([
    row.id,
    row.ts,
    row.actor,
    row.action,
    row.object_type,
    row.object_id,
    row.detail,
    row.prev_hash,
  ]);
}

function computeHash(row: Omit<AuditRow, "hash">): string {
  return crypto.createHash("sha256").update(canonical(row)).digest("hex");
}

/**
 * Agrega una entrada al log. Lee el ultimo hash y encadena en UNA transaccion
 * para que dos appends concurrentes no compartan prev_hash. ponytail: en un
 * proceso single-writer better-sqlite3 esto ya es serial; la transaccion cubre
 * el caso de que en el futuro haya mas de un escritor por proceso.
 */
export function appendAudit(entry: AuditEntry): void {
  try {
    const sqlite = new Database(dbPath(), { timeout: 15000 });
    try {
      const insert = sqlite.transaction((e: AuditEntry) => {
        const last = sqlite
          .prepare("SELECT hash FROM audit_log ORDER BY ts DESC, id DESC LIMIT 1")
          .get() as { hash: string } | undefined;
        const base: Omit<AuditRow, "hash"> = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          actor: e.actor,
          action: e.action,
          object_type: e.objectType ?? null,
          object_id: e.objectId ?? null,
          detail: e.detail != null ? JSON.stringify(e.detail) : null,
          prev_hash: last?.hash ?? GENESIS,
        };
        const hash = computeHash(base);
        sqlite
          .prepare(
            `INSERT INTO audit_log (id, ts, actor, action, object_type, object_id, detail, prev_hash, hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(base.id, base.ts, base.actor, base.action, base.object_type, base.object_id, base.detail, base.prev_hash, hash);
      });
      insert(entry);
    } finally {
      sqlite.close();
    }
  } catch {
    // Best-effort: si la DB no esta o el insert falla, no romper el flujo.
  }
}

/**
 * Recorre el log en orden y verifica que cada hash coincida y que prev_hash
 * encadene con la fila anterior. Devuelve ok=true si intacto, o el id de la
 * primera fila donde la cadena se rompe (edicion/borrado/reordenamiento).
 */
export function verifyAuditChain(
  sqlite?: Database.Database
): { ok: true; count: number } | { ok: false; brokenAt: string; count: number } {
  const own = sqlite ?? new Database(dbPath(), { readonly: true, timeout: 5000 });
  try {
    const rows = own
      .prepare("SELECT * FROM audit_log ORDER BY ts ASC, id ASC")
      .all() as AuditRow[];
    let prev = GENESIS;
    for (const r of rows) {
      const { hash, ...rest } = r;
      if (r.prev_hash !== prev || computeHash(rest) !== hash) {
        return { ok: false, brokenAt: r.id, count: rows.length };
      }
      prev = hash;
    }
    return { ok: true, count: rows.length };
  } finally {
    if (!sqlite) own.close();
  }
}
