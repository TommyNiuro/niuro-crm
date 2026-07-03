/* Harness de DB en memoria para tests que necesitan el `db` real (no mocks de
 * funciones puras). Crea un better-sqlite3 `:memory:` con el MISMO schema que
 * src/db/schema.ts (columnas snake_case que drizzle espera al hacer
 * select/insert) y lo envuelve con drizzle. Es autocontenido a proposito (no
 * importa src/db/index.ts) para NO abrir la DB real ni correr su init al testear.
 *
 * Si el schema de produccion cambia, estos CREATE TABLE deben actualizarse: un
 * test fallaria de forma clara (columna inexistente) si quedan desfasados. Solo
 * incluye las tablas que tocan los tests de proposals/pipeline. */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";

// CREATE TABLE con TODAS las columnas de drizzle (drizzle genera el SELECT con
// la lista completa de columnas del schema, asi que deben existir todas).
const CREATE_TABLES = [
  `CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    source TEXT NOT NULL DEFAULT 'otro',
    contact_type TEXT NOT NULL DEFAULT 'lead',
    temperature TEXT NOT NULL DEFAULT 'cold',
    score INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    whatsapp_jid TEXT,
    stage TEXT NOT NULL DEFAULT 'Prospecto',
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    probability INTEGER NOT NULL DEFAULT 0,
    value_cents INTEGER NOT NULL DEFAULT 0,
    country TEXT,
    tags TEXT,
    agent_id TEXT,
    next_action TEXT,
    next_step_due INTEGER,
    online INTEGER NOT NULL DEFAULT 0,
    last_interaction_at INTEGER,
    archived INTEGER NOT NULL DEFAULT 0,
    disqualify_reason TEXT,
    score_breakdown TEXT,
    job_description TEXT,
    sales_intel TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,
  `CREATE TABLE pipeline_stages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    color TEXT NOT NULL DEFAULT '#64748b',
    is_won INTEGER NOT NULL DEFAULT 0,
    is_lost INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE deals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    stage_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    expected_close INTEGER,
    probability INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,
  `CREATE TABLE step_transitions (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    from_step TEXT,
    to_step TEXT NOT NULL,
    duration_days INTEGER,
    occurred_at INTEGER NOT NULL
  )`,
  `CREATE TABLE activities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    deal_id TEXT,
    scheduled_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    title TEXT NOT NULL,
    step_name TEXT,
    due_at INTEGER,
    status TEXT NOT NULL DEFAULT 'open',
    completed_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE proposals (
    id TEXT PRIMARY KEY,
    contact_id TEXT,
    deal_id TEXT,
    mode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    date TEXT,
    client TEXT NOT NULL,
    role TEXT,
    duration TEXT,
    transcript TEXT,
    notes TEXT,
    pricing TEXT,
    summary TEXT,
    context TEXT,
    cards TEXT,
    roadmap TEXT,
    team TEXT,
    risks TEXT,
    generated INTEGER NOT NULL DEFAULT 0,
    priority TEXT,
    gen_status TEXT,
    gen_error TEXT,
    sent_at INTEGER,
    signed_at INTEGER,
    closed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
];

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export function makeTestDb(): { db: TestDb; sqlite: Database.Database } {
  const sqlite = new Database(":memory:");
  // FK off: los tests prueban logica, no integridad referencial; evita lidiar
  // con orden de borrado entre tests.
  for (const sql of CREATE_TABLES) sqlite.exec(sql);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

// Las 7 etapas del playbook de Niuro (igual que NIURO_STAGES en src/db/index.ts).
// applyStatusChange las busca por nombre y usa isWon=true (Cierre).
const NIURO_STAGES = [
  { name: "Prospecto", order: 0, isWon: false },
  { name: "Discovery", order: 1, isWon: false },
  { name: "Propuesta", order: 2, isWon: false },
  { name: "Perfil", order: 3, isWon: false },
  { name: "Entrevistas", order: 4, isWon: false },
  { name: "Cierre", order: 5, isWon: true },
  { name: "Expansion", order: 6, isWon: false },
];

export function seedStages(db: TestDb): void {
  for (const s of NIURO_STAGES) {
    db.insert(schema.pipelineStages)
      .values({ name: s.name, order: s.order, isWon: s.isWon })
      .run();
  }
}
