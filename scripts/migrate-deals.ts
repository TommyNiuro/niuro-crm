/**
 * migrate-deals.ts — Fase 1 auditoría 2026-07-02 (one-shot, idempotente).
 *
 * El deal pasa a ser la fuente de verdad del dinero del pipeline. Este script
 * crea el deal inicial para cada lead vivo que tiene monto en el contacto
 * (contacts.value_cents > 0) y todavía no tiene ningún deal vivo. La etapa del
 * deal es la homónima de la etapa actual del contacto en el pipeline de
 * prospectos (fallback: la primera).
 *
 * Correr contra la DB de la .app instalada:
 *   CRM_DATA_DIR="$HOME/Library/Application Support/io.niuro.crm" npx tsx scripts/migrate-deals.ts
 * Dry-run: agregar --dry
 */
import crypto from "crypto";
import { openDb } from "../src/lib/db-open";
import { dbPath } from "../src/lib/paths";

const DRY = process.argv.includes("--dry");

function main() {
  const db = openDb(dbPath());
  db.pragma("busy_timeout = 60000");

  const rows = db.prepare(`
    SELECT c.id, c.name, c.company, c.stage, c.value_cents, c.probability
    FROM contacts c
    WHERE c.deleted_at IS NULL AND c.archived = 0
      AND c.contact_type = 'lead' AND c.value_cents > 0
      AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.contact_id = c.id AND d.deleted_at IS NULL)
  `).all() as { id: string; name: string; company: string | null; stage: string; value_cents: number; probability: number }[];

  const stageId = db.prepare(
    "SELECT id FROM pipeline_stages WHERE pipeline = 'prospectos' AND name = ?"
  );
  const firstStage = db.prepare(
    "SELECT id FROM pipeline_stages WHERE pipeline = 'prospectos' ORDER BY \"order\" LIMIT 1"
  ).get() as { id: string } | undefined;

  if (!firstStage) {
    console.error("[migrate-deals] no hay etapas de prospectos; nada que hacer");
    db.close();
    return;
  }

  const ins = db.prepare(`
    INSERT INTO deals (id, title, value, stage_id, contact_id, probability, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch('now'), unixepoch('now'))
  `);

  let created = 0;
  for (const c of rows) {
    const sid = (stageId.get(c.stage) as { id: string } | undefined)?.id ?? firstStage.id;
    const title = `Staff augmentation · ${c.company || c.name}`;
    if (DRY) {
      console.log(`[dry] ${title}: $${(c.value_cents / 100).toLocaleString()} (${c.probability}%) etapa=${c.stage}`);
    } else {
      ins.run(crypto.randomUUID(), title, c.value_cents, sid, c.id, c.probability || 0);
    }
    created++;
  }

  console.log(`[migrate-deals] ${DRY ? "crearía" : "creados"} ${created} deal(s) desde contactos con monto`);
  db.close();
}

main();
