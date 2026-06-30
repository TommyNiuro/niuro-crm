#!/usr/bin/env npx tsx
// ⚠️ ADVERTENCIA (auditoría 2026-06-09): este DDL ya divergió del runtime.
// La fuente de verdad del esquema es src/db/index.ts (initTables + migraciones),
// que corre en cada arranque del server. Si agregas una columna, agrégala ALLÁ.
// Este script queda solo para el bootstrap inicial de una instalación nueva.

/**
 * Auto-CRM initialization script.
 * Creates the database, seeds default pipeline stages,
 * and optionally seeds demo data.
 *
 * Usage:
 *   npx tsx scripts/init.ts          # Init only
 *   npx tsx scripts/init.ts --seed   # Init + demo data
 */

import crypto from "crypto";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "crm.db");
const shouldSeed = process.argv.includes("--seed");

// Ensure data directory
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log("Initializing Auto-CRM...");
console.log(`Database: ${DB_PATH}`);

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
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
  );

  CREATE TABLE IF NOT EXISTS pipeline_stages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    color TEXT NOT NULL DEFAULT '#64748b',
    is_won INTEGER NOT NULL DEFAULT 0,
    is_lost INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS deals (
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
  );

  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    deal_id TEXT REFERENCES deals(id),
    scheduled_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS crm_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    title TEXT NOT NULL,
    step_name TEXT,
    due_at INTEGER,
    status TEXT NOT NULL DEFAULT 'open',
    completed_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS step_transitions (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    from_step TEXT,
    to_step TEXT NOT NULL,
    duration_days INTEGER,
    occurred_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lead_candidates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    chat_jid TEXT NOT NULL UNIQUE,
    score INTEGER NOT NULL DEFAULT 0,
    temperature TEXT NOT NULL DEFAULT 'cold',
    reason TEXT,
    next_action TEXT,
    breakdown TEXT,
    source TEXT NOT NULL DEFAULT 'whatsapp',
    status TEXT NOT NULL DEFAULT 'pending',
    contact_id TEXT,
    last_message_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_lead_candidates_jid ON lead_candidates(chat_jid);
  CREATE INDEX IF NOT EXISTS idx_lead_candidates_status ON lead_candidates(status);
`);

console.log("Tables created.");

// Seed default pipeline stages
const stageCount = sqlite
  .prepare("SELECT COUNT(*) as count FROM pipeline_stages")
  .get() as { count: number };

if (stageCount.count === 0) {
  // 7 etapas reales del playbook Niuro (staff augmentation consultivo)
  const defaultStages = [
    { name: "Prospecto",    order: 1, color: "#94a3b8", isWon: 0, isLost: 0 },
    { name: "Discovery",    order: 2, color: "#3B5FE5", isWon: 0, isLost: 0 },
    { name: "Propuesta",    order: 3, color: "#D4940A", isWon: 0, isLost: 0 },
    { name: "Perfil",       order: 4, color: "#06b6d4", isWon: 0, isLost: 0 },
    { name: "Entrevistas",  order: 5, color: "#a855f7", isWon: 0, isLost: 0 },
    { name: "Cierre",       order: 6, color: "#16A34A", isWon: 1, isLost: 0 },
    { name: "Expansion",    order: 7, color: "#FFD166", isWon: 0, isLost: 0 },
  ];

  const insert = sqlite.prepare(
    `INSERT INTO pipeline_stages (id, name, "order", color, is_won, is_lost) VALUES (?, ?, ?, ?, ?, ?)`
  );

  for (const stage of defaultStages) {
    insert.run(crypto.randomUUID(), stage.name, stage.order, stage.color, stage.isWon, stage.isLost);
  }
  console.log("Default pipeline stages created.");
} else {
  console.log("Pipeline stages already exist, skipping.");
}

// Copy default config if none exists
const configPath = path.join(process.cwd(), "crm-config.json");
const defaultConfigPath = path.join(process.cwd(), "public", "crm-config.json");
if (!fs.existsSync(configPath) && fs.existsSync(defaultConfigPath)) {
  fs.copyFileSync(defaultConfigPath, configPath);
  console.log("Default crm-config.json created.");
}

sqlite.close();

if (shouldSeed) {
  console.log("\nSeeding demo data...");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cp = require("child_process");
  cp.execSync("npx tsx src/db/seed.ts", { stdio: "inherit", cwd: process.cwd() });
}

console.log("\nAuto-CRM initialized successfully!");
console.log("Run 'npm run dev' to start the development server.");
console.log("Open http://localhost:3000 to access your CRM.");
