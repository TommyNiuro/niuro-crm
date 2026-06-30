import { rawDb } from "@/db";

/** Un cambio de campo: {campo: {from, to}}. */
export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

const insertStmt = rawDb.prepare(
  `INSERT INTO timeline_activity (id, object_name, record_id, type, changes, actor, happens_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

/**
 * Registra un evento en el timeline de auditoría (b7-timeline-audit).
 * type: "created" | "updated" | "deleted" | "restored" | libre.
 * changes: solo para "updated". Si viene vacío en un "updated", NO inserta
 * (no spamear con PUTs sin cambios reales).
 * happens_at se guarda en SEGUNDOS epoch (convención Drizzle timestamp del repo).
 */
export function logActivity(
  objectName: string,
  recordId: string,
  type: string,
  changes?: FieldChanges,
  actor = "operador"
): void {
  if (type === "updated" && (!changes || Object.keys(changes).length === 0)) return;
  try {
    insertStmt.run(
      crypto.randomUUID(),
      objectName,
      recordId,
      type,
      changes && Object.keys(changes).length ? JSON.stringify(changes) : null,
      actor,
      Math.floor(Date.now() / 1000)
    );
  } catch {
    // ponytail: el audit log nunca debe tumbar la mutación que lo origina.
  }
}

/**
 * Compara estado previo vs cambios pedidos y devuelve solo los campos que
 * realmente cambian (para el {from,to} del log). keys = campos a vigilar.
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[]
): FieldChanges {
  const out: FieldChanges = {};
  for (const k of keys) {
    if (!(k in after)) continue;
    const from = norm(before[k]);
    const to = norm(after[k]);
    if (from !== to) out[k] = { from: before[k] ?? null, to: after[k] ?? null };
  }
  return out;
}

/** Normaliza para comparar (Date -> ms, resto -> string) sin falsos positivos. */
function norm(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}
