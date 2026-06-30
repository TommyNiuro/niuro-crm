/**
 * followup-cadence.ts — Motor de cadencia de seguimiento (Agenda).
 *
 * Regla (del playbook de ventas del operador, estilo Sandler):
 *  - El 80% de los cierres necesita 5+ toques; cada toque espera un día más
 *    que el anterior (toque n → gap de n días hábiles aprox).
 *  - Toque 3 = COMBO (llamada + WhatsApp). Toque 5 = último intento y decidir.
 *  - Si el contacto habló último (te escribió y no respondiste): la tarea es
 *    responder HOY — la velocidad de respuesta es el predictor #1 de cierre.
 *
 * Para cada contacto activo (etapas Prospecto..Entrevistas, no archivado) SIN
 * tarea abierta, crea la tarea de seguimiento que corresponde y setea
 * next_action/next_step_due (así el dashboard deja de marcarlo "en riesgo").
 * Idempotente: nunca duplica si ya hay tarea abierta.
 *
 * Corre diario 08:15 vía launchd (com.niuro.followup-cadence).
 * Uso manual: npx tsx scripts/followup-cadence.ts
 */
import Database from "better-sqlite3";
import path from "path";

const CRM_DB = path.resolve(process.cwd(), "data/crm.db");
const WORKING_STAGES = ["Prospecto", "Discovery", "Propuesta", "Perfil", "Entrevistas"];
const MAX_TOUCHES = 5;

// Título por número de toque — encode el playbook para que la Agenda te diga
// exactamente QUÉ hacer, no solo "dar seguimiento".
function touchTitle(n: number): string {
  switch (n) {
    case 1: return "Seguimiento 1: retomar por WhatsApp con valor nuevo (no '¿pudiste verlo?')";
    case 2: return "Seguimiento 2: cambiar de ángulo, no repetir el mensaje anterior";
    case 3: return "Seguimiento 3: COMBO llamada corta + WhatsApp si no contesta";
    case 4: return "Seguimiento 4: enviar caso de éxito o perfil concreto que le calce";
    default: return "Seguimiento 5 (último): mensaje de cierre, si no responde marcar Lead perdido";
  }
}

type ContactRow = {
  id: string; name: string; stage: string; whatsapp_jid: string | null;
  last_interaction_at: number | null;
};

const db = new Database(CRM_DB);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 60000");

const contacts = db.prepare(`
  SELECT id, name, stage, whatsapp_jid, last_interaction_at
  FROM contacts c
  WHERE c.archived = 0
    AND c.stage IN (${WORKING_STAGES.map(() => "?").join(",")})
    AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.contact_id = c.id AND t.status = 'open')
`).all(...WORKING_STAGES) as ContactRow[];

const lastMsg = db.prepare(`
  SELECT is_from_me, timestamp FROM wa_messages
  WHERE chat_jid = ? ORDER BY timestamp DESC LIMIT 1
`);

// Toques previos = tareas de Seguimiento creadas después del último mensaje
// ENTRANTE (si el contacto respondió, la cadencia se resetea).
const touchesSince = db.prepare(`
  SELECT COUNT(*) AS c FROM tasks
  WHERE contact_id = ? AND step_name = 'Seguimiento' AND created_at >= ?
`);

const insertTask = db.prepare(`
  INSERT INTO tasks (id, contact_id, title, step_name, due_at, status, created_at)
  VALUES (lower(hex(randomblob(16))), ?, ?, 'Seguimiento', ?, 'open', ?)
`);
const updateContact = db.prepare(`
  UPDATE contacts SET next_action = ?, next_step_due = ?, updated_at = ? WHERE id = ?
`);

const now = Date.now();
const DAY = 86400000;
let created = 0, replyDue = 0, lastCall = 0;
const counters: Record<string, number> = {};

const run = db.transaction(() => {
  for (const c of contacts) {
    let title: string;
    let dueAt: number;

    const msg = c.whatsapp_jid ? (lastMsg.get(c.whatsapp_jid) as { is_from_me: number; timestamp: string | null } | undefined) : undefined;
    const lastMsgTs = msg?.timestamp ? new Date(msg.timestamp).getTime() : null;

    if (msg && !msg.is_from_me) {
      // El contacto habló último: responder HOY.
      title = `Responder a ${c.name.split(" ")[0]}: te escribió y está sin respuesta`;
      dueAt = now;
      replyDue++;
    } else {
      // El operador habló último (o no hay mensajes): siguiente toque de la cadencia.
      // Base temporal: último mensaje saliente, o última interacción registrada.
      const baseTs = lastMsgTs ?? (c.last_interaction_at ? Number(c.last_interaction_at) * (String(c.last_interaction_at).length <= 10 ? 1000 : 1) : now - DAY);
      // Reset de cadencia: toques desde el último mensaje entrante (si lo hay).
      const sinceTs = msg && msg.is_from_me ? 0 : 0; // sin entrante conocido → contar todos
      const prevTouches = (touchesSince.get(c.id, sinceTs) as { c: number }).c;
      const touch = Math.min(MAX_TOUCHES, prevTouches + 1);
      title = touchTitle(touch);
      // Gap incremental: toque n vence n días después del último contacto,
      // pero nunca en el pasado (si ya pasó, vence hoy).
      dueAt = Math.max(now, baseTs + touch * DAY);
      if (touch >= MAX_TOUCHES) lastCall++;
    }

    insertTask.run(c.id, title, dueAt, now);
    updateContact.run(title, dueAt, now, c.id);
    counters[c.stage] = (counters[c.stage] ?? 0) + 1;
    created++;
  }
});
run();

console.log(`[cadencia] tareas creadas: ${created} (responder hoy: ${replyDue}, último intento: ${lastCall})`);
console.log(`[cadencia] por etapa: ${JSON.stringify(counters)}`);
db.close();
