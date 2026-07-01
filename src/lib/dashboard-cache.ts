/**
 * Cache in-memory de las queries pesadas del home (contacts/leadCandidates/
 * groupOpportunities/tasks completos, sin LIMIT). No llevan LIMIT porque
 * alimentan KPIs agregados (pipeline, win rate, conteos) que necesitan el set
 * completo, no una página — el fix real es TTL corto, no recortar filas.
 * Mismo espíritu que _countsCache en whatsapp.ts. (code-audit hallazgo #3)
 */
import { db } from "@/db";
import { contacts, leadCandidates, groupOpportunities, tasks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

const TTL_MS = 15_000;

interface DashboardData {
  at: number;
  contacts: (typeof contacts.$inferSelect)[];
  pendingCandidates: (typeof leadCandidates.$inferSelect)[];
  newOpportunities: (typeof groupOpportunities.$inferSelect)[];
  openTasks: (typeof tasks.$inferSelect)[];
}

let cache: DashboardData | null = null;

export function getDashboardData(): DashboardData {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache;

  cache = {
    at: now,
    contacts: db.select().from(contacts).all(),
    pendingCandidates: db
      .select()
      .from(leadCandidates)
      .where(eq(leadCandidates.status, "pending"))
      .orderBy(desc(leadCandidates.score))
      .all(),
    newOpportunities: db
      .select()
      .from(groupOpportunities)
      .where(eq(groupOpportunities.status, "new"))
      .orderBy(desc(groupOpportunities.score))
      .all(),
    openTasks: db.select().from(tasks).where(eq(tasks.status, "open")).all(),
  };
  return cache;
}
