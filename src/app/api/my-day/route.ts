import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, tasks, leadCandidates, groupOpportunities } from "@/db/schema";
import { desc, eq, not } from "drizzle-orm";

// GET /api/my-day — lista única y priorizada de acciones del día.
// Prioridad: tareas vencidas → tareas de hoy → leads calientes sin trabajar
// → oportunidades nuevas del radar → contactos activos sin próximo paso.

export type MyDayItem = {
  id: string;
  kind: "task_overdue" | "task_today" | "hot_lead" | "radar" | "at_risk";
  title: string;
  subtitle: string;
  contactId?: string;
  contactName?: string;
  taskId?: string;
  chatJid?: string;
  href?: string;
  score?: number;
  stage?: string;
  dueAt?: string | null;
};

const WORKING_STAGES = new Set(["Prospecto", "Discovery", "Propuesta", "Perfil", "Entrevistas"]);

export async function GET() {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const activeContacts = db.select().from(contacts).where(not(eq(contacts.archived, true))).all();
  const byId = new Map(activeContacts.map((c) => [c.id, c]));

  const openTasks = db.select().from(tasks).where(eq(tasks.status, "open")).all();
  const openTaskContactIds = new Set(openTasks.map((t) => t.contactId));

  const items: MyDayItem[] = [];

  const taskItem = (t: typeof openTasks[number], kind: "task_overdue" | "task_today"): MyDayItem | null => {
    const c = byId.get(t.contactId);
    if (!c) return null;
    const waJid = c.whatsappJid || (c.phone ? `${c.phone.replace(/\D/g, "")}@s.whatsapp.net` : undefined);
    return {
      id: `task:${t.id}`,
      kind,
      title: t.title,
      subtitle: c.name,
      contactId: c.id,
      contactName: c.name,
      taskId: t.id,
      chatJid: waJid || undefined,
      href: `/contacts/${c.id}`,
      score: c.score,
      stage: c.stage,
      dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : null,
    };
  };

  const scoreOf = (t: typeof openTasks[number]) => byId.get(t.contactId)?.score ?? 0;

  // 1. Tareas vencidas (antes de hoy)
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const overdue = openTasks
    .filter((t) => t.dueAt && new Date(t.dueAt) < startOfToday)
    .sort((a, b) => scoreOf(b) - scoreOf(a));
  for (const t of overdue) {
    const it = taskItem(t, "task_overdue");
    if (it) items.push(it);
  }

  // 2. Tareas de hoy
  const today = openTasks
    .filter((t) => t.dueAt && new Date(t.dueAt) >= startOfToday && new Date(t.dueAt) <= endOfToday)
    .sort((a, b) => scoreOf(b) - scoreOf(a));
  for (const t of today) {
    const it = taskItem(t, "task_today");
    if (it) items.push(it);
  }

  // 3. Leads calientes sin trabajar (top 3 por score)
  const hot = db.select().from(leadCandidates)
    .where(eq(leadCandidates.status, "pending"))
    .orderBy(desc(leadCandidates.score))
    .all()
    .filter((l) => l.temperature === "hot")
    .slice(0, 3);
  for (const l of hot) {
    items.push({
      id: `lead:${l.id}`,
      kind: "hot_lead",
      title: `Lead caliente: ${l.name}`,
      subtitle: l.nextAction || l.reason || "Revisar y aprobar",
      chatJid: l.chatJid,
      href: `/whatsapp/leads`,
      score: l.score,
    });
  }

  // 4. Oportunidades nuevas del radar (top 3 por score)
  const radar = db.select().from(groupOpportunities)
    .where(eq(groupOpportunities.status, "new"))
    .orderBy(desc(groupOpportunities.score))
    .limit(3)
    .all();
  for (const o of radar) {
    items.push({
      id: `radar:${o.id}`,
      kind: "radar",
      title: `${o.role || "Busca talento"}${o.company ? ` · ${o.company}` : ""}`,
      subtitle: `${o.sender || "Alguien"} en ${o.groupName || "un grupo"}`,
      href: "/opportunities",
      score: o.score,
    });
  }

  // 5. Contactos activos sin próximo paso (top 5 por score)
  const atRisk = activeContacts
    .filter((c) => WORKING_STAGES.has(c.stage) && !openTaskContactIds.has(c.id))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5);
  for (const c of atRisk) {
    const waJid = c.whatsappJid || (c.phone ? `${c.phone.replace(/\D/g, "")}@s.whatsapp.net` : undefined);
    items.push({
      id: `risk:${c.id}`,
      kind: "at_risk",
      title: `Definir próximo paso: ${c.name}`,
      subtitle: c.stage,
      contactId: c.id,
      contactName: c.name,
      chatJid: waJid || undefined,
      href: `/contacts/${c.id}`,
      score: c.score,
      stage: c.stage,
    });
  }

  return NextResponse.json({
    items,
    counts: {
      overdue: overdue.length,
      today: today.length,
      hotLeads: hot.length,
      radar: radar.length,
      atRisk: atRisk.length,
    },
  });
}
