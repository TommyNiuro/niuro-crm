/**
 * enrich-names.ts — Extrae con IA los nombres de los chats sin nombre.
 *
 * Para los chats individuales cuyo "nombre" es el puro número (desconocidos
 * que no están en whatsmeow_contacts), lee los primeros mensajes de la
 * conversación y le pide a Claude el nombre SOLO si el contacto se presentó
 * ("soy Karen de X", firma, etc.). Actualiza wa_chats.name con
 * "Nombre Empresa" (la convención de el operador). El sync ya no pisa nombres:
 * preserva el existente cuando el del bridge viene vacío o es el número.
 *
 * Uso:  npx tsx scripts/enrich-names.ts            (todos los pendientes)
 *       MAX_BATCHES=3 npx tsx scripts/enrich-names.ts  (limitar corrida)
 */
import { openDb } from "../src/lib/db-open";
import path from "path";
import { runClaude, DEFAULT_MODEL } from "../src/lib/claude-subprocess";
import { operator } from "../src/lib/operator";

const CRM_DB = path.resolve(process.cwd(), "data/crm.db");
const BATCH = 40;
const MAX_BATCHES = Math.max(1, Number(process.env.MAX_BATCHES) || 99);

type Chat = { jid: string };
type Msg = { content: string | null; is_from_me: number };

const db = openDb(CRM_DB);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 60000");

// Sin nombre = name es el número del jid, o NULL/vacío.
const chats = db.prepare(`
  SELECT jid FROM wa_chats
  WHERE is_group = 0 AND jid LIKE '%@s.whatsapp.net'
    AND (name IS NULL OR name = '' OR name = replace(jid, '@s.whatsapp.net', ''))
    AND EXISTS (SELECT 1 FROM wa_messages m
                WHERE m.chat_jid = wa_chats.jid AND m.is_from_me = 0
                  AND m.content IS NOT NULL AND length(m.content) > 5)
`).all() as Chat[];

// Mensajes con más probabilidad de contener el nombre: presentaciones y los
// primeros de la conversación.
const getMsgs = db.prepare(`
  SELECT content, is_from_me FROM (
    SELECT content, is_from_me, timestamp,
      CASE WHEN is_from_me = 0 AND (
        lower(content) LIKE '%soy %' OR lower(content) LIKE '%me llamo%'
        OR lower(content) LIKE '%mi nombre%' OR lower(content) LIKE '%habla %'
        OR lower(content) LIKE '%saludos%' OR lower(content) LIKE '%atte%'
      ) THEN 0 ELSE 1 END AS pri
    FROM wa_messages
    WHERE chat_jid = ? AND content IS NOT NULL AND length(content) > 5
    ORDER BY pri ASC, timestamp ASC
    LIMIT 8
  ) ORDER BY timestamp ASC
`);

const update = db.prepare("UPDATE wa_chats SET name = ? WHERE jid = ?");

async function main() {
  console.log(`[nombres] ${chats.length} chats sin nombre con conversación`);
  let named = 0, batches = 0;

  for (let i = 0; i < chats.length && batches < MAX_BATCHES; i += BATCH) {
    const slice = chats.slice(i, i + BATCH);
    batches++;
    const blocks = slice.map((c, idx) => {
      const msgs = getMsgs.all(c.jid) as Msg[];
      const lines = msgs
        .map((m) => `${m.is_from_me ? "YO" : "CONTACTO"}: ${(m.content || "").slice(0, 150)}`)
        .join("\n");
      return `#${idx} (+${c.jid.split("@")[0]})\n${lines}`;
    }).join("\n---\n");

    const prompt = `Estos son fragmentos de chats de WhatsApp de ${operator.name} (YO, de ${operator.company}). Los contactos no están guardados. Extraé el NOMBRE del CONTACTO solo si él mismo se presenta, firma, o YO lo llamo por su nombre. Si menciona su empresa/proyecto, inclúyela.

REGLAS:
- NUNCA inventes ni deduzcas. Sin presentación explícita → omitir el chat.
- El nombre debe ser del CONTACTO (no de ${operator.name}, no de terceros mencionados).
- Formato del nombre: "Nombre Apellido EMPRESA" (empresa en mayúsculas si la hay, ej: "Nico Chacon NEAT PAGOS"), o solo "Nombre" si no hay más.

Chats:
${blocks}

Respondé SOLO con un array JSON (sin markdown), un elemento por chat donde detectaste nombre:
[{"i":<índice>,"name":"..."}]
Si en ninguno: []`;

    try {
      const response = await runClaude(prompt, { model: DEFAULT_MODEL, timeoutMs: 90_000 });
      const results = JSON.parse(response) as { i: number; name?: string }[];
      if (!Array.isArray(results)) throw new Error("no es array");
      for (const r of results) {
        const chat = slice[r.i];
        const name = (r.name || "").trim();
        // Sanidad: nombre real, no números, longitud razonable
        if (!chat || !name || name.length < 3 || name.length > 60 || /^\d+$/.test(name)) continue;
        update.run(name, chat.jid);
        named++;
      }
      console.log(`[nombres] lote ${batches}: ${results.length} detectados (acum: ${named})`);
    } catch (e) {
      console.warn(`[nombres] lote ${batches} falló: ${e}`);
    }
  }

  const remaining = (db.prepare(`
    SELECT COUNT(*) AS c FROM wa_chats
    WHERE is_group = 0 AND jid LIKE '%@s.whatsapp.net'
      AND (name IS NULL OR name = '' OR name = replace(jid, '@s.whatsapp.net', ''))
  `).get() as { c: number }).c;
  console.log(`\n[nombres] ✓ ${named} chats renombrados | aún sin nombre: ${remaining}`);
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
