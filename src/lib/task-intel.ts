import { db } from "@/db";
import { contacts, tasks, activities } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getMessages } from "@/lib/whatsapp";
import { runClaude, DEFAULT_MODEL } from "@/lib/claude-subprocess";

/**
 * Inteligencia de tareas (Tareas v2, 2026-07-03): lee las conversaciones de
 * WhatsApp de los contactos del pipeline y genera tareas ACCIONABLES con lo
 * que se habló: compromisos del operador, seguimientos pendientes y
 * observaciones. Las tareas quedan con step_name='IA' (badge "IA" en la UI).
 *
 * Control de costo y dedup:
 *  - UNA sola llamada a Claude por corrida, con hasta MAX_CONTACTS
 *    conversaciones batcheadas (mismo patrón que scan-groups).
 *  - Un contacto solo se re-analiza si su chat tiene mensajes NUEVOS
 *    posteriores a la última tarea IA que se le creó, y nunca si todavía
 *    tiene una tarea IA abierta (no apilamos instrucciones).
 *  - Solo chats con actividad en los últimos RECENT_DAYS días.
 */

const MAX_CONTACTS = 10;
const MSGS_PER_CHAT = 20;
const MSG_MAX_CHARS = 220;
const RECENT_DAYS = 21;
export const AI_STEP = "IA";

type Candidate = {
  id: string;
  name: string;
  company: string | null;
  stage: string;
  contactType: string;
  whatsappJid: string;
  lastMsgTs: number;
  transcript: string;
};

type AiTask = { i: number; title: string; dueInDays: number; reason: string };
type AiVerdict = { tasks?: AiTask[]; observations?: { i: number; note: string }[] };

function buildPrompt(cands: Candidate[]): string {
  const convs = cands
    .map(
      (c, i) =>
        `### ${i}\nContacto: ${c.name}${c.company ? ` (${c.company})` : ""} — tipo: ${c.contactType}, etapa: ${c.stage}\nConversación (viejo → nuevo, "YO" es el operador):\n${c.transcript}`
    )
    .join("\n\n");
  return `Sos el asistente de ventas de Niuro (staff augmentation: vendemos ingenieros senior de LATAM). El operador (Tomás) vive en la sección Tareas del CRM: tu trabajo es convertir sus conversaciones de WhatsApp en INSTRUCCIONES concretas para ejecutar.

Para cada conversación numerada, detectá SOLO lo que surge del texto real (no inventes):
- Compromisos que el operador asumió y no cerró ("te mando perfiles", "te confirmo el viernes").
- Cosas que el contacto pidió o quedó esperando.
- Seguimientos naturales (quedó caliente y sin respuesta, propuesta enviada sin feedback).
- Observaciones útiles (señal de presupuesto, objeción, urgencia) como nota, no como tarea.

Reglas de las tareas:
- Título IMPERATIVO, concreto y autosuficiente (max 90 chars), en español. Ej: "Enviar a Marcelo los 2 perfiles de backend que le prometiste" y no "seguimiento".
- Máximo 2 tareas por conversación. Cero si no hay nada accionable real.
- dueInDays: 0 si está esperando respuesta hace días o es urgente, 1-2 para compromisos, 3-5 para seguimiento suave.

Respondé SOLO JSON válido, sin markdown:
{"tasks":[{"i":<índice>,"title":"...","dueInDays":<n>,"reason":"<1 línea de por qué, citando lo hablado>"}],"observations":[{"i":<índice>,"note":"<observación breve>"}]}

${convs}`;
}

/** Contactos con chat cuyo historial tiene mensajes nuevos desde la última
 *  tarea IA (y sin tarea IA abierta). Exportada para el self-check. */
export function pickCandidates(): Candidate[] {
  const rows = db
    .select()
    .from(contacts)
    .where(and(eq(contacts.archived, false), isNull(contacts.deletedAt)))
    .all()
    .filter((c) => c.whatsappJid && (c.contactType === "lead" || c.contactType === "client"));

  const cutoff = Date.now() - RECENT_DAYS * 86_400_000;
  const out: Candidate[] = [];

  for (const c of rows) {
    // Última tarea IA (cualquier estado) y si hay una abierta.
    const lastAi = db
      .select({ createdAt: tasks.createdAt, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.contactId, c.id), eq(tasks.stepName, AI_STEP)))
      .orderBy(desc(tasks.createdAt))
      .limit(1)
      .get();
    if (lastAi?.status === "open") continue; // ya tiene instrucción pendiente

    let msgs;
    try {
      msgs = getMessages({ chatJid: c.whatsappJid!, limit: MSGS_PER_CHAT });
    } catch {
      continue;
    }
    if (!msgs.length) continue;
    const lastTs = new Date(msgs[msgs.length - 1]?.timestamp ?? 0).getTime();
    if (!lastTs || lastTs < cutoff) continue; // chat frío
    if (lastAi && lastTs <= new Date(lastAi.createdAt).getTime()) continue; // nada nuevo

    const transcript = msgs
      .map((m) => {
        const body = (m.content || (m.mediaType ? `[${m.mediaType}]` : "")).slice(0, MSG_MAX_CHARS);
        return body ? `${m.isFromMe ? "YO" : c.name.split(" ")[0]}: ${body}` : null;
      })
      .filter(Boolean)
      .join("\n");
    if (transcript.length < 40) continue; // sin sustancia

    out.push({
      id: c.id,
      name: c.name,
      company: c.company,
      stage: c.stage,
      contactType: c.contactType,
      whatsappJid: c.whatsappJid!,
      lastMsgTs: lastTs,
      transcript,
    });
  }

  // Los chats más recientes primero: son los que exigen acción ya.
  return out.sort((a, b) => b.lastMsgTs - a.lastMsgTs).slice(0, MAX_CONTACTS);
}

export async function generateTasksFromConversations(): Promise<{
  analyzed: number;
  created: number;
  observations: number;
}> {
  const cands = pickCandidates();
  if (!cands.length) return { analyzed: 0, created: 0, observations: 0 };

  const response = await runClaude(buildPrompt(cands), { model: DEFAULT_MODEL, timeoutMs: 120_000 });
  let verdict: AiVerdict;
  try {
    verdict = JSON.parse(response.trim().replace(/^```json?\s*|\s*```$/g, ""));
  } catch {
    throw new Error("La IA no devolvió JSON válido");
  }

  const now = new Date();
  let created = 0;
  let observations = 0;

  db.transaction(() => {
    for (const t of verdict.tasks ?? []) {
      const c = cands[t.i];
      if (!c || !t.title?.trim()) continue;
      const title = t.title.trim().slice(0, 120);
      const due = new Date(now.getTime() + Math.max(0, Math.min(7, Number(t.dueInDays) || 0)) * 86_400_000);
      db.insert(tasks)
        .values({ contactId: c.id, title, stepName: AI_STEP, dueAt: due, status: "open", createdAt: now })
        .run();
      db.insert(activities)
        .values({
          contactId: c.id,
          type: "note",
          description: `Tarea IA creada: ${title}${t.reason ? ` — ${t.reason.slice(0, 200)}` : ""}`,
          createdAt: now,
        })
        .run();
      // Próximo paso del contacto: solo si no tiene uno que venza antes.
      const cur = db.select({ nextStepDue: contacts.nextStepDue }).from(contacts).where(eq(contacts.id, c.id)).get();
      if (!cur?.nextStepDue || new Date(cur.nextStepDue) > due) {
        db.update(contacts).set({ nextAction: title, nextStepDue: due, updatedAt: now }).where(eq(contacts.id, c.id)).run();
      }
      created++;
    }
    for (const o of verdict.observations ?? []) {
      const c = cands[o.i];
      if (!c || !o.note?.trim()) continue;
      db.insert(activities)
        .values({ contactId: c.id, type: "note", description: `Observación IA: ${o.note.trim().slice(0, 300)}`, createdAt: now })
        .run();
      observations++;
    }
  });

  return { analyzed: cands.length, created, observations };
}
