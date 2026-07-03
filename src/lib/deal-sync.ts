import { db } from "@/db";
import { deals, contacts, pipelineStages } from "@/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

/**
 * Sincronización contacto <-> deal (Fase 1, auditoría 2026-07-02).
 *
 * El DEAL es la fuente de verdad del dinero del pipeline. contacts.value_cents
 * y contacts.probability quedan como ESPEJO de lectura: analítica, tarjetas y
 * APIs existentes los siguen leyendo sin cambios. Reglas:
 *
 *  - Editar monto/probabilidad en el contacto baja al deal (write-through);
 *    si no hay deal y hay monto, se crea uno.
 *  - Crear/editar/borrar deals re-espeja el total en el contacto.
 *  - Mover de etapa al contacto arrastra sus deals a la etapa homónima.
 *
 * Todo es server-only (abre la DB) y síncrono: se llama dentro de los handlers
 * de /api/contacts/[id] y /api/deals*.
 */

type ContactRow = typeof contacts.$inferSelect;

function openDealsOf(contactId: string) {
  return db
    .select()
    .from(deals)
    .where(and(eq(deals.contactId, contactId), isNull(deals.deletedAt)))
    .all();
}

/** id de una etapa por nombre dentro de un pipeline (deal.stageId es FK). */
export function stageIdByName(name: string, pipeline = "prospectos"): string | null {
  const row = db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(and(eq(pipelineStages.name, name), eq(pipelineStages.pipeline, pipeline)))
    .get();
  return row?.id ?? null;
}

function firstStageId(pipeline = "prospectos"): string | null {
  const row = db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipeline, pipeline))
    .orderBy(asc(pipelineStages.order))
    .limit(1)
    .get();
  return row?.id ?? null;
}

/** Espeja la suma de deals vivos en el contacto. Sin deals vivos, el espejo es
 *  cero: si el negocio se borró, el contacto no puede seguir mostrando plata. */
export function mirrorDealsToContact(contactId: string): void {
  const open = openDealsOf(contactId);
  const total = open.reduce((a, d) => a + (d.value || 0), 0);
  const prob = !open.length
    ? 0
    : total > 0
      ? Math.round(open.reduce((a, d) => a + (d.value || 0) * (d.probability || 0), 0) / total)
      : Math.round(open.reduce((a, d) => a + (d.probability || 0), 0) / open.length);
  db.update(contacts)
    .set({ valueCents: total, probability: prob, updatedAt: new Date() })
    .where(eq(contacts.id, contactId))
    .run();
}

/** Write-through: el dinero final del contacto baja al deal. Con un deal vivo
 *  es directo; con varios, la diferencia va al principal (el de mayor valor). */
export function syncMoneyFromContact(c: ContactRow): void {
  const open = openDealsOf(c.id);
  const now = new Date();
  if (!open.length) {
    if (!c.valueCents) return; // sin monto no hay negocio que registrar
    const stageId = stageIdByName(c.stage) ?? firstStageId();
    if (!stageId) return; // sin etapas configuradas no se puede crear el deal
    db.insert(deals)
      .values({
        title: `Staff augmentation · ${c.company || c.name}`,
        value: c.valueCents,
        probability: c.probability || 0,
        stageId,
        contactId: c.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return;
  }
  const [principal, ...rest] = [...open].sort((a, b) => (b.value || 0) - (a.value || 0));
  const others = rest.reduce((a, d) => a + (d.value || 0), 0);
  db.update(deals)
    .set({
      value: Math.max(0, (c.valueCents || 0) - others),
      probability: c.probability || 0,
      updatedAt: now,
    })
    .where(eq(deals.id, principal.id))
    .run();
}

/** Alinea los deals vivos con la etapa (por nombre) del contacto. Si la etapa
 *  no existe en el pipeline de prospectos (ej. huérfana), no toca nada. */
export function alignDealStage(contactId: string, stageName: string): void {
  const sid = stageIdByName(stageName);
  if (!sid) return;
  db.update(deals)
    .set({ stageId: sid, updatedAt: new Date() })
    .where(and(eq(deals.contactId, contactId), isNull(deals.deletedAt)))
    .run();
}
