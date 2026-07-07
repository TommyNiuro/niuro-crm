/**
 * Sync (Fase A: solo lectura) con otra instancia de Niuro CRM — ej. la
 * instalación "real" del usuario — vía su API REST ya existente, igual que
 * el bridge de WhatsApp: nunca se toca su DB ni su código, solo se le pega
 * por HTTP a las mismas rutas que usa su propio frontend.
 *
 * Configurable via crm_settings (onboarding/ajustes) > env CRM_SYNC_URL.
 * Sin URL configurada, el sync queda desactivado (no rompe nada para quien
 * descargue el OSS sin una segunda instancia propia).
 */
import Database from "better-sqlite3";
import crypto from "crypto";
import { getTableColumns, type Table } from "drizzle-orm";
import * as schema from "@/db/schema";
import { readSettings } from "./settings";
import { assertUserInstanceUrl } from "./url-safety";

export function getSyncUrl(): string | null {
  const fromDb = readSettings(["crm_sync_url"]).crm_sync_url;
  const url = fromDb || process.env.CRM_SYNC_URL || "";
  return url ? url.replace(/\/$/, "") : null;
}

export const SYNCABLE_TABLES = [
  "contacts",
  "companies",
  "deals",
  "proposals",
  "tickets",
  "activities",
  "tasks",
  "group_opportunities",
] as const;
export type SyncableTable = (typeof SYNCABLE_TABLES)[number];

// Ruta REST real por tabla (group_opportunities no sigue el patron plural simple).
const ENDPOINTS: Record<SyncableTable, string> = {
  contacts: "/api/contacts",
  companies: "/api/companies",
  deals: "/api/deals",
  proposals: "/api/proposals",
  tickets: "/api/tickets",
  activities: "/api/activities",
  tasks: "/api/tasks",
  group_opportunities: "/api/opportunities",
};

/** Trae todos los registros vivos de una tabla desde la instancia remota. */
export async function pullTable(table: SyncableTable): Promise<Record<string, unknown>[]> {
  const base = getSyncUrl();
  if (!base) throw new Error("crm_sync_url no configurada: el sync esta desactivado");
  const url = assertUserInstanceUrl(`${base}${ENDPOINTS[table]}?limit=1000`);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`pull ${table}: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ---- Motor de sync por tabla (compartido por scripts/sync-crm.ts y el tick de
// /api/sync/tick: la logica vive una sola vez acá, cada caller solo maneja el
// lock cross-process y el ciclo de vida de la conexion sqlite). ----

const TABLE_DEFS: Record<SyncableTable, Table> = {
  contacts: schema.contacts,
  companies: schema.companies,
  deals: schema.deals,
  proposals: schema.proposals,
  tickets: schema.tickets,
  activities: schema.activities,
  tasks: schema.tasks,
  group_opportunities: schema.groupOpportunities,
};

// Tablas sin updated_at (activities/tasks/tickets: mas timeline/evento que
// registro editable) -> insert-once, nunca se actualizan en corridas siguientes.
const HAS_UPDATED_AT: Record<SyncableTable, boolean> = {
  contacts: true,
  companies: true,
  deals: true,
  proposals: true,
  tickets: false,
  activities: false,
  tasks: false,
  group_opportunities: true,
};

interface DrizzleCol {
  name: string;
  dataType: string;
  notNull: boolean;
  mapToDriverValue?: (v: unknown) => unknown;
}

// FKs que apuntan a OTRA tabla sincronizable: el valor remoto es un id de la
// instancia remota, hay que traducirlo al id local via sync_mappings (los ids
// son UUID por-app, no comparten valor entre instancias).
const FK_REFS: Partial<Record<SyncableTable, Record<string, SyncableTable>>> = {
  deals: { contactId: "contacts" },
  proposals: { contactId: "contacts", dealId: "deals" },
  tickets: { contactId: "contacts" },
  activities: { contactId: "contacts", dealId: "deals" },
  tasks: { contactId: "contacts" },
};

// Campos que referencian identidad/config NO sincronizada (agents, pipeline
// stages): cada instancia tiene la suya propia, no hay mapeo razonable, asi
// que se omiten del todo (quedan en su default local) en vez de copiar un id
// remoto que no significa nada aca.
const SKIP_FIELDS: Partial<Record<SyncableTable, string[]>> = {
  tickets: ["agentId"],
  contacts: ["agentId"],
  deals: ["stageId"],
};

// Marca "esta fila entera no se puede insertar/actualizar de forma segura"
// (ej. FK NOT NULL cuyo padre no esta sincronizado) — distinto de `undefined`
// (que solo omite ESE campo, dejando el resto de la fila intacta).
export const SKIP_ROW = Symbol("skip-row");

// Convierte un valor JSON (de la API remota) al valor crudo que espera SQLite,
// usando el propio mapeo de Drizzle (mismo que usaria un INSERT via el ORM) en
// vez de reinventar la conversion de timestamps/booleans a mano. Acepta tanto
// ISO string como epoch-ms numerico para columnas de fecha (la API remota no
// es consistente: algunas rutas serializan Date, otras ya mandan el numero).
// Objetos/arrays (ej. proposals.client, que la API ya deserializo para
// mostrarlo) se re-serializan: better-sqlite3 no acepta objetos como bind
// param — el error que tira ("Too few parameter values") es enganoso, no
// tiene nada que ver con la cantidad real de parametros.
function toDriverValue(col: DrizzleCol, jsValue: unknown): unknown {
  if (jsValue == null) {
    // NOT NULL + falta en la respuesta remota (ej. tasks no devuelve createdAt):
    // usar "ahora" como fallback razonable en vez de fallar el insert entero.
    if (col.dataType === "date" && col.notNull) return col.mapToDriverValue?.(new Date());
    return null;
  }
  if (col.dataType === "date" && (typeof jsValue === "string" || typeof jsValue === "number")) {
    return col.mapToDriverValue ? col.mapToDriverValue(new Date(jsValue)) : jsValue;
  }
  if (typeof jsValue === "object") return JSON.stringify(jsValue);
  return col.mapToDriverValue ? col.mapToDriverValue(jsValue) : (jsValue as string | number | null);
}

/** Resuelve el valor final para un campo, remapeando FKs a su id local via
 * sync_mappings cuando corresponde. undefined = omitir el campo (queda en su
 * default local). SKIP_ROW = la fila entera no se puede sincronizar. */
function resolveField(
  db: Database.Database,
  findMapping: Database.Statement,
  table: SyncableTable,
  jsKey: string,
  col: DrizzleCol,
  rec: Record<string, unknown>
): unknown {
  if (SKIP_FIELDS[table]?.includes(jsKey)) {
    // deals.stageId es NOT NULL y no hay mapeo de etapas entre instancias: omitirlo
    // hacía fallar el INSERT (NOT NULL constraint) y el sync de deals nunca copiaba
    // nada. Usar la primera etapa local del pipeline como destino; el usuario re-etapa.
    if (table === "deals" && jsKey === "stageId") {
      const row = db
        .prepare(`SELECT id FROM pipeline_stages WHERE pipeline = 'prospectos' ORDER BY "order" ASC LIMIT 1`)
        .get() as { id: string } | undefined;
      return row?.id ?? SKIP_ROW;
    }
    return undefined;
  }

  const fkTable = FK_REFS[table]?.[jsKey];
  if (fkTable) {
    const remoteRef = rec[jsKey];
    if (remoteRef == null) return col.notNull ? SKIP_ROW : null;
    const mapped = findMapping.get(fkTable, String(remoteRef)) as { local_id: string } | undefined;
    if (mapped) return mapped.local_id;
    // Padre no sincronizado (ej. contacto archivado, excluido a proposito):
    // si la columna es NOT NULL no hay valor seguro, se salta la fila entera
    // en vez de violar la FK con un null.
    return col.notNull ? SKIP_ROW : null;
  }

  // Ausente del todo en la respuesta remota (la ruta no lo selecciona, ej.
  // proposals.generated): omitir y dejar que el DEFAULT local aplique, en vez
  // de forzar un null explicito que viola un NOT NULL aunque tenga default
  // (un INSERT con valor null explicito no cae al default de la columna).
  // Excepcion: fecha NOT NULL (createdAt) sigue necesitando un valor real.
  if (!(jsKey in rec) && !(col.dataType === "date" && col.notNull)) return undefined;

  return toDriverValue(col, rec[jsKey]);
}

export interface SyncStats {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

/** Sincroniza una tabla (pull-only). failed=-1 significa "fallo el pull entero". */
export async function syncTable(db: Database.Database, table: SyncableTable): Promise<SyncStats> {
  const stats: SyncStats = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const cols = getTableColumns(TABLE_DEFS[table]) as Record<string, DrizzleCol>;
  const jsKeys = Object.keys(cols).filter((k) => k !== "id");
  const hasUpdatedAt = HAS_UPDATED_AT[table];

  let remote: Record<string, unknown>[];
  try {
    remote = await pullTable(table);
  } catch (e) {
    console.error(`[sync-crm] ${table}: fallo el pull -> ${e instanceof Error ? e.message : e}`);
    stats.failed = -1;
    return stats;
  }

  const findMapping = db.prepare(
    "SELECT local_id FROM sync_mappings WHERE table_name = ? AND remote_id = ?"
  );
  const touchMapping = db.prepare(
    "UPDATE sync_mappings SET last_synced_at = ? WHERE table_name = ? AND remote_id = ?"
  );
  const insertMapping = db.prepare(
    "INSERT INTO sync_mappings (table_name, local_id, remote_id, last_synced_at) VALUES (?, ?, ?, ?)"
  );
  // ponytail: statement fijo por tabla, izado fuera del loop (antes se re-preparaba
  // el mismo SELECT por cada fila ya sincronizada).
  const findUpdatedAt = hasUpdatedAt
    ? db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`)
    : null;
  const nowSec = Math.floor(Date.now() / 1000);

  for (const rec of remote) {
    const remoteId = String(rec.id ?? "");
    if (!remoteId) continue;

    try {
      const existing = findMapping.get(table, remoteId) as { local_id: string } | undefined;

      if (!existing) {
        const rawEntries = jsKeys.map((k) => [k, resolveField(db, findMapping, table, k, cols[k], rec)] as const);
        if (rawEntries.some(([, v]) => v === SKIP_ROW)) {
          stats.skipped++; // FK NOT NULL sin padre sincronizado (ej. contacto archivado)
          continue;
        }
        const fieldEntries = rawEntries.filter((e): e is [string, unknown] => e[1] !== undefined);
        const localId = crypto.randomUUID();
        const colNames = ["id", ...fieldEntries.map(([k]) => cols[k].name)];
        const values = [localId, ...fieldEntries.map(([, v]) => v)];
        const placeholders = colNames.map(() => "?").join(", ");
        db.prepare(
          `INSERT INTO ${table} (${colNames.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`
        ).run(...values);
        insertMapping.run(table, localId, remoteId, nowSec);
        stats.created++;
        continue;
      }

      if (!hasUpdatedAt) {
        stats.skipped++;
        continue;
      }

      const localRow = findUpdatedAt!.get(existing.local_id) as { updated_at: number } | undefined;
      if (!localRow) {
        stats.skipped++;
        continue;
      }

      const remoteUpdatedAt = toDriverValue(cols.updatedAt, rec.updatedAt) as number | null;
      if (remoteUpdatedAt == null || remoteUpdatedAt <= localRow.updated_at) {
        stats.skipped++;
        continue;
      }

      const rawSetEntries = jsKeys.map((k) => [k, resolveField(db, findMapping, table, k, cols[k], rec)] as const);
      if (rawSetEntries.some(([, v]) => v === SKIP_ROW)) {
        stats.skipped++;
        continue;
      }
      const setEntries = rawSetEntries.filter((e): e is [string, unknown] => e[1] !== undefined);
      const setSql = setEntries.map(([k]) => `"${cols[k].name}" = ?`).join(", ");
      const setValues = setEntries.map(([, v]) => v);
      db.prepare(`UPDATE ${table} SET ${setSql} WHERE id = ?`).run(...setValues, existing.local_id);
      touchMapping.run(nowSec, table, remoteId);
      stats.updated++;
    } catch (e) {
      stats.failed++;
      console.error(
        `[sync-crm] ${table}/${remoteId}: fila fallo -> ${e instanceof Error ? e.message : e}`
      );
    }
  }

  return stats;
}

/** Corre las 8 tablas sincronizables en orden sobre una conexion ya abierta. */
export async function runFullSync(db: Database.Database): Promise<Record<SyncableTable, SyncStats>> {
  const results = {} as Record<SyncableTable, SyncStats>;
  for (const table of SYNCABLE_TABLES) {
    results[table] = await syncTable(db, table);
  }
  return results;
}
