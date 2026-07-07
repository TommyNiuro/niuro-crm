/**
 * precalif-import.ts — Consolida la precalificación masiva en lead_candidates.
 *
 * Lee /tmp/precalif/out-*.json (veredictos del team de agentes) y
 * /tmp/precalif/rules.json (chats sin diálogo, ya calificados por reglas) y
 * upserta en lead_candidates. NUNCA toca el status: archivados/aprobados ni
 * siquiera entran (el export los excluye) y el upsert no modifica status.
 *
 * Uso: npx tsx scripts/precalif-import.ts
 */
import { openDb } from "../src/lib/db-open";
import path from "path";
import fs from "fs";

const CRM_DB = path.resolve(process.cwd(), "data/crm.db");
const OUT_DIR = "/tmp/precalif";

type AgentVerdict = {
  jid: string;
  intencion: number; autoridad: number; necesidad: number;
  urgencia: number; presupuesto: number;
  reason: string;
  recommendation: "save" | "review" | "discard";
  disqualifier: string | null;
};
type RuleResult = {
  jid: string; name: string | null; lastTs: string | null;
  score: number; temperature: string;
  breakdown: Record<string, number>; reason: string; recommendation: string;
};

const index = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "index.json"), "utf8")) as
  Record<string, { name: string | null; lastTs: string | null }>;

function recencyFactor(dsl: number): number {
  if (dsl <= 7) return 1.0;
  if (dsl <= 21) return 0.85;
  if (dsl <= 45) return 0.7;
  return 0.5;
}
const clamp = (v: unknown, max: number) => Math.min(max, Math.max(0, Number(v) || 0));

const db = openDb(CRM_DB);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 60000");

const upsert = db.prepare(`
  INSERT INTO lead_candidates (id, name, phone, chat_jid, score, temperature, reason,
    next_action, source, status, last_message_at, created_at, updated_at, breakdown)
  VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, 'whatsapp', 'pending',
    ?, unixepoch('now'), unixepoch('now'), ?)
  ON CONFLICT(chat_jid) DO UPDATE SET
    name=excluded.name, score=excluded.score, temperature=excluded.temperature,
    reason=excluded.reason, next_action=excluded.next_action,
    last_message_at=excluded.last_message_at, updated_at=excluded.updated_at,
    breakdown=excluded.breakdown
`);

let imported = 0, rejected = 0;
const counters: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
const seen = new Set<string>();

function save(jid: string, name: string | null, lastTs: string | null,
              score: number, temperature: string, reason: string,
              recommendation: string, breakdown: Record<string, number>) {
  if (seen.has(jid)) return; // primer veredicto gana (evita duplicados entre lotes)
  seen.add(jid);
  const phone = jid.split("@")[0];
  const lastMs = lastTs ? Math.floor(new Date(lastTs).getTime() / 1000) : Math.floor(Date.now() / 1000);
  const nextAction =
    recommendation === "save" ? "Contactar — lead calificado" :
    recommendation === "review" ? "Revisar conversación" : null;
  upsert.run(name || `+${phone}`, phone, jid, score, temperature, reason,
    nextAction, isNaN(lastMs) ? Math.floor(Date.now() / 1000) : lastMs, JSON.stringify(breakdown));
  counters[temperature] = (counters[temperature] ?? 0) + 1;
  imported++;
}

const importAll = db.transaction(() => {
  // 1) Veredictos del team de agentes
  const outFiles = fs.readdirSync(OUT_DIR).filter((f) => /^out-\d+\.json$/.test(f)).sort();
  for (const f of outFiles) {
    let verdicts: AgentVerdict[];
    try {
      verdicts = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8"));
      if (!Array.isArray(verdicts)) throw new Error("no es array");
    } catch (e) {
      console.warn(`[import] ${f} ilegible: ${e}`);
      continue;
    }
    for (const v of verdicts) {
      const meta = index[v?.jid];
      if (!meta) { rejected++; continue; } // jid no exportado: se rechaza
      const bd = {
        intencion: clamp(v.intencion, 35), autoridad: clamp(v.autoridad, 20),
        necesidad: clamp(v.necesidad, 20), urgencia: clamp(v.urgencia, 15),
        presupuesto: clamp(v.presupuesto, 10),
      };
      const base = bd.intencion + bd.autoridad + bd.necesidad + bd.urgencia + bd.presupuesto;
      const dsl = meta.lastTs
        ? Math.max(0, Math.floor((Date.now() - new Date(meta.lastTs).getTime()) / 86400000))
        : 999;
      const score = Math.min(100, Math.round(base * recencyFactor(dsl)));
      const disq = v.disqualifier && v.disqualifier !== "null" ? v.disqualifier : null;
      const temperature = disq ? "cold"
        : score >= 70 && bd.intencion >= 28 ? "hot"
        : score >= 40 ? "warm" : "cold";
      save(v.jid, meta.name, meta.lastTs, disq ? 0 : score, temperature,
        String(v.reason || "Precalificación IA").slice(0, 300),
        disq ? "discard" : (v.recommendation || "review"), bd);
    }
  }

  // 2) Chats sin diálogo (reglas)
  const rules = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "rules.json"), "utf8")) as RuleResult[];
  for (const r of rules) {
    save(r.jid, r.name, r.lastTs, r.score, r.temperature, r.reason, r.recommendation, r.breakdown);
  }
});
importAll();

const totalAi = Object.keys(index).length;
const missing = totalAi - [...seen].filter((j) => index[j]).length;
console.log(JSON.stringify({
  imported, rejected, missingAiVerdicts: missing,
  hot: counters.hot, warm: counters.warm, cold: counters.cold,
}));
db.close();
