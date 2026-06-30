/**
 * learned-examples.ts — Scoring que aprende de resultados reales.
 *
 * Construye un bloque de contexto con casos GANADOS (Cierre/Expansion) y
 * PERDIDOS (archivados con razón) para inyectar en los prompts de IA que
 * califican leads (categorize-chats.ts). Así la calificación se calibra con
 * lo que de verdad pasó, no solo con la rúbrica teórica.
 *
 * También lee la calibración numérica que deja scripts/calibrate-scoring.ts
 * en crm_settings ('scoring_calibration').
 *
 * Recibe un handle better-sqlite3 (los scripts abren la DB directo).
 */
import type { Database } from "better-sqlite3";

type WonRow = { name: string; company: string | null; stage: string; score_breakdown: string | null; notes: string | null };
type LostRow = { name: string; company: string | null; stage: string; disqualify_reason: string | null };

export type ScoringCalibration = {
  updatedAt: string;
  wonCount: number;
  lostCount: number;
  avgWonScore: number | null;
  avgLostScore: number | null;
  lossCategories: { category: string; count: number }[];
};

export function readCalibration(db: Database): ScoringCalibration | null {
  try {
    const row = db.prepare("SELECT value FROM crm_settings WHERE key = 'scoring_calibration'").get() as
      { value: string } | undefined;
    return row ? (JSON.parse(row.value) as ScoringCalibration) : null;
  } catch {
    return null;
  }
}

function shortReason(reason: string | null): string {
  if (!reason) return "sin razón registrada";
  return reason.length > 140 ? reason.slice(0, 137) + "…" : reason;
}

/** Bloque de texto para prompts de calificación. "" si no hay casos aún. */
export function buildLearnedContext(db: Database, maxWon = 5, maxLost = 8): string {
  let won: WonRow[] = [];
  let lost: LostRow[] = [];
  try {
    won = db.prepare(`
      SELECT name, company, stage, score_breakdown, notes FROM contacts
      WHERE archived = 0 AND stage IN ('Cierre','Expansion')
      ORDER BY updated_at DESC LIMIT ?
    `).all(maxWon) as WonRow[];
    lost = db.prepare(`
      SELECT name, company, stage, disqualify_reason FROM contacts
      WHERE archived = 1 AND disqualify_reason IS NOT NULL AND disqualify_reason != ''
      ORDER BY updated_at DESC LIMIT ?
    `).all(maxLost) as LostRow[];
  } catch {
    return "";
  }
  if (won.length === 0 && lost.length === 0) return "";

  const lines: string[] = ["", "CASOS REALES PASADOS (calibrá tu criterio con esto):"];
  if (won.length) {
    lines.push("Leads que TERMINARON GANADOS (así se ve un lead bueno de Niuro):");
    for (const w of won) {
      lines.push(`- ${w.company || w.name} (llegó a ${w.stage})`);
    }
  }
  if (lost.length) {
    lines.push("Leads que TERMINARON PERDIDOS y por qué (ojo con repetir el error de score alto aquí):");
    for (const l of lost) {
      lines.push(`- ${l.company || l.name} (se perdió en ${l.stage}): ${shortReason(l.disqualify_reason)}`);
    }
  }
  const cal = readCalibration(db);
  if (cal && cal.avgWonScore != null && cal.avgLostScore != null) {
    lines.push(
      `Calibración: los ganados promediaron score ${cal.avgWonScore} y los perdidos ${cal.avgLostScore}. ` +
      (cal.avgLostScore >= 50
        ? "OJO: hay perdidos con score alto — interés declarado NO basta; pesá más presupuesto confirmado y avance concreto (reunión agendada, perfiles pedidos)."
        : "La separación es sana; mantené el criterio.")
    );
  }
  return lines.join("\n");
}
