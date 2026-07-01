/**
 * Cache in-memory (TTL) de los full-scans de la página de analítica.
 *
 * analytics/page.tsx es force-dynamic y trae varias tablas ENTERAS a memoria en
 * cada request para recalcular KPIs (funnel, win rate, tiempos por etapa). En una
 * instalación con historial largo eso es un scan completo por render. Los números
 * de analítica no necesitan ser al-segundo, así que cacheamos los datasets crudos
 * con un TTL corto. Mismo espíritu que dashboard-cache.ts y _countsCache de
 * whatsapp.ts. (plan de endurecimiento, fase 3.4)
 *
 * Server-only (usa better-sqlite3 via @/db). No importar en Client Components.
 */
import { db } from "@/db";
import { contacts, stepTransitions, leadCandidates, tasks, groupOpportunities } from "@/db/schema";

const TTL_MS = 60_000;

interface AnalyticsData {
  at: number;
  allContacts: (typeof contacts.$inferSelect)[];
  transitions: (typeof stepTransitions.$inferSelect)[];
  allCandidates: Pick<typeof leadCandidates.$inferSelect, "createdAt">[];
  allTasks: Pick<typeof tasks.$inferSelect, "completedAt" | "status">[];
  allOpps: Pick<typeof groupOpportunities.$inferSelect, "status" | "updatedAt">[];
}

let cache: AnalyticsData | null = null;

/** Datasets crudos de analítica, cacheados TTL_MS. La página hace el cómputo. */
export function getAnalyticsData(): AnalyticsData {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache;

  cache = {
    at: now,
    allContacts: db.select().from(contacts).all(),
    transitions: db.select().from(stepTransitions).all(),
    allCandidates: db.select({ createdAt: leadCandidates.createdAt }).from(leadCandidates).all(),
    allTasks: db.select({ completedAt: tasks.completedAt, status: tasks.status }).from(tasks).all(),
    allOpps: db
      .select({ status: groupOpportunities.status, updatedAt: groupOpportunities.updatedAt })
      .from(groupOpportunities)
      .all(),
  };
  return cache;
}
