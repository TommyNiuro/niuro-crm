import { rawDb } from "@/db";

// Tools del copiloto IA (b6-chat-backend). Dos familias:
//  - READ: query_records / get_record / count_records / search -> ejecutan SQL
//    parametrizado de SOLO LECTURA y devuelven datos reales.
//  - WRITE (propose_*): NO tocan la DB; devuelven una "accion propuesta" que el
//    usuario confirma en la UI y luego /api/ai/execute-action ejecuta.
//
// Toda la seguridad cuelga del whitelist OBJECTS: el objectName se interpola en
// el nombre de tabla del SQL crudo (no parametrizable), asi que SOLO puede venir
// de esta lista. Las columnas filtrables/escribibles tambien estan whitelisted:
// un filtro o campo fuera de la lista se ignora, nunca llega al SQL.

interface ObjectDef {
  table: string;
  // Columnas legibles/filtrables (las que la IA puede ver y filtrar).
  cols: string[];
  // Columnas escribibles via propose_update/propose_create.
  writableCols: string[];
  hasUpdatedAt: boolean;
  // Soft-delete: si la tabla tiene deleted_at, las lecturas lo excluyen.
  softDelete: boolean;
  // Columna(s) de texto para search() y para describir un registro.
  labelCol: string;
}

// snake_case real de cada tabla (verificado contra el schema de la DB dev).
export const OBJECTS: Record<string, ObjectDef> = {
  contacts: {
    table: "contacts",
    cols: ["id", "name", "email", "phone", "company", "country", "source", "temperature", "score", "stage", "channel", "probability", "value_cents", "next_action", "agent_id", "tags", "archived", "notes", "created_at", "updated_at", "last_interaction_at"],
    writableCols: ["name", "email", "phone", "company", "country", "source", "temperature", "score", "notes", "stage", "channel", "probability", "value_cents", "next_action", "agent_id", "tags", "archived"],
    hasUpdatedAt: true,
    softDelete: true,
    labelCol: "name",
  },
  deals: {
    table: "deals",
    cols: ["id", "title", "value", "stage_id", "contact_id", "expected_close", "probability", "notes", "created_at", "updated_at"],
    writableCols: ["title", "value", "stage_id", "contact_id", "expected_close", "probability", "notes"],
    hasUpdatedAt: true,
    softDelete: true,
    labelCol: "title",
  },
  companies: {
    table: "companies",
    cols: ["id", "name", "domain", "industry", "size", "country", "linkedin", "notes", "archived", "created_at", "updated_at"],
    writableCols: ["name", "domain", "industry", "size", "country", "linkedin", "notes", "archived"],
    hasUpdatedAt: true,
    softDelete: true,
    labelCol: "name",
  },
  proposals: {
    table: "proposals",
    cols: ["id", "contact_id", "deal_id", "mode", "status", "client", "role", "duration", "notes", "summary", "priority", "created_at", "updated_at"],
    writableCols: ["contact_id", "deal_id", "mode", "status", "client", "role", "duration", "notes", "summary", "priority"],
    hasUpdatedAt: true,
    softDelete: false,
    labelCol: "client",
  },
  tickets: {
    table: "tickets",
    cols: ["id", "code", "subject", "status", "priority", "sla", "agent_id", "contact_id", "created_at"],
    writableCols: ["code", "subject", "status", "priority", "sla", "agent_id", "contact_id"],
    hasUpdatedAt: false,
    softDelete: false,
    labelCol: "subject",
  },
  group_opportunities: {
    table: "group_opportunities",
    cols: ["id", "group_name", "sender", "sender_phone", "role", "stack", "seniority", "company", "urgency", "score", "summary", "status", "source", "url", "created_at", "updated_at"],
    writableCols: ["status"],
    hasUpdatedAt: true,
    softDelete: false,
    labelCol: "group_name",
  },
};

export type ObjectName = keyof typeof OBJECTS;

function assertObject(objectName: unknown): ObjectDef {
  if (typeof objectName !== "string" || !(objectName in OBJECTS)) {
    throw new Error(`objectName invalido: ${String(objectName)}`);
  }
  return OBJECTS[objectName];
}

// Construye la clausula WHERE de un dict de filtros. Solo columnas whitelisted;
// el resto se ignora. Soporta {col: valor} (igualdad) y {col: {op, value}} con
// op en un set chico y seguro. Todos los valores van parametrizados.
const SAFE_OPS: Record<string, string> = {
  eq: "=",
  ne: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "LIKE",
};

function buildWhere(def: ObjectDef, filters: unknown): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (def.softDelete) clauses.push(`deleted_at IS NULL`);
  if (filters && typeof filters === "object" && !Array.isArray(filters)) {
    for (const [col, raw] of Object.entries(filters as Record<string, unknown>)) {
      if (!def.cols.includes(col)) continue; // ignora columnas no whitelisted
      if (raw && typeof raw === "object" && !Array.isArray(raw) && "op" in raw) {
        const r = raw as { op?: unknown; value?: unknown };
        const op = SAFE_OPS[String(r.op)];
        if (!op) continue;
        clauses.push(`"${col}" ${op} ?`);
        params.push(r.value);
      } else {
        clauses.push(`"${col}" = ?`);
        params.push(raw);
      }
    }
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

// ---- READ tools ----

export function query_records(objectName: string, filters?: unknown, limit?: number): Record<string, unknown>[] {
  const def = assertObject(objectName);
  const { sql, params } = buildWhere(def, filters);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return rawDb
    .prepare(`SELECT ${def.cols.map((c) => `"${c}"`).join(", ")} FROM ${def.table} ${sql} ORDER BY rowid DESC LIMIT ?`)
    .all(...params, lim) as Record<string, unknown>[];
}

export function get_record(objectName: string, id: string): Record<string, unknown> | null {
  const def = assertObject(objectName);
  if (typeof id !== "string" || !id) throw new Error("get_record: id vacio");
  const extra = def.softDelete ? ` AND deleted_at IS NULL` : "";
  const row = rawDb
    .prepare(`SELECT ${def.cols.map((c) => `"${c}"`).join(", ")} FROM ${def.table} WHERE id = ?${extra}`)
    .get(id) as Record<string, unknown> | undefined;
  return row ?? null;
}

export function count_records(objectName: string, filters?: unknown): number {
  const def = assertObject(objectName);
  const { sql, params } = buildWhere(def, filters);
  const row = rawDb.prepare(`SELECT COUNT(*) as n FROM ${def.table} ${sql}`).get(...params) as { n: number };
  return row.n;
}

// Busca texto en el campo "label" de contacts/deals/companies (nombre/titulo).
// LIKE parametrizado con escape de comodines para que el usuario no inyecte %/_.
export function search(text: string): { object: string; id: string; label: string }[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const term = `%${text.replace(/[%_\\]/g, "\\$&")}%`;
  const out: { object: string; id: string; label: string }[] = [];
  for (const name of ["contacts", "deals", "companies"] as const) {
    const def = OBJECTS[name];
    const extra = def.softDelete ? ` AND deleted_at IS NULL` : "";
    const rows = rawDb
      .prepare(`SELECT id, "${def.labelCol}" as label FROM ${def.table} WHERE "${def.labelCol}" LIKE ? ESCAPE '\\'${extra} LIMIT 10`)
      .all(term) as { id: string; label: string }[];
    for (const r of rows) out.push({ object: name, id: r.id, label: r.label });
  }
  return out;
}

// ---- WRITE tools (propuestas, NO ejecutan) ----

export interface ProposedAction {
  kind: "update" | "create";
  objectName: string;
  id?: string;
  fields: Record<string, unknown>;
}

// Filtra a columnas escribibles. Lanza si no queda ningun campo valido para que
// la IA no genere una accion vacia o con columnas inventadas.
function filterWritable(def: ObjectDef, fields: unknown): Record<string, unknown> {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new Error("fields debe ser un objeto");
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    if (def.writableCols.includes(k)) out[k] = v;
  }
  if (Object.keys(out).length === 0) throw new Error("ningun campo escribible valido");
  return out;
}

export function propose_update(objectName: string, id: string, fields: unknown): ProposedAction {
  const def = assertObject(objectName);
  if (typeof id !== "string" || !id) throw new Error("propose_update: id vacio");
  return { kind: "update", objectName, id, fields: filterWritable(def, fields) };
}

export function propose_create(objectName: string, fields: unknown): ProposedAction {
  const def = assertObject(objectName);
  return { kind: "create", objectName, fields: filterWritable(def, fields) };
}

// ---- Ejecucion de una accion YA confirmada (la usa /api/ai/execute-action) ----
// Mismo whitelist que arriba. Escribe directo contra rawDb (parametrizado), igual
// que el workflow engine. No pasa por runWorkflow para no necesitar un workflow_id.

function bind(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string") return v;
  return JSON.stringify(v);
}

export function executeAction(action: ProposedAction): { id: string } {
  const def = assertObject(action.objectName);
  const fields = filterWritable(def, action.fields); // re-valida: el cliente no es de fiar
  const nowSec = Math.floor(Date.now() / 1000);
  const keys = Object.keys(fields);

  if (action.kind === "create") {
    const id = crypto.randomUUID();
    const colNames = ["id", ...keys, "created_at", ...(def.hasUpdatedAt ? ["updated_at"] : [])];
    const values = [id, ...keys.map((k) => bind(fields[k])), nowSec, ...(def.hasUpdatedAt ? [nowSec] : [])];
    rawDb
      .prepare(`INSERT INTO ${def.table} (${colNames.map((c) => `"${c}"`).join(", ")}) VALUES (${colNames.map(() => "?").join(", ")})`)
      .run(...values);
    return { id };
  }

  // update
  if (typeof action.id !== "string" || !action.id) throw new Error("execute update: id vacio");
  const setSql = [...keys.map((k) => `"${k}" = ?`), ...(def.hasUpdatedAt ? [`"updated_at" = ?`] : [])].join(", ");
  const params = [...keys.map((k) => bind(fields[k])), ...(def.hasUpdatedAt ? [nowSec] : []), action.id];
  const info = rawDb.prepare(`UPDATE ${def.table} SET ${setSql} WHERE id = ?`).run(...params);
  if (info.changes === 0) throw new Error(`${def.table}/${action.id} no existe`);
  return { id: action.id };
}

// Describe los objetos + sus columnas para el system prompt del copiloto.
// Descripciones legibles (alias + valores de estado) para el system prompt del
// copiloto, para que mapee lenguaje natural al objeto correcto.
const OBJECT_DESCRIPTIONS: Record<string, string> = {
  contacts: "Contactos / leads (Directorio). temperature: hot|warm|cold.",
  deals: "Deals: oportunidades formales de venta con monto (negocios).",
  companies: "Empresas / organizaciones.",
  proposals: "Propuestas comerciales. status: draft|sent|in-review|negotiation|signed|lost|archived; mode: staff-aug|sprint.",
  tickets: "Tickets de soporte. status: open|pending|resolved.",
  group_opportunities:
    "RADAR DE GRUPOS: oportunidades de talento detectadas en grupos de WhatsApp y en GetOnBoard (lo que el usuario llama 'el radar' o 'las oportunidades del radar'). OJO: 'radar' NO es un valor de status; 'cuantas oportunidades en el radar' = contar TODO el objeto sin filtrar por status. status: new|contacted|discarded ('pendientes en el radar' = status='new'); source: whatsapp|getonboard.",
};

export function describeSchema(): string {
  return Object.entries(OBJECTS)
    .map(
      ([name, def]) =>
        `- ${name}${OBJECT_DESCRIPTIONS[name] ? ` — ${OBJECT_DESCRIPTIONS[name]}` : ""}\n  columnas legibles [${def.cols.join(", ")}]; escribibles [${def.writableCols.join(", ")}]`
    )
    .join("\n");
}

// ---- Demo / self-check (ponytail): corre con `tsx src/lib/ai/tools.ts` ----
// Verifica el whitelist sin tocar la DB real: filtros y campos fuera de lista se
// descartan, y propose_* solo deja columnas escribibles.
if (require.main === module) {
  const def = OBJECTS.contacts;
  const w = buildWhere(def, { temperature: "hot", injected_col: "x", score: { op: "gte", value: 80 } });
  console.assert(w.sql.includes("temperature") && w.sql.includes("score") && !w.sql.includes("injected_col"), "buildWhere debe filtrar columnas no whitelisted");
  console.assert(w.sql.includes("deleted_at IS NULL"), "buildWhere debe excluir soft-deleted");
  const a = propose_update("contacts", "abc", { temperature: "warm", nope: 1, id: "hack" });
  console.assert(JSON.stringify(a.fields) === '{"temperature":"warm"}', "propose_update debe filtrar a columnas escribibles");
  let threw = false;
  try { propose_create("contacts", { nope: 1 }); } catch { threw = true; }
  console.assert(threw, "propose_create sin campos validos debe lanzar");
  let badObj = false;
  try { assertObject("users"); } catch { badObj = true; }
  console.assert(badObj, "assertObject debe rechazar tablas fuera del whitelist");
  console.log("tools.ts self-check OK");
}
