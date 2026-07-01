/**
 * categorize-chats.ts — Categoriza todos los chats individuales con Claude o reglas.
 *
 * Modo Claude (default si el CLI está):  npx tsx scripts/categorize-chats.ts
 * Modelo distinto:                       CATEGORIZE_MODEL=claude-haiku-4-5-20251001 npx tsx scripts/categorize-chats.ts
 * Forzar re-proceso:                     npx tsx scripts/categorize-chats.ts --force
 *
 * Usa el subprocess del CLI claude (auth Max, sin API key) vía
 * src/lib/claude-subprocess.ts — semáforo de 2, timeout 60s, modelo central.
 * AI_MAX_CHATS (default 100) limita cuántos chats pasan por IA en una corrida;
 * el resto cae a reglas con aviso visible (protege la cuota en --force).
 */

import { openDb } from "../src/lib/db-open";
import path from "path";
import { existsSync } from "fs";
import { execFileSync } from "child_process";
import { scoreLead } from "../src/lib/score-lead";
import type { ScoreLeadResult } from "../src/lib/score-lead";
import { runClaude, CLAUDE_BIN, DEFAULT_MODEL } from "../src/lib/claude-subprocess";
import { buildLearnedContext } from "../src/lib/learned-examples";
import { getRubricConfig } from "../src/lib/score-lead-server";

const CRM_DB = path.resolve(process.cwd(), "data/crm.db");
const FORCE = process.argv.includes("--force");
const BATCH = 5;
const MSGS_PER_CHAT = 40;
const CATEGORIZE_MODEL = process.env.CATEGORIZE_MODEL || DEFAULT_MODEL;
const AI_MAX_CHATS = Math.max(0, Number(process.env.AI_MAX_CHATS) || 100);

type Row = { jid: string; name: string | null; last_message_time: string | null };
type MsgRow = { content: string | null; is_from_me: number; timestamp: string | null; media_type: string | null };

function claudeAvailable(): boolean {
  // CLAUDE_BIN puede ser ruta absoluta (nvm) o "claude" del PATH
  if (CLAUDE_BIN.includes("/")) return existsSync(CLAUDE_BIN);
  try {
    execFileSync("/bin/sh", ["-c", `command -v "${CLAUDE_BIN}"`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function scoreWithClaude(messages: MsgRow[], chatName: string | null, jid: string, learned = ""): Promise<ScoreLeadResult> {
  const phone = jid.split("@")[0];
  const recent = messages
    .slice(-25)
    .map((m) => `${m.is_from_me ? "YO" : "CONTACTO"}: ${m.content || `[${m.media_type ?? "media"}]`}`)
    .join("\n");

  const prompt = `Analizá esta conversación de WhatsApp. Niuro vende staff augmentation tech en LATAM.
Calificá el lead en 5 dimensiones numéricas y respondé SOLO con JSON válido (sin markdown):

Chat: ${chatName || "+" + phone}
---
${recent}
---

{"intencion":0-35,"autoridad":0-20,"necesidad":0-20,"urgencia":0-15,"presupuesto":0-10,"reason":"frase corta","recommendation":"save|review|discard","disqualifier":"personal|evento|busca-trabajo|null"}

Criterios:
- intencion 35=quiere arrancar ya, 28=pide propuesta/reunión, 18=pide info, 0=nada
- autoridad 20=CEO/CTO/founder, 13=manager/lead, 0=desconocido
- necesidad 20=vacante definida con stack, 13=perfil o stack mencionado, 0=nada
- urgencia 15=urgente/ASAP, 10=este mes, 0=sin plazo
- presupuesto 10=presupuesto claro, 7=ronda/funding, 0=nada
- disqualifier: "personal" si es convo romántica/familiar, "busca-trabajo" si busca empleo, null si es negocio
- SEÑAL CLAVE: si YO mencioné "niuro.io" o mandé el pitch de Niuro (ej: "proveemos más de
  10.000 ingenieros de software senior en LATAM"), la conversación es comercial: trátala
  como prospecto (NUNCA disqualifier "personal") y reflejá la intención del contacto.${learned}`;

  const response = await runClaude(prompt, { model: CATEGORIZE_MODEL });

  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(response); } catch {
    // Fallo visible (auditoría 2026-06-09): un catch mudo dejaba los
    // puntajes en cero sin que nadie lo supiera. Si Claude no devuelve
    // JSON, mejor caer a reglas que guardar un score 0 falso.
    throw new Error(`Claude devolvió no-JSON para ${jid} (${response.slice(0, 120)})`);
  }

  const bd = {
    intencion: Math.min(35, Math.max(0, Number(parsed.intencion) || 0)),
    autoridad: Math.min(20, Math.max(0, Number(parsed.autoridad) || 0)),
    necesidad: Math.min(20, Math.max(0, Number(parsed.necesidad) || 0)),
    urgencia: Math.min(15, Math.max(0, Number(parsed.urgencia) || 0)),
    presupuesto: Math.min(10, Math.max(0, Number(parsed.presupuesto) || 0)),
  };
  const base = bd.intencion + bd.autoridad + bd.necesidad + bd.urgencia + bd.presupuesto;
  const last = messages[messages.length - 1];
  const dsl = last?.timestamp
    ? Math.max(0, Math.floor((Date.now() - new Date(last.timestamp!).getTime()) / 86400000))
    : 999;
  const factor = dsl <= 7 ? 1.0 : dsl <= 21 ? 0.85 : dsl <= 45 ? 0.7 : 0.5;
  const score = Math.min(100, Math.round(base * factor));
  const disqualifier = (parsed.disqualifier as string | null);
  const temperature = disqualifier ? "cold" as const
    : score >= 70 && bd.intencion >= 28 ? "hot" as const
    : score >= 40 ? "warm" as const
    : "cold" as const;

  return {
    score: disqualifier && disqualifier !== "null" ? 0 : score,
    base,
    temperature,
    breakdown: bd,
    signals: {
      companyToken: false, companyTokenText: null, ownerSelling: false,
      ownerSellHits: 0, docsSent: 0, reciprocity: false,
      contactIntent: bd.intencion, daysSinceLast: dsl, recencyFactor: factor,
    },
    reason: (parsed.reason as string) || "Análisis Claude.",
    recommendation: (parsed.recommendation as "save" | "review" | "discard") || "review",
    disqualifier: (!disqualifier || disqualifier === "null") ? null : disqualifier,
    mode: "ai",
  };
}

async function main() {
  const useAI = claudeAvailable();
  console.log(`\nModo: ${useAI ? `Claude (${CATEGORIZE_MODEL})` : "reglas (claude CLI no disponible)"}`);
  if (useAI) console.log(`Binario: ${CLAUDE_BIN} | tope IA: ${AI_MAX_CHATS} chats/corrida\n`);

  const db = openDb(CRM_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 60000");
  db.pragma("synchronous = NORMAL");
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_lc_chat_jid ON lead_candidates(chat_jid)");
  } catch { /* ya existe */ }

  // Scoring que aprende: casos reales ganados/perdidos + calibración numérica
  // (scripts/calibrate-scoring.ts) se inyectan al prompt de cada chat.
  const learned = useAI ? buildLearnedContext(db) : "";
  const rubric = getRubricConfig();
  if (learned) console.log(`Contexto aprendido: ${learned.split("\n").length - 2} líneas de casos reales\n`);

  // Los archivados (status='dismissed') NUNCA se re-procesan, ni con --force:
  // archivado se queda archivado aunque lleguen mensajes nuevos.
  const whereDismissed = `AND NOT EXISTS (
    SELECT 1 FROM lead_candidates ld WHERE ld.chat_jid = wc.jid AND ld.status = 'dismissed')`;
  const whereNew = FORCE
    ? whereDismissed
    : `AND NOT EXISTS (SELECT 1 FROM lead_candidates lc WHERE lc.chat_jid = wc.jid)
       AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.whatsapp_jid = wc.jid)`;

  const chats = db.prepare(`
    SELECT jid, name, last_message_time
    FROM wa_chats wc
    WHERE wc.message_count > 0
      AND wc.is_group = 0
      AND wc.jid LIKE '%@s.whatsapp.net'
      ${whereNew}
    ORDER BY wc.last_message_time DESC
  `).all() as Row[];

  const total = chats.length;
  console.log(`Categorizando ${total} chats${FORCE ? " (--force)" : ""}...\n`);

  if (total === 0) { console.log("Nada por procesar."); db.close(); return; }

  const getMessages = db.prepare(`
    SELECT content, is_from_me, timestamp, media_type
    FROM wa_messages WHERE chat_jid = ?
    ORDER BY timestamp DESC LIMIT ${MSGS_PER_CHAT}
  `);

  const upsert = db.prepare(`
    INSERT INTO lead_candidates (id, name, phone, chat_jid, score, temperature, reason,
      next_action, source, status, last_message_at, created_at, updated_at, breakdown)
    VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, 'whatsapp', 'pending',
      ?, unixepoch('now')*1000, unixepoch('now')*1000, ?)
    ON CONFLICT(chat_jid) DO UPDATE SET
      name=excluded.name, score=excluded.score, temperature=excluded.temperature,
      reason=excluded.reason, next_action=excluded.next_action,
      last_message_at=excluded.last_message_at, updated_at=excluded.updated_at,
      breakdown=excluded.breakdown
  `);

  let saved = 0, errors = 0, aiUsed = 0, aiFallbacks = 0;
  const counters = { hot: 0, warm: 0, cold: 0 };
  let capWarned = false;

  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    try {
      const msgs = (getMessages.all(chat.jid) as MsgRow[]).reverse();
      if (msgs.length === 0) { continue; }

      let result: ScoreLeadResult;
      if (useAI && aiUsed < AI_MAX_CHATS) {
        try {
          result = await scoreWithClaude(msgs, chat.name, chat.jid, learned);
          aiUsed++;
        } catch (err) {
          aiFallbacks++;
          if (aiFallbacks <= 5) console.warn(`\n  [IA→reglas] ${chat.jid}: ${err}`);
          result = scoreLead(msgs.map((m) => ({
            content: m.content, isFromMe: !!m.is_from_me, timestamp: m.timestamp, mediaType: m.media_type,
          })), chat.name, { rubric });
        }
      } else {
        if (useAI && !capWarned && aiUsed >= AI_MAX_CHATS) {
          capWarned = true;
          console.warn(`\n  Tope AI_MAX_CHATS=${AI_MAX_CHATS} alcanzado — el resto va por reglas`);
        }
        result = scoreLead(msgs.map((m) => ({
          content: m.content, isFromMe: !!m.is_from_me, timestamp: m.timestamp, mediaType: m.media_type,
        })), chat.name, { rubric });
      }

      const phone = chat.jid.split("@")[0];
      const lastMsgAt = msgs[msgs.length - 1]?.timestamp
        ? new Date(msgs[msgs.length - 1].timestamp!).getTime() : Date.now();
      const nextAction =
        result.recommendation === "save" ? "Contactar — lead calificado" :
        result.recommendation === "review" ? "Revisar conversación" : null;

      upsert.run(chat.name || `+${phone}`, phone, chat.jid, result.score, result.temperature,
        result.reason, nextAction, lastMsgAt, JSON.stringify(result.breakdown));

      counters[result.temperature]++;
      saved++;
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`  Error en ${chat.jid}: ${e}`);
    }

    if ((i + 1) % BATCH === 0 || i === chats.length - 1) {
      process.stdout.write(
        `  [${i + 1}/${total}] hot=${counters.hot} warm=${counters.warm} cold=${counters.cold} err=${errors}\r`
      );
    }
  }

  const totalDB = (db.prepare("SELECT COUNT(*) AS c FROM lead_candidates").get() as { c: number }).c;
  console.log(`\n\n✓ Listo`);
  console.log(`  Procesados: ${saved}  |  Hot: ${counters.hot}  |  Warm: ${counters.warm}  |  Cold: ${counters.cold}`);
  console.log(`  IA: ${aiUsed} chats  |  Fallback a reglas por error IA: ${aiFallbacks}`);
  console.log(`  Errores:    ${errors}`);
  console.log(`  Total en DB: ${totalDB} lead candidates\n`);
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
