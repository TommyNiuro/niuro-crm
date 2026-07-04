import type { prospects } from "@/db/schema";

/** Serializa un prospecto para el record-view: booleans reales y fechas en ms. */
export function serializeProspect(row: typeof prospects.$inferSelect) {
  const ms = (d: Date | number | null) => (d instanceof Date ? d.getTime() : d);
  return {
    ...row,
    remote: !!row.remote,
    isOpen: !!row.isOpen,
    firstSeenAt: ms(row.firstSeenAt),
    lastSeenAt: ms(row.lastSeenAt),
    oldestJobAt: ms(row.oldestJobAt),
    apolloEnrichedAt: ms(row.apolloEnrichedAt),
    snoozedUntil: ms(row.snoozedUntil),
    createdAt: ms(row.createdAt),
    updatedAt: ms(row.updatedAt),
  };
}
