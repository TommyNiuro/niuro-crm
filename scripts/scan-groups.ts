/**
 * scan-groups.ts — Radar de grupos: detecta en los grupos de WhatsApp mensajes
 * donde alguien busca profesionales de software que Niuro puede proveer.
 *
 * Corre cada 5 min vía launchd (com.niuro.group-radar) DESPUÉS de un sync
 * incremental (lo hace el wrapper run-group-radar.sh).
 *
 * Pipeline:
 *  1. Watermark por rowid (`group_radar_last_rowid` en crm_settings) — solo
 *     mensajes nuevos de grupos, no del operador.
 *  2. Prefiltro regex barato: keyword de contratación + keyword tech.
 *  3. UNA llamada a Claude por corrida (batch) que separa demanda real
 *     (alguien contratando) de candidatos buscando empleo y ruido, y genera
 *     el mensaje de contacto sugerido en voz del operador.
 *  4. Inserta en group_opportunities (UNIQUE message_id+chat_jid) y notifica
 *     por macOS si hay oportunidades nuevas.
 *
 * Primera corrida: si no hay watermark, arranca 7 días atrás.
 * Forzar re-escaneo: npx tsx scripts/scan-groups.ts --since-days 14
 */
import Database from "better-sqlite3";
import path from "path";
import { execFileSync } from "child_process";
import { runClaude, DEFAULT_MODEL } from "../src/lib/claude-subprocess";
import { resolveSenderPhone } from "../src/lib/lid";
import { operator } from "../src/lib/operator";

const CRM_DB = path.resolve(process.cwd(), "data/crm.db");
const MAX_AI_MSGS = 30; // tope de mensajes a calificar por corrida
const WATERMARK_KEY = "group_radar_last_rowid";

const sinceIdx = process.argv.indexOf("--since-days");
const SINCE_DAYS = sinceIdx > -1 ? Math.max(1, Number(process.argv[sinceIdx + 1]) || 7) : 7;

// Prefiltro: necesita una señal de CONTRATACIÓN y una señal TECH en el mismo mensaje.
const HIRING_RE = /buscamos|estamos buscando|se busca|buscando (?:un|una|dev|perfil|talento)|necesitamos|se necesita|vacante|we(?:'| a)re hiring|hiring|looking for|se solicita|requerimos|incorporar|open role|oportunidad laboral|te estamos buscando|sumarse a(?:l| nuestro) equipo|join (?:our|the) team|envia(?:r)? (?:tu )?cv|postula/i;
const TECH_RE = /\bdev\b|developer|desarrollador|programador|ingenier[oa]s? de software|software engineer|full ?stack|back ?end|front ?end|flutter|react|node|python|java\b|golang|\.net|angular|vue|devops|\bqa\b|data engineer|data scientist|machine learning|mobile|ios|android|tech lead|\bcto\b|sre\b|netsuite|salesforce/i;

type MsgRow = {
  rowid: number; id: string; chat_jid: string; sender: string | null;
  content: string; timestamp: string | null; group_name: string | null;
};

function notify(msg: string) {
  try {
    execFileSync("/usr/bin/osascript", ["-e",
      `display notification ${JSON.stringify(msg)} with title "Niuro CRM: Radar de grupos"`]);
  } catch { /* sin sesión gráfica */ }
}

async function main() {
  const db = new Database(CRM_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 60000");

  // Watermark: si no existe, arrancar SINCE_DAYS atrás.
  const row = db.prepare("SELECT value FROM crm_settings WHERE key = ?").get(WATERMARK_KEY) as
    { value: string } | undefined;
  let lastRowid: number;
  if (row && sinceIdx === -1) {
    lastRowid = Number(row.value) || 0;
  } else {
    const base = db.prepare(
      `SELECT COALESCE(MIN(rowid), (SELECT COALESCE(MAX(rowid),0) FROM wa_messages)) AS r
       FROM wa_messages WHERE timestamp > datetime('now', ?)`
    ).get(`-${SINCE_DAYS} days`) as { r: number };
    lastRowid = Math.max(0, (base.r || 1) - 1);
    console.log(`[radar] sin watermark o --since-days: arrancando desde rowid ${lastRowid} (${SINCE_DAYS} días)`);
  }

  const maxRowid = (db.prepare("SELECT COALESCE(MAX(rowid),0) AS m FROM wa_messages").get() as { m: number }).m;

  const candidates = db.prepare(`
    SELECT m.rowid AS rowid, m.id, m.chat_jid, m.sender, m.content, m.timestamp,
           c.name AS group_name
    FROM wa_messages m
    LEFT JOIN wa_chats c ON c.jid = m.chat_jid
    WHERE m.rowid > ? AND m.rowid <= ?
      AND m.chat_jid LIKE '%@g.us'
      AND m.is_from_me = 0
      AND m.content IS NOT NULL AND length(m.content) > 30
    ORDER BY m.rowid ASC
  `).all(lastRowid, maxRowid) as MsgRow[];

  const matched = candidates
    .filter((m) => HIRING_RE.test(m.content) && TECH_RE.test(m.content))
    .slice(0, MAX_AI_MSGS);

  console.log(`[radar] ventana rowid ${lastRowid}..${maxRowid}: ${candidates.length} msgs de grupo, ${matched.length} con señal`);

  let inserted = 0;
  if (matched.length > 0) {
    const list = matched.map((m, i) =>
      `#${i} | grupo: ${m.group_name || m.chat_jid} | autor: ${m.sender || "?"}\n${m.content.slice(0, 600)}`
    ).join("\n---\n");

    const prompt = `Sos el radar comercial de ${operator.company} (${operator.pitch}; el operador es ${operator.name}).
Estos son mensajes de GRUPOS de WhatsApp que matchearon keywords de contratación tech. Para cada uno decidí si es una OPORTUNIDAD: alguien (empresa/persona) que está BUSCANDO contratar talento de software — eso Niuro lo puede resolver.

NO son oportunidad: candidatos ofreciéndose o buscando empleo, listas de vacantes de portales/recruiters para candidatos (ej. links de job boards con referral), spam, cursos, eventos.
SÍ son oportunidad: "buscamos dev X", "necesitamos un equipo para...", "alguien conoce un desarrollador...", empresas publicando su propia vacante tech. ${operator.company} lo puede resolver.

Mensajes:
${list}

Respondé SOLO con un array JSON (sin markdown), un elemento por mensaje evaluado COMO OPORTUNIDAD (los que no lo son, omitilos):
[{"i":<índice del mensaje>,"role":"rol buscado","stack":"tecnologías","seniority":"jr/ssr/sr/desconocido","company":"empresa o null","urgency":"alta/media/baja","score":0-100,"summary":"1 frase: qué necesitan","reply":"mensaje corto de WhatsApp en voz de ${operator.name} para ofrecer ayuda: cercano, directo, menciona que en ${operator.company} tenemos ingenieros senior LATAM listos para ese perfil y propone una llamada rápida. Sin emojis excesivos."}]
Si ninguno es oportunidad: []`;

    const response = await runClaude(prompt, { model: DEFAULT_MODEL, timeoutMs: 90_000 });
    let verdicts: { i: number; role?: string; stack?: string; seniority?: string; company?: string | null; urgency?: string; score?: number; summary?: string; reply?: string }[];
    try {
      verdicts = JSON.parse(response);
      if (!Array.isArray(verdicts)) throw new Error("no es array");
    } catch (e) {
      // No avanzar el watermark: la próxima corrida reintenta este lote.
      console.error(`[radar] respuesta IA ilegible (${e}) — se reintenta en la próxima corrida`);
      db.close();
      process.exit(1);
    }

    const ins = db.prepare(`
      INSERT OR IGNORE INTO group_opportunities (id, message_id, chat_jid, group_name,
        sender, sender_phone, message_at, excerpt, role, stack, seniority, company,
        urgency, score, summary, suggested_reply, status, created_at, updated_at)
      VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new',
        unixepoch('now'), unixepoch('now'))
    `);

    for (const v of verdicts) {
      const m = matched[v.i];
      if (!m) continue;
      const senderPhone = resolveSenderPhone(m.sender);
      const r = ins.run(m.id, m.chat_jid, m.group_name, m.sender, senderPhone,
        m.timestamp, m.content.slice(0, 500),
        v.role || null, v.stack || null, v.seniority || null, v.company || null,
        v.urgency || null, Math.min(100, Math.max(0, Number(v.score) || 0)),
        v.summary || null, v.reply || null);
      inserted += r.changes;
    }
  }

  // Watermark: avanzar hasta donde se procesó. Si hubo más matches que el tope,
  // avanzar solo hasta el último procesado para no saltarse mensajes.
  const processedUpTo = matched.length === MAX_AI_MSGS ? matched[matched.length - 1].rowid : maxRowid;
  db.prepare(`INSERT INTO crm_settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(WATERMARK_KEY, String(processedUpTo));

  const pendingNew = (db.prepare("SELECT COUNT(*) AS c FROM group_opportunities WHERE status='new'").get() as { c: number }).c;
  console.log(`[radar] oportunidades nuevas: ${inserted} (pendientes totales: ${pendingNew})`);
  if (inserted > 0) {
    notify(`${inserted} ${inserted === 1 ? "grupo busca" : "grupos buscan"} talento de software. Revisá Radar grupos en el CRM.`);
  }
  db.close();
}

main().catch((e) => { console.error("[radar] error:", e); process.exit(1); });
