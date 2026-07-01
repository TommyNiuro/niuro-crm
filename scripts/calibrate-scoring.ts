/**
 * calibrate-scoring.ts — Calibración del scoring con resultados reales.
 *
 * Compara los scores que el sistema asignó contra lo que de verdad pasó
 * (ganados = Cierre/Expansion activos; perdidos = archivados) y guarda el
 * resumen en crm_settings('scoring_calibration'). Ese resumen lo leen los
 * prompts de calificación vía src/lib/learned-examples.ts, cerrando el loop:
 * resultados → calibración → mejores scores.
 *
 * Corre a diario después de la cadencia (mismo wrapper) o a mano:
 *   npx tsx scripts/calibrate-scoring.ts
 */
import { openDb } from "../src/lib/db-open";
import path from "path";

const CRM_DB = path.resolve(process.cwd(), "data/crm.db");

function lossCategory(reason: string | null): string {
  if (!reason || !reason.trim()) return "Sin razón registrada";
  const head = reason.split(/[.\n]/)[0].trim();
  return head.length > 60 ? head.slice(0, 57) + "…" : head || "Sin razón registrada";
}

function avg(xs: number[]): number | null {
  return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null;
}

function main() {
  const db = openDb(CRM_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 60000");

  const won = db.prepare(`
    SELECT score FROM contacts WHERE archived = 0 AND stage IN ('Cierre','Expansion')
  `).all() as { score: number }[];
  const lost = db.prepare(`
    SELECT score, disqualify_reason FROM contacts WHERE archived = 1
  `).all() as { score: number; disqualify_reason: string | null }[];

  const byCategory = new Map<string, number>();
  for (const l of lost) {
    const cat = lossCategory(l.disqualify_reason);
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
  }

  const calibration = {
    updatedAt: new Date().toISOString(),
    wonCount: won.length,
    lostCount: lost.length,
    avgWonScore: avg(won.map((w) => w.score)),
    avgLostScore: avg(lost.map((l) => l.score)),
    lossCategories: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([category, count]) => ({ category, count })),
  };

  db.prepare(`INSERT INTO crm_settings (key, value) VALUES ('scoring_calibration', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(JSON.stringify(calibration));

  console.log(`[calibrate] ganados: ${calibration.wonCount} (score prom ${calibration.avgWonScore ?? "—"}) · ` +
    `perdidos: ${calibration.lostCount} (score prom ${calibration.avgLostScore ?? "—"})`);
  for (const c of calibration.lossCategories) console.log(`[calibrate]   pérdida: ${c.category} ×${c.count}`);
  db.close();
}

main();
