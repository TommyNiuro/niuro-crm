import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";
import { operator } from "@/lib/operator";
import { dbPath } from "@/lib/paths";
import { openDb } from "@/lib/db-open";
import { logger } from "@/lib/logger";

// Resuelto en @/lib/paths: CRM_DB_PATH > CRM_DATA_DIR/crm.db > cwd/data/crm.db.
const DB_PATH = dbPath();

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createDatabase(): Database.Database {
  // openDb aplica la llave de cifrado (si hay) y, en el primer opener del
  // proceso, migra crm.db de texto plano a cifrado una sola vez. Ver db-open.ts.
  const db = openDb(DB_PATH, { timeout: 15000 });

  // Set pragmas individually with error handling
  try {
    db.pragma("journal_mode = WAL");
  } catch {
    // WAL mode might already be set by another process
  }

  try {
    db.pragma("busy_timeout = 15000");
  } catch {
    // Ignore if can't set
  }

  try {
    db.pragma("foreign_keys = ON");
  } catch {
    // Ignore
  }

  // Pragmas de performance (auditoria 2026-06-29). synchronous=NORMAL es seguro
  // con WAL (durabilidad ante crash de la app, no del SO). cache_size negativo =
  // KiB (-64000 = ~64MB). mmap_size = 256MB para lecturas sin syscall.
  for (const p of ["synchronous = NORMAL", "cache_size = -64000", "mmap_size = 268435456"]) {
    try {
      db.pragma(p);
    } catch {
      // Ignore: pragma no critico
    }
  }

  return db;
}

function initTables(db: Database.Database): void {
  // Each CREATE TABLE is its own statement to minimize lock time
  const tables = [
    `CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      source TEXT NOT NULL DEFAULT 'otro',
      temperature TEXT NOT NULL DEFAULT 'cold',
      score INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      color TEXT NOT NULL DEFAULT '#64748b',
      is_won INTEGER NOT NULL DEFAULT 0,
      is_lost INTEGER NOT NULL DEFAULT 0,
      pipeline TEXT NOT NULL DEFAULT 'prospectos'
    )`,
    `CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      stage_id TEXT NOT NULL REFERENCES pipeline_stages(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      expected_close INTEGER,
      probability INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      deal_id TEXT REFERENCES deals(id),
      scheduled_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS crm_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    // Cache de runClaudeCached persistido (auditoria SaaS 2026-07-01): antes era
    // un Map en memoria que se vaciaba en cada restart de launchd, perdiendo
    // extracciones de 60-90s de latencia. TTL vive en expires_at, poda en el hit.
    `CREATE TABLE IF NOT EXISTS ai_cache (
      key TEXT PRIMARY KEY,
      result TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    // Control de versiones de esquema (auditoria SaaS 2026-07-01, fase 1): una
    // fila por migracion aplicada, para saber en que version esta una instalacion
    // y evitar re-correr los ALTER en cada arranque. Ver el runner de migraciones.
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )`,
    // Audit log inmutable con hash-chain (auditoria SaaS 2026-07-01, fase 1).
    // Ver src/lib/audit.ts: cada fila encadena el hash de la anterior.
    `CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      object_type TEXT,
      object_id TEXT,
      detail TEXT,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts ASC, id ASC)`,
    `CREATE TABLE IF NOT EXISTS lead_candidates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      chat_jid TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      temperature TEXT NOT NULL DEFAULT 'cold',
      reason TEXT,
      next_action TEXT,
      source TEXT NOT NULL DEFAULT 'whatsapp',
      status TEXT NOT NULL DEFAULT 'pending',
      contact_id TEXT,
      last_message_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Sales',
      color TEXT NOT NULL DEFAULT '#10b981',
      email TEXT,
      online INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'meeting',
      date TEXT NOT NULL,
      time TEXT,
      contact_id TEXT,
      agent_id TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      processed INTEGER NOT NULL DEFAULT 0,
      success_pct INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#10b981',
      connected INTEGER NOT NULL DEFAULT 0,
      leads INTEGER NOT NULL DEFAULT 0,
      last_sync TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      code TEXT,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      sla TEXT,
      agent_id TEXT,
      contact_id TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS quick_replies (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      text TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      title TEXT NOT NULL,
      step_name TEXT,
      due_at INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS step_transitions (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      from_step TEXT,
      to_step TEXT NOT NULL,
      duration_days INTEGER,
      occurred_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS group_opportunities (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      group_name TEXT,
      sender TEXT,
      sender_phone TEXT,
      message_at TEXT,
      excerpt TEXT NOT NULL,
      role TEXT,
      stack TEXT,
      seniority TEXT,
      company TEXT,
      urgency TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      suggested_reply TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(message_id, chat_jid)
    )`,
    `CREATE TABLE IF NOT EXISTS image_leads (
      id TEXT PRIMARY KEY,
      image_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'analyzing',
      score INTEGER NOT NULL DEFAULT 0,
      company TEXT,
      what_they_do TEXT,
      role TEXT,
      stack TEXT,
      seniority TEXT,
      contact_email TEXT,
      contact_url TEXT,
      contact_info TEXT,
      summary TEXT,
      notes TEXT,
      raw_extract TEXT,
      contact_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS proposals (
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
    `CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT,
      industry TEXT,
      size TEXT,
      country TEXT,
      linkedin TEXT,
      notes TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ];

  for (const sql of tables) {
    try {
      db.exec(sql);
    } catch (e) {
      // "already exists" es lo esperado en re-arranques (idempotente). Cualquier
      // OTRO error (DB corrupta, lock duro, SQL inválido) antes era invisible: se
      // loguea pero se continúa, igual que el bucle de migraciones de abajo.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already exists/i.test(msg)) {
        console.error(`[db] CREATE TABLE falló: ${sql.slice(0, 70)}… → ${msg}`);
      }
    }
  }

  // Lightweight migrations: add columns introduced after the initial release.
  const migrations = [
    `ALTER TABLE lead_candidates ADD COLUMN breakdown TEXT`,
    `ALTER TABLE contacts ADD COLUMN whatsapp_jid TEXT`,
    `ALTER TABLE contacts ADD COLUMN stage TEXT NOT NULL DEFAULT 'Inbox'`,
    `ALTER TABLE contacts ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp'`,
    `ALTER TABLE contacts ADD COLUMN probability INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE contacts ADD COLUMN value_cents INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE contacts ADD COLUMN country TEXT`,
    `ALTER TABLE contacts ADD COLUMN tags TEXT`,
    `ALTER TABLE contacts ADD COLUMN agent_id TEXT`,
    `ALTER TABLE contacts ADD COLUMN next_action TEXT`,
    `ALTER TABLE contacts ADD COLUMN online INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE contacts ADD COLUMN next_step_due INTEGER`,
    `ALTER TABLE contacts ADD COLUMN last_interaction_at INTEGER`,
    `ALTER TABLE contacts ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE contacts ADD COLUMN disqualify_reason TEXT`,
    `ALTER TABLE contacts ADD COLUMN score_breakdown TEXT`,
    `ALTER TABLE contacts ADD COLUMN job_description TEXT`,
    `ALTER TABLE contacts ADD COLUMN sales_intel TEXT`,
    // Clasificación de contacto: 'lead' (venta) vs 'engineer' (ingeniero que
    // contactamos para el pool). Separa el pipeline de ventas del de ingenieros.
    `ALTER TABLE contacts ADD COLUMN contact_type TEXT NOT NULL DEFAULT 'lead'`,
    `CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(contact_type)`,
    // Radar v2: oportunidades de fuentes externas (job boards) además de grupos.
    `ALTER TABLE group_opportunities ADD COLUMN source TEXT NOT NULL DEFAULT 'whatsapp'`,
    `ALTER TABLE group_opportunities ADD COLUMN url TEXT`,
    // Índices únicos: evitan duplicados por carrera entre workers de Next.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_stages_name ON pipeline_stages(name)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_replies_label ON quick_replies(label)`,
    // Índices de FK y filtros frecuentes (auditoría 2026-06-09): dashboard, digest,
    // analytics y detalle de contacto hacían SCAN completo en cada carga.
    `CREATE INDEX IF NOT EXISTS idx_contacts_archived ON contacts(archived)`,
    `CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(stage)`,
    `CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_jid ON contacts(whatsapp_jid)`,
    `CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id)`,
    `CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
    `CREATE INDEX IF NOT EXISTS idx_lead_candidates_status ON lead_candidates(status)`,
    `CREATE INDEX IF NOT EXISTS idx_image_leads_status ON image_leads(status)`,
    `CREATE INDEX IF NOT EXISTS idx_step_transitions_contact ON step_transitions(contact_id)`,
    // Respaldo de idempotencia de save-lead/promote: un contacto por chat de WhatsApp
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_jid_unique ON contacts(whatsapp_jid) WHERE whatsapp_jid IS NOT NULL`,
    // El dedupe de candidates dependía de un índice que solo creaba
    // categorize-chats.ts (auditoría 2026-06-09): ahora vive en las migraciones
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_candidates_chat_jid ON lead_candidates(chat_jid)`,
    // Propuestas: FK a contacto y filtro por estado (listados del módulo).
    `CREATE INDEX IF NOT EXISTS idx_proposals_contact ON proposals(contact_id)`,
    `CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status)`,
    // Orden por created_at DESC en los listados (proposals y contacts): sin
    // índice SQLite escanea y ordena la tabla entera (auditoría 2026-06-22).
    `CREATE INDEX IF NOT EXISTS idx_proposals_created ON proposals(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts(created_at)`,
    // Radar ordena las oportunidades por created_at DESC (auditoria 2026-06-29).
    `CREATE INDEX IF NOT EXISTS idx_group_opportunities_created ON group_opportunities(created_at DESC)`,
    // El home filtra por status='new' y ordena por score DESC sin índice: full
    // table scan + sort en memoria en cada carga (code-audit 2026-06-30, hallazgo #6).
    `CREATE INDEX IF NOT EXISTS idx_group_opportunities_status_score ON group_opportunities(status, score DESC)`,
    // Estado de generacion IA en background (agregado post-release, idempotente).
    `ALTER TABLE proposals ADD COLUMN gen_status TEXT`,
    `ALTER TABLE proposals ADD COLUMN gen_error TEXT`,
    // Notas y archivos genericos por registro (contacto/deal/...): target_type +
    // target_id apuntan a cualquier objeto del record-view (panel de detalle).
    `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notes_target ON notes(target_type, target_id)`,
    `CREATE INDEX IF NOT EXISTS idx_attachments_target ON attachments(target_type, target_id)`,
    // Empresas: nombre único case-insensitive (dedupe del backfill desde contacts.company)
    // e índice para el filtro de archivados.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_name ON companies(name COLLATE NOCASE)`,
    `CREATE INDEX IF NOT EXISTS idx_companies_archived ON companies(archived)`,
    // Metadata engine (EAV): objetos y campos custom sin migrar por cada campo.
    `CREATE TABLE IF NOT EXISTS object_metadata (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      label_singular TEXT,
      label_plural TEXT,
      icon TEXT,
      is_custom INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS field_metadata (
      id TEXT PRIMARY KEY,
      object_name TEXT NOT NULL,
      name TEXT NOT NULL,
      label TEXT,
      type TEXT NOT NULL,
      options TEXT,
      is_custom INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(object_name, name)
    )`,
    `CREATE TABLE IF NOT EXISTS custom_field_values (
      object_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      field_id TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY(object_name, record_id, field_id)
    )`,
    `CREATE TABLE IF NOT EXISTS custom_records (
      id TEXT PRIMARY KEY,
      object_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_field_metadata_object ON field_metadata(object_name)`,
    `CREATE INDEX IF NOT EXISTS idx_custom_records_object ON custom_records(object_name)`,
    // Papelera / soft delete (b7): deleted_at NULL = registro vivo. El GET de cada
    // objeto excluye los borrados por defecto y la papelera lista solo los borrados.
    `ALTER TABLE contacts ADD COLUMN deleted_at INTEGER`,
    `ALTER TABLE deals ADD COLUMN deleted_at INTEGER`,
    `ALTER TABLE companies ADD COLUMN deleted_at INTEGER`,
    // El listado normal filtra deleted_at IS NULL: índice parcial para no escanear.
    `CREATE INDEX IF NOT EXISTS idx_contacts_deleted ON contacts(deleted_at)`,
    `CREATE INDEX IF NOT EXISTS idx_deals_deleted ON deals(deleted_at)`,
    `CREATE INDEX IF NOT EXISTS idx_companies_deleted ON companies(deleted_at)`,
    // Timeline de auditoría genérico (b7-timeline-audit): una fila por cambio de
    // cualquier objeto. changes = JSON {campo:{from,to}}. happens_at en SEGUNDOS.
    `CREATE TABLE IF NOT EXISTS timeline_activity (
      id TEXT PRIMARY KEY,
      object_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      type TEXT NOT NULL,
      changes TEXT,
      actor TEXT,
      happens_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_timeline_record ON timeline_activity(object_name, record_id, happens_at DESC)`,
    // Favoritos fijados (b7-merge-favoritos): un registro o link en el sidebar.
    `CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      label TEXT NOT NULL,
      href TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    // Un favorito por registro (toggle estrella). El sidebar ordena por position.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_target ON favorites(target_type, target_id)`,
    // Motor de workflows (b4-engine). steps/trigger_config/context/logs son JSON
    // serializado (TEXT). active 1/0. version simple por columna. Timestamps en
    // SEGUNDOS epoch (consistente con el resto: SQL crudo = Math.floor(Date.now()/1000)).
    `CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      trigger_type TEXT NOT NULL,
      trigger_config TEXT,
      steps TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      status TEXT NOT NULL,
      trigger TEXT,
      context TEXT,
      logs TEXT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER
    )`,
    // El dispatcher filtra workflows activos por trigger_type; el panel de runs
    // ordena por started_at DESC para un workflow dado.
    `CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON workflows(trigger_type, active)`,
    `CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id, started_at DESC)`,
    // Cola durable de workflows (auditoria SaaS 2026-07-01, fase 3.3). Ver
    // src/lib/workflows/queue.ts. status: pending|running|done|failed. run_after
    // (epoch seg) para backoff de reintentos; locked_at para reclamar colgados.
    `CREATE TABLE IF NOT EXISTS workflow_jobs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      trigger_context TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      run_after INTEGER NOT NULL,
      locked_at INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workflow_jobs_claimable ON workflow_jobs(status, run_after)`,
    // Sync (Fase A, solo lectura) con otra instancia de Niuro CRM via su API REST
    // (ver src/lib/crm-sync.ts, scripts/sync-crm.ts). Mapea un id remoto a su
    // copia local: los UUID se generan por app, asi que un mismo registro logico
    // NO comparte id entre instancias.
    `CREATE TABLE IF NOT EXISTS sync_mappings (
      table_name TEXT NOT NULL,
      local_id TEXT NOT NULL,
      remote_id TEXT NOT NULL,
      last_synced_at INTEGER NOT NULL,
      PRIMARY KEY (table_name, remote_id)
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_mappings_local ON sync_mappings(table_name, local_id)`,
    // Auth de una sola cuenta por instalacion (ver src/lib/auth.ts). La credencial
    // en si vive en crm_settings (auth_email/auth_password_hash); esta tabla es
    // solo las sesiones activas, para poder invalidarlas por logout real.
    `CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    // Historial del bridge de WhatsApp para /status (ver src/app/api/whatsapp/tick).
    // Una fila por TRANSICION de estado, no por check — evita miles de filas
    // identicas si el poller corre cada minuto y el bridge esta estable.
    `CREATE TABLE IF NOT EXISTS bridge_status_log (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      detail TEXT,
      checked_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bridge_status_log_checked ON bridge_status_log(checked_at DESC)`,
    // Multi-pipeline (Ajustes v2): prospectos (ventas), clientes e ingenieros.
    // Las etapas de ingenieros salen de las constantes viejas (mismos nombres:
    // los contactos engineer ya usan esos stage); clientes nace con defaults
    // editables desde Ajustes.
    `ALTER TABLE pipeline_stages ADD COLUMN pipeline TEXT NOT NULL DEFAULT 'prospectos'`,
    `DROP INDEX IF EXISTS idx_stages_name;
     CREATE UNIQUE INDEX IF NOT EXISTS idx_stages_pipeline_name ON pipeline_stages(pipeline, name);
     INSERT OR IGNORE INTO pipeline_stages (id, name, "order", color, is_won, is_lost, pipeline) VALUES
       ('ing-contactado', 'Contactado', 0, '#64748b', 0, 0, 'ingenieros'),
       ('ing-entrevista', 'Entrevista', 1, '#3B5FE5', 0, 0, 'ingenieros'),
       ('ing-evaluacion', 'Evaluacion', 2, '#D4940A', 0, 0, 'ingenieros'),
       ('ing-disponible', 'Disponible', 3, '#0EA5E9', 0, 0, 'ingenieros'),
       ('ing-colocado', 'Colocado', 4, '#16A34A', 0, 0, 'ingenieros'),
       ('cli-onboarding', 'Onboarding', 0, '#3B5FE5', 0, 0, 'clientes'),
       ('cli-activo', 'Activo', 1, '#16A34A', 0, 0, 'clientes'),
       ('cli-expansion', 'Expansion', 2, '#8B5CF6', 0, 0, 'clientes'),
       ('cli-en-riesgo', 'En riesgo', 3, '#DC2626', 0, 0, 'clientes')`,
  ];
  // Control de versiones (auditoria SaaS 2026-07-01, fase 1). Antes se re-corrian
  // TODOS los ALTER en cada arranque (idempotentes, pero re-ejecutados) y un error
  // no esperado se tragaba en silencio dejando la DB a medio migrar. Ahora:
  //  - schema_migrations trackea el indice de la ultima migracion aplicada.
  //  - solo se corren las nuevas (perf: cero ALTER en el arranque comun).
  //  - "duplicate column"/"already exists" cuenta como aplicada (idempotencia:
  //    instalaciones viejas ya tenian las columnas via el approach anterior).
  //  - cualquier OTRO error se logea LOUD (logger.error, puede salir de la
  //    maquina via ERROR_WEBHOOK_URL) y se corta: no se avanza la version, asi
  //    reintenta el proximo arranque en vez de saltear migraciones fuera de orden.
  const appliedRow = db
    .prepare("SELECT MAX(version) AS v FROM schema_migrations")
    .get() as { v: number | null } | undefined;
  const applied = appliedRow?.v ?? 0; // version = cantidad de migraciones aplicadas
  const record = db.prepare(
    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)"
  );
  for (let i = applied; i < migrations.length; i++) {
    try {
      db.exec(migrations[i]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/duplicate column|already exists/i.test(msg)) {
        logger.error("db.migration", "migración falló, se corta hasta reintentar", {
          index: i,
          sql: migrations[i].slice(0, 70),
          err: msg,
        });
        break; // no registrar esta version: reintenta el proximo arranque
      }
      // benigno (columna ya existe): cuenta como aplicada, se registra abajo
    }
    record.run(i + 1, Date.now());
  }
}

// Playbook de Niuro: 7 etapas (Prospecto → Expansion).
const NIURO_STAGES = [
  { name: "Prospecto", order: 0, color: "#64748b", isWon: 0, isLost: 0 },
  { name: "Discovery", order: 1, color: "#3B5FE5", isWon: 0, isLost: 0 },
  { name: "Propuesta", order: 2, color: "#D4940A", isWon: 0, isLost: 0 },
  { name: "Perfil", order: 3, color: "#06b6d4", isWon: 0, isLost: 0 },
  { name: "Entrevistas", order: 4, color: "#a855f7", isWon: 0, isLost: 0 },
  { name: "Cierre", order: 5, color: "#16A34A", isWon: 1, isLost: 0 },
  { name: "Expansion", order: 6, color: "#FFD166", isWon: 0, isLost: 0 },
];

// Mapeo de cualquier nombre viejo (demo o prototipo) al playbook de Niuro.
const STAGE_MAP_NIURO: Record<string, string> = {
  Inbox: "Prospecto", Prospecto: "Prospecto",
  Contactado: "Discovery", Calificado: "Discovery", Discovery: "Discovery",
  Propuesta: "Propuesta",
  Perfil: "Perfil",
  Negociacion: "Cierre", Entrevistas: "Entrevistas",
  Ganado: "Expansion", "Cerrado Ganado": "Cierre", Cierre: "Cierre", Expansion: "Expansion",
  "Cerrado Perdido": "Prospecto",
};

function getFlag(db: Database.Database, key: string): boolean {
  try {
    return !!db.prepare("SELECT value FROM crm_settings WHERE key = ?").get(key);
  } catch {
    return false;
  }
}
function setFlag(db: Database.Database, key: string): void {
  try {
    db.prepare("INSERT OR REPLACE INTO crm_settings (key, value) VALUES (?, '1')").run(key);
  } catch {
    // ignore
  }
}

// Migra las etapas al playbook de Niuro (una sola vez), remapeando los deals y
// la etapa de los contactos por nombre. Idempotente vía flag 'stages_v3'.
function migrateStagesNiuro(db: Database.Database): void {
  if (getFlag(db, "stages_v3")) return;
  try {
    const existing = db
      .prepare(`SELECT id, name FROM pipeline_stages`)
      .all() as { id: string; name: string }[];
    const niuroNames = NIURO_STAGES.map((s) => s.name).sort().join(",");
    const tx = db.transaction(() => {
      const idByName: Record<string, string> = {};
      const insert = db.prepare(
        `INSERT OR IGNORE INTO pipeline_stages (id, name, "order", color, is_won, is_lost) VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const s of NIURO_STAGES) {
        const id = crypto.randomUUID();
        idByName[s.name] = id;
        insert.run(id, s.name, s.order, s.color, s.isWon, s.isLost);
      }
      // Remapear deals + borrar etapas viejas (las que no son del playbook).
      if (existing.map((s) => s.name).sort().join(",") !== niuroNames) {
        const updateDeal = db.prepare(`UPDATE deals SET stage_id = ? WHERE stage_id = ?`);
        const del = db.prepare(`DELETE FROM pipeline_stages WHERE id = ?`);
        for (const old of existing) {
          const target = idByName[STAGE_MAP_NIURO[old.name] || "Prospecto"];
          // NUNCA borrar una etapa cuyos deals no se pudieron remapear: dejaría
          // deals apuntando a un stage_id inexistente. Si no hay target (mapeo roto
          // o falta una etapa del playbook), abortar la transacción (rollback) y
          // reintentar en el próximo arranque, en vez de huérfanar deals.
          if (!target) {
            throw new Error(
              `migrateStagesNiuro: sin target para etapa "${old.name}"; aborto para no huérfanar deals`
            );
          }
          updateDeal.run(target, old.id);
          del.run(old.id);
        }
      }
      // Remapear la etapa (texto) de los contactos.
      const updC = db.prepare(`UPDATE contacts SET stage = ? WHERE stage = ?`);
      for (const [oldName, niuro] of Object.entries(STAGE_MAP_NIURO)) {
        if (oldName !== niuro) updC.run(niuro, oldName);
      }
    });
    tx();
    setFlag(db, "stages_v3");
  } catch (e) {
    // La transacción hace rollback completo: o se remapean todos los deals y se
    // borran las etapas viejas, o no se toca nada. El flag NO se setea, así que se
    // reintenta en el próximo arranque. Se loguea para no fallar en silencio.
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[db] migrateStagesNiuro falló (rollback, se reintenta): ${msg}`);
  }
}

// Semilla real (single-user (operador) + automatizaciones/integraciones reales).
function seedProtoData(db: Database.Database): void {
  if (getFlag(db, "proto_seed_v1")) return;
  try {
    const tx = db.transaction(() => {
      const agent = db.prepare(
        `INSERT OR IGNORE INTO agents (id, name, role, color, email, online) VALUES (?, ?, ?, ?, ?, ?)`
      );
      agent.run("asistente", operator.name, operator.role, "#10b981", operator.email, 1);

      const auto = db.prepare(
        `INSERT OR IGNORE INTO automations (id, name, description, active, processed, success_pct) VALUES (?, ?, ?, ?, ?, ?)`
      );
      auto.run("scan", "Detección de leads", "Analiza conversaciones de WhatsApp y detecta intención de compra (diario 8:03).", 1, 0, 0);
      auto.run("digest", "Resumen diario", "Email con follow-ups pendientes y leads calientes.", 0, 0, 0);
      auto.run("followups", "Alertas de follow-up", "Avisa de seguimientos vencidos y del día.", 1, 0, 0);

      const integ = db.prepare(
        `INSERT OR IGNORE INTO integrations (id, name, color, connected, leads, last_sync) VALUES (?, ?, ?, ?, ?, ?)`
      );
      integ.run("whatsapp", "WhatsApp", "#25D366", 1, 0, null);
      integ.run("anthropic", "Anthropic (IA)", "#d97757", 0, 0, null);
      integ.run("resend", "Resend (Email)", "#0f172a", 0, 0, null);

      const qr = db.prepare(`INSERT OR IGNORE INTO quick_replies (id, label, text) VALUES (?, ?, ?)`);
      qr.run(crypto.randomUUID(), "Saludo", "Hola! Gracias por escribir 🙌 Cuéntame en qué te puedo ayudar.");
      qr.run(crypto.randomUUID(), "Agendar", "¿Te parece si agendamos una llamada de 15 min esta semana?");
      qr.run(crypto.randomUUID(), "Propuesta", "Te preparo una propuesta con perfiles y costos. ¿Me confirmas el stack y la urgencia?");
      qr.run(crypto.randomUUID(), "Seguimiento", "Hola! Paso a dar seguimiento 🙂 ¿Cómo vas con lo que conversamos?");
    });
    tx();
    setFlag(db, "proto_seed_v1");
  } catch {
    // ignore
  }
}

function phoneToCountry(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  const prefixes: [string, string][] = [
    ["52", "MX"], ["56", "CL"], ["57", "CO"], ["54", "AR"],
    ["55", "BR"], ["51", "PE"], ["34", "ES"], ["1", "US"],
  ];
  for (const [p, c] of prefixes) if (d.startsWith(p)) return c;
  return null;
}

// Backfill (una vez) de los contactos reales al modelo del proto.
function backfillContacts(db: Database.Database): void {
  if (getFlag(db, "contacts_backfill_v1")) return;
  try {
    const rows = db
      .prepare(`SELECT id, phone, temperature, score FROM contacts`)
      .all() as { id: string; phone: string | null; temperature: string; score: number }[];
    const stageByTemp: Record<string, string> = { hot: "Discovery", warm: "Prospecto", cold: "Prospecto" };
    const upd = db.prepare(
      `UPDATE contacts SET stage = ?, channel = 'whatsapp', probability = ?, country = ?, tags = ?, agent_id = 'asistente' WHERE id = ?`
    );
    const tx = db.transaction(() => {
      for (const c of rows) {
        const stage = stageByTemp[c.temperature] || "Prospecto";
        const prob = Math.max(0, Math.min(100, c.score || 0));
        const tags = c.temperature === "hot" ? JSON.stringify(["Hot"]) : null;
        upd.run(stage, prob, phoneToCountry(c.phone), tags, c.id);
      }
    });
    tx();
    setFlag(db, "contacts_backfill_v1");
  } catch {
    // ignore
  }
}

// Backfill (una vez) de la tabla companies a partir del texto libre
// contacts.company: una empresa por nombre distinto no vacío. Idempotente vía
// flag + INSERT OR IGNORE (el índice único NOCASE evita duplicados por casing).
function seedCompaniesFromContacts(db: Database.Database): void {
  if (getFlag(db, "companies_seed_v1")) return;
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT trim(company) AS name FROM contacts
          WHERE company IS NOT NULL AND trim(company) != ''`
      )
      .all() as { name: string }[];
    // Drizzle (mode: "timestamp") lee created_at/updated_at en SEGUNDOS epoch,
    // no ms: insertar Date.now() daba fechas en el año 58464 (mismo gotcha que
    // reconcileStuckProposals). Guardar segundos.
    const now = Math.floor(Date.now() / 1000);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO companies (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`
    );
    const tx = db.transaction(() => {
      for (const r of rows) insert.run(crypto.randomUUID(), r.name, now, now);
    });
    tx();
    setFlag(db, "companies_seed_v1");
  } catch (e) {
    // No crítico: si falla, el módulo de empresas arranca vacío y se reintenta.
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[db] seedCompaniesFromContacts falló: ${msg}`);
  }
}

// Objetos estandar del CRM en object_metadata (is_custom=0). Idempotente via
// INSERT OR IGNORE sobre el UNIQUE(name). Labels en espanol.
const STANDARD_OBJECTS: { name: string; singular: string; plural: string }[] = [
  { name: "contacts", singular: "Contacto", plural: "Contactos" },
  { name: "deals", singular: "Deal", plural: "Deals" },
  { name: "companies", singular: "Empresa", plural: "Empresas" },
  { name: "opportunities", singular: "Oportunidad", plural: "Oportunidades" },
  { name: "proposals", singular: "Propuesta", plural: "Propuestas" },
  { name: "tickets", singular: "Ticket", plural: "Tickets" },
];

function seedStandardObjects(db: Database.Database): void {
  try {
    const now = Math.floor(Date.now() / 1000);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO object_metadata (id, name, label_singular, label_plural, is_custom, is_active, created_at)
       VALUES (?, ?, ?, ?, 0, 1, ?)`
    );
    const tx = db.transaction(() => {
      for (const o of STANDARD_OBJECTS) insert.run(crypto.randomUUID(), o.name, o.singular, o.plural, now);
    });
    tx();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[db] seedStandardObjects fallo: ${msg}`);
  }
}

function seedDefaultStages(db: Database.Database): void {
  try {
    const result = db
      .prepare("SELECT COUNT(*) as count FROM pipeline_stages")
      .get() as { count: number } | undefined;

    if (!result || result.count > 0) return;

    const defaultStages = NIURO_STAGES;

    const insert = db.prepare(
      `INSERT OR IGNORE INTO pipeline_stages (id, name, "order", color, is_won, is_lost) VALUES (?, ?, ?, ?, ?, ?)`
    );

    const seedAll = db.transaction(() => {
      for (const stage of defaultStages) {
        insert.run(
          crypto.randomUUID(),
          stage.name,
          stage.order,
          stage.color,
          stage.isWon,
          stage.isLost
        );
      }
    });

    seedAll();
  } catch {
    // Seeding can fail if another worker is doing it — that's fine
  }
}

// Reconciliador de arranque: propuestas que quedaron en genStatus='generating'
// tras un reinicio (el proceso fire-and-forget murio) jamas vuelven a 'ready' ni
// 'error', y la UI hace polling infinito. Las que llevan >15 min generando se
// marcan 'error' para cortar el polling (auditoria 2026-06-29). Idempotente.
function reconcileStuckProposals(db: Database.Database): void {
  try {
    // Drizzle (mode: "timestamp") guarda epoch en SEGUNDOS, no ms.
    const nowSec = Math.floor(Date.now() / 1000);
    const cutoff = nowSec - 15 * 60;
    const info = db
      .prepare(
        `UPDATE proposals SET gen_status = 'error',
           gen_error = COALESCE(gen_error, 'Generacion interrumpida por reinicio'),
           updated_at = ?
         WHERE gen_status = 'generating' AND updated_at < ?`
      )
      .run(nowSec, cutoff);
    if (info.changes > 0) {
      console.error(`[db] reconcileStuckProposals: ${info.changes} propuesta(s) colgada(s) -> error`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[db] reconcileStuckProposals fallo: ${msg}`);
  }
}

const sqlite = createDatabase();
initTables(sqlite);
seedDefaultStages(sqlite);
migrateStagesNiuro(sqlite);
seedProtoData(sqlite);
backfillContacts(sqlite);
seedCompaniesFromContacts(sqlite);
reconcileStuckProposals(sqlite);
seedStandardObjects(sqlite);

export const db = drizzle(sqlite, { schema });
// Handle better-sqlite3 crudo (misma conexion: WAL, pragmas, migraciones ya
// corridas). Lo usa el metadata engine (EAV) con SQL directo.
export const rawDb = sqlite;
