/**
 * detect-gaps.ts — Detector de huecos intra-chat en conversaciones 1-a-1.
 *
 * El conteo diario agregado no prueba que cada chat esté completo: una caída
 * corta del bridge o un backfill inicial limitado dejan huecos INTERNOS en
 * chats puntuales (se ven bien pero les falta el medio).
 *
 * Este script escanea cada chat individual (@s.whatsapp.net + @lid) y reporta,
 * por chat, el mayor salto de tiempo entre mensajes consecutivos desde una
 * fecha de corte. Prioriza los chats que YA son contacto o lead (los que de
 * verdad importan recuperar). NO modifica nada — solo lee crm.db.
 *
 * Uso:
 *   npx tsx scripts/detect-gaps.ts                  # desde 2026-02-01, gaps > 4 días
 *   npx tsx scripts/detect-gaps.ts --since 2026-01-01 --min-gap 7
 *   npx tsx scripts/detect-gaps.ts --only-known     # solo chats que son contacto/lead
 *   npx tsx scripts/detect-gaps.ts --json           # salida JSON para encadenar con backfill
 */
import Database from "better-sqlite3";
import { join } from "path";

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name: string): boolean { return args.includes(`--${name}`); }
function opt(name: string, def: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const SINCE = opt("since", "2026-02-01");
const MIN_GAP_DAYS = Number(opt("min-gap", "4"));
const ONLY_KNOWN = flag("only-known");
const AS_JSON = flag("json");

const dbPath = join(process.env.HOME || "", "niuro/auto-crm/data/crm.db");
const db = new Database(dbPath, { readonly: true });

// ── chats individuales (no grupos, no broadcast) ────────────────────────────
interface Row { chat_jid: string; ts: string }
const rows = db
  .prepare(
    `SELECT chat_jid, timestamp AS ts
     FROM wa_messages
     WHERE (chat_jid LIKE '%@s.whatsapp.net' OR chat_jid LIKE '%@lid')
       AND timestamp >= ?
     ORDER BY chat_jid, timestamp ASC`
  )
  .all(SINCE) as Row[];

// nombre del chat + si es contacto/lead conocido
const chatName = new Map<string, string>();
for (const r of db.prepare(`SELECT jid, name FROM wa_chats`).all() as { jid: string; name: string }[]) {
  if (r.name) chatName.set(r.jid, r.name);
}
const isContact = new Set<string>(
  (db.prepare(`SELECT whatsapp_jid AS j FROM contacts WHERE whatsapp_jid IS NOT NULL`).all() as { j: string }[]).map((x) => x.j)
);
const isLead = new Set<string>(
  (db.prepare(`SELECT chat_jid AS j FROM lead_candidates`).all() as { j: string }[]).map((x) => x.j)
);

// ── agrupar por chat y calcular gaps ────────────────────────────────────────
const DAY = 86400000;
function parseTs(s: string): number {
  // formato del bridge: "2026-05-18 06:26:21-06:00"
  const t = Date.parse(s.replace(" ", "T"));
  return Number.isNaN(t) ? Date.parse(s) : t;
}

interface ChatReport {
  jid: string;
  name: string;
  known: "contacto" | "lead" | "-";
  msgs: number;
  first: string;
  last: string;
  maxGapDays: number;
  gapStart: string; // último mensaje ANTES del hueco (anchor para backfill)
  gapEnd: string;   // primer mensaje DESPUÉS del hueco
  gapsOver: number; // cuántos saltos > MIN_GAP_DAYS
}

const byChat = new Map<string, number[]>();
for (const r of rows) {
  const arr = byChat.get(r.chat_jid) ?? [];
  arr.push(parseTs(r.ts));
  byChat.set(r.chat_jid, arr);
}

const reports: ChatReport[] = [];
for (const [jid, tsArr] of byChat) {
  const known = isContact.has(jid) ? "contacto" : isLead.has(jid) ? "lead" : "-";
  if (ONLY_KNOWN && known === "-") continue;
  if (tsArr.length < 2) continue;

  let maxGap = 0, gapStartIdx = 0, gapsOver = 0;
  for (let i = 1; i < tsArr.length; i++) {
    const gap = tsArr[i] - tsArr[i - 1];
    if (gap > maxGap) { maxGap = gap; gapStartIdx = i - 1; }
    if (gap > MIN_GAP_DAYS * DAY) gapsOver++;
  }
  const maxGapDays = Math.round((maxGap / DAY) * 10) / 10;
  if (maxGapDays < MIN_GAP_DAYS) continue;

  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  reports.push({
    jid,
    name: chatName.get(jid) || jid.split("@")[0],
    known,
    msgs: tsArr.length,
    first: fmt(tsArr[0]),
    last: fmt(tsArr[tsArr.length - 1]),
    maxGapDays,
    gapStart: fmt(tsArr[gapStartIdx]),
    gapEnd: fmt(tsArr[gapStartIdx + 1]),
    gapsOver,
  });
}

// Prioridad: conocidos primero, luego por mayor hueco
const rank = { contacto: 0, lead: 1, "-": 2 } as const;
reports.sort((a, b) => rank[a.known] - rank[b.known] || b.maxGapDays - a.maxGapDays);

if (AS_JSON) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  const known = reports.filter((r) => r.known !== "-").length;
  console.log(`\nHuecos intra-chat (1-a-1) desde ${SINCE}, salto mínimo ${MIN_GAP_DAYS} días`);
  console.log(`Chats con hueco sospechoso: ${reports.length} (${known} son contacto/lead)\n`);
  console.log(
    "tipo".padEnd(9) + "nombre".padEnd(26) + "msgs".padStart(6) +
    "  maxgap".padStart(9) + "  hueco".padStart(8) + "  ventana del hueco"
  );
  console.log("─".repeat(92));
  for (const r of reports.slice(0, 60)) {
    console.log(
      r.known.padEnd(9) +
      r.name.slice(0, 24).padEnd(26) +
      String(r.msgs).padStart(6) +
      `  ${r.maxGapDays}d`.padStart(9) +
      `  ${r.gapsOver}`.padStart(8) +
      `  ${r.gapStart} → ${r.gapEnd}`
    );
  }
  if (reports.length > 60) console.log(`\n… y ${reports.length - 60} más. Usá --json para la lista completa.`);
  console.log(`\nNota: un hueco grande puede ser conversación real (no hablaron) o un agujero de sync.`);
  console.log(`El re-link con full-sync llena los agujeros reales; los chats que sigan con hueco`);
  console.log(`tras el sync probablemente sean silencios genuinos.\n`);
}
db.close();
