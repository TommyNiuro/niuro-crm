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
import { openDb } from "./db-open";
import { dbPath } from "./paths";

const TTL_MS = 60_000;

interface AnalyticsData {
  at: number;
  allContacts: (typeof contacts.$inferSelect)[];
  transitions: (typeof stepTransitions.$inferSelect)[];
  allCandidates: Pick<typeof leadCandidates.$inferSelect, "createdAt">[];
  allTasks: Pick<typeof tasks.$inferSelect, "completedAt" | "status">[];
  allOpps: Pick<typeof groupOpportunities.$inferSelect, "status" | "updatedAt">[];
  /** Mediana en minutos de la primera respuesta nuestra a un mensaje entrante (30d). null sin datos. */
  medianResponseMinutes: number | null;
}

/** Mediana de minutos entrante->respuesta nuestra por chat, últimos 30 días.
 * SQL crudo sobre wa_messages (tabla fuera de Drizzle, la crea el sync). */
function medianResponseMinutes(): number | null {
  let conn: ReturnType<typeof openDb> | null = null;
  try {
    conn = openDb(dbPath(), { readonly: true });
    const rows = conn.prepare(
      `SELECT mins FROM (
         SELECT m.is_from_me,
                LEAD(m.is_from_me) OVER w AS nf,
                CAST((julianday(LEAD(m.timestamp) OVER w) - julianday(m.timestamp)) * 1440 AS INTEGER) AS mins
         FROM wa_messages m
         WHERE m.timestamp >= datetime('now', '-30 days')
         WINDOW w AS (PARTITION BY m.chat_jid ORDER BY m.timestamp)
       )
       WHERE is_from_me = 0 AND nf = 1 AND mins BETWEEN 0 AND 4320
       ORDER BY mins`
    ).pluck().all() as number[];
    if (!rows.length) return null;
    return rows[Math.floor(rows.length / 2)];
  } catch {
    return null; // instalación sin sync todavía: sin la tabla o vacía
  } finally {
    conn?.close();
  }
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
    medianResponseMinutes: medianResponseMinutes(),
  };
  return cache;
}
