/**
 * precalif-export.ts — Prepara la precalificación masiva de chats.
 *
 * Divide los chats individuales NO archivados, NO aprobados y NO vinculados a
 * contactos en dos grupos:
 *   - IA: chats con conversación real (respuesta del contacto) o con el pitch
 *     de Niuro.io → se exportan en lotes JSON a /tmp/precalif/batch-*.json
 *     para que un team de agentes los califique.
 *   - Reglas: chats sin diálogo (sin respuesta del contacto) → se califican
 *     acá mismo con scoreLead y quedan en /tmp/precalif/rules.json.
 *
 * Uso: npx tsx scripts/precalif-export.ts
 */
import { openDb } from "../src/lib/db-open";
import path from "path";
import fs from "fs";
import { scoreLead } from "../src/lib/score-lead";
import { getRubricConfig } from "../src/lib/score-lead-server";

const rubric = getRubricConfig();

const CRM_DB = path.resolve(process.cwd(), "data/crm.db");
const OUT_DIR = "/tmp/precalif";
const BATCH_SIZE = 25;
const MSGS_PER_CHAT = 25;
const MAX_MSG_CHARS = 280;

type Row = { jid: string; name: string | null; last_message_time: string | null };
type MsgRow = { content: string | null; is_from_me: number; timestamp: string | null; media_type: string | null };

const db = openDb(CRM_DB, { readonly: true });

// Archivados (dismissed) y aprobados quedan FUERA: archivado se queda archivado.
const chats = db.prepare(`
  SELECT jid, name, last_message_time
  FROM wa_chats wc
  WHERE wc.message_count > 0
    AND wc.is_group = 0
    AND wc.jid LIKE '%@s.whatsapp.net'
    AND NOT EXISTS (SELECT 1 FROM lead_candidates ld
                    WHERE ld.chat_jid = wc.jid AND ld.status IN ('dismissed','approved'))
    AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.whatsapp_jid = wc.jid)
  ORDER BY wc.last_message_time DESC
`).all() as Row[];

const getMsgs = db.prepare(`
  SELECT content, is_from_me, timestamp, media_type
  FROM wa_messages WHERE chat_jid = ?
  ORDER BY timestamp DESC LIMIT ${MSGS_PER_CHAT}
`);

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

type AiChat = {
  jid: string;
  name: string | null;
  lastTs: string | null;
  transcript: { who: "YO" | "CONTACTO"; text: string }[];
};
const aiChats: AiChat[] = [];
const rulesResults: unknown[] = [];

for (const chat of chats) {
  const msgs = (getMsgs.all(chat.jid) as MsgRow[]).reverse();
  if (msgs.length === 0) continue;

  const lower = msgs.map((m) => (m.content || "").toLowerCase()).join(" ");
  const pitch = lower.includes("niuro.io") || lower.includes("staff augmentation");
  const contactSpoke = msgs.some((m) => !m.is_from_me && (m.content || "").trim().length > 0);

  if ((contactSpoke && msgs.length >= 2) || pitch) {
    aiChats.push({
      jid: chat.jid,
      name: chat.name,
      lastTs: msgs[msgs.length - 1]?.timestamp ?? chat.last_message_time,
      transcript: msgs.map((m) => ({
        who: m.is_from_me ? ("YO" as const) : ("CONTACTO" as const),
        text: (m.content || `[${m.media_type ?? "media"}]`).slice(0, MAX_MSG_CHARS),
      })),
    });
  } else {
    const r = scoreLead(
      msgs.map((m) => ({
        content: m.content, isFromMe: !!m.is_from_me, timestamp: m.timestamp, mediaType: m.media_type,
      })),
      chat.name,
      { rubric }
    );
    rulesResults.push({
      jid: chat.jid, name: chat.name, lastTs: msgs[msgs.length - 1]?.timestamp ?? null,
      score: r.score, temperature: r.temperature, breakdown: r.breakdown,
      reason: r.reason, recommendation: r.recommendation,
    });
  }
}

let nBatches = 0;
for (let i = 0; i < aiChats.length; i += BATCH_SIZE) {
  fs.writeFileSync(
    path.join(OUT_DIR, `batch-${String(nBatches).padStart(3, "0")}.json`),
    JSON.stringify(aiChats.slice(i, i + BATCH_SIZE), null, 1)
  );
  nBatches++;
}
fs.writeFileSync(path.join(OUT_DIR, "rules.json"), JSON.stringify(rulesResults, null, 1));
// Índice de jids válidos + metadata (lastTs/name) para que el import rechace
// jids alucinados y no dependa de lo que devuelva el agente.
fs.writeFileSync(
  path.join(OUT_DIR, "index.json"),
  JSON.stringify(Object.fromEntries(aiChats.map((c) => [c.jid, { name: c.name, lastTs: c.lastTs }])))
);

console.log(JSON.stringify({
  totalEligible: chats.length,
  aiChats: aiChats.length,
  rulesChats: rulesResults.length,
  batches: nBatches,
  outDir: OUT_DIR,
}));
db.close();
