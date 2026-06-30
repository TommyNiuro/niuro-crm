import { describe, it, expect, beforeEach, vi } from "vitest";

// applyStatusChange usa el `db` real (transaccion + mueve pipeline). Mockeamos
// @/db con un better-sqlite3 :memory: (helper test-db). La factory crea UNA db
// por archivo, sembrada con las 7 etapas; limpiamos las tablas mutables en cada
// test para aislar.
vi.mock("@/db", async () => {
  const { makeTestDb, seedStages } = await import("./helpers/test-db");
  const h = makeTestDb();
  seedStages(h.db);
  return { db: h.db };
});

import { db } from "@/db";
import { applyStatusChange } from "../proposals";
import {
  contacts,
  deals,
  proposals,
  stepTransitions,
  activities,
  pipelineStages,
} from "@/db/schema";
import { eq } from "drizzle-orm";

type Row = Record<string, unknown>;

function makeContact(stage = "Discovery"): Row {
  return db.insert(contacts).values({ name: "ACME", stage }).returning().get() as Row;
}

function makeProposal(over: Row = {}): Row {
  return db
    .insert(proposals)
    .values({ mode: "staff-aug", client: '{"name":"ACME"}', ...over })
    .returning()
    .get() as Row;
}

function getContact(id: string): Row {
  return db.select().from(contacts).where(eq(contacts.id, id)).get() as Row;
}

function transitionsFor(contactId: string): Row[] {
  return db
    .select()
    .from(stepTransitions)
    .where(eq(stepTransitions.contactId, contactId))
    .all() as Row[];
}

beforeEach(() => {
  // Limpiar tablas mutables (las etapas quedan).
  db.delete(activities).run();
  db.delete(stepTransitions).run();
  db.delete(proposals).run();
  db.delete(deals).run();
  db.delete(contacts).run();
});

describe("applyStatusChange — movimiento de pipeline", () => {
  it("sent: avanza el contacto a 'Propuesta' y registra step_transition", () => {
    const c = makeContact("Discovery"); // order 1
    const p = makeProposal({ contactId: c.id });
    const r = applyStatusChange(p as never, "sent");

    expect(getContact(c.id as string).stage).toBe("Propuesta");
    expect(transitionsFor(c.id as string)).toHaveLength(1);
    expect(transitionsFor(c.id as string)[0].toStep).toBe("Propuesta");
    expect(r.pipeline).toMatchObject({ moved: true, type: "sent", toStage: "Propuesta" });
    expect(r.proposal.status).toBe("sent");
    expect(r.proposal.sentAt).not.toBeNull();
  });

  it("sent: NUNCA retrocede un contacto que ya esta mas adelante", () => {
    const c = makeContact("Entrevistas"); // order 4 > Propuesta (2)
    const p = makeProposal({ contactId: c.id });
    applyStatusChange(p as never, "sent");

    // No se mueve hacia atras ni se registra transicion.
    expect(getContact(c.id as string).stage).toBe("Entrevistas");
    expect(transitionsFor(c.id as string)).toHaveLength(0);
  });

  it("signed: mueve el contacto a la etapa ganada (isWon) y registra actividad", () => {
    const c = makeContact("Propuesta");
    const p = makeProposal({ contactId: c.id });
    const r = applyStatusChange(p as never, "signed");

    expect(getContact(c.id as string).stage).toBe("Cierre");
    expect(getContact(c.id as string).archived).toBe(false);
    expect(r.pipeline).toMatchObject({ moved: true, type: "signed", toStage: "Cierre" });
    const acts = db.select().from(activities).where(eq(activities.contactId, c.id as string)).all();
    expect(acts.length).toBe(1);
  });

  it("lost: archiva el contacto (no hay etapa isLost) + transicion a 'Perdidos'", () => {
    const c = makeContact("Discovery");
    const p = makeProposal({ contactId: c.id });
    const r = applyStatusChange(p as never, "lost");

    expect(getContact(c.id as string).archived).toBe(true);
    expect(transitionsFor(c.id as string)[0].toStep).toBe("Perdidos");
    expect(r.pipeline).toMatchObject({ moved: true, type: "lost", archived: true, toStage: null });
  });

  it("propuesta sin contacto ni deal: no mueve pipeline", () => {
    const p = makeProposal({ contactId: null, dealId: null });
    const r = applyStatusChange(p as never, "sent");
    expect(r.pipeline).toMatchObject({ moved: false });
    expect(r.proposal.status).toBe("sent");
  });

  it("status intermedio (negotiation): cambia status sin tocar el pipeline", () => {
    const c = makeContact("Discovery");
    const p = makeProposal({ contactId: c.id });
    const r = applyStatusChange(p as never, "negotiation");
    expect(r.pipeline).toMatchObject({ moved: false });
    expect(getContact(c.id as string).stage).toBe("Discovery");
    expect(r.proposal.status).toBe("negotiation");
  });

  it("resuelve el contacto via el deal ligado cuando contactId es null", () => {
    const c = makeContact("Discovery");
    const stage = db.select().from(pipelineStages).where(eq(pipelineStages.name, "Discovery")).get() as Row;
    const d = db
      .insert(deals)
      .values({ title: "ACME", contactId: c.id as string, stageId: stage.id as string })
      .returning()
      .get() as Row;
    const p = makeProposal({ contactId: null, dealId: d.id });
    applyStatusChange(p as never, "signed");
    expect(getContact(c.id as string).stage).toBe("Cierre");
  });

  it("signed: si el contacto ya esta en Cierre, no genera nuevas transiciones pero si registra la activity", () => {
    // El contacto ya estaba en la etapa ganada: no debe moverse ni dejar
    // step_transition extra. La activity de "negocio ganado" si se registra.
    const c = makeContact("Cierre");
    const p = makeProposal({ contactId: c.id });
    const r = applyStatusChange(p as never, "signed");

    expect(getContact(c.id as string).stage).toBe("Cierre");
    // Sin transiciones nuevas porque el contacto ya estaba ahi.
    expect(transitionsFor(c.id as string)).toHaveLength(0);
    // La activity se registra igual.
    const acts = db.select().from(activities).where(eq(activities.contactId, c.id as string)).all();
    expect(acts.length).toBeGreaterThanOrEqual(1);
    expect(r.pipeline).toMatchObject({ type: "signed" });
  });

  it("sent: actualiza el stageId del deal al target cuando hay deal ligado", () => {
    const c = makeContact("Discovery");
    const discoveryStage = db.select().from(pipelineStages).where(eq(pipelineStages.name, "Discovery")).get() as Row;
    const d = db
      .insert(deals)
      .values({ title: "Deal ACME", contactId: c.id as string, stageId: discoveryStage.id as string })
      .returning()
      .get() as Row;
    const p = makeProposal({ contactId: c.id, dealId: d.id });

    applyStatusChange(p as never, "sent");

    // El deal debe haber sido movido a la etapa "Propuesta" (o la target de sent).
    const updatedDeal = db.select().from(deals).where(eq(deals.id, d.id as string)).get() as Row;
    const propuestaStage = db.select().from(pipelineStages).where(eq(pipelineStages.name, "Propuesta")).get() as Row;
    expect(updatedDeal.stageId).toBe(propuestaStage.id);
  });

  it("sent: fallback por order cuando ninguna etapa matchea los nombres conocidos", () => {
    // Borramos todas las etapas y creamos un pipeline sin el nombre "Propuesta".
    // applyStatusChange debe caer al fallback por order >= 2.
    db.delete(stepTransitions).run();
    db.delete(activities).run();
    db.delete(deals).run();
    db.delete(contacts).run();
    db.delete(pipelineStages).run();

    // Etapas con nombres distintos a los del playbook de Niuro.
    const stages = [
      { name: "Inicio", order: 0, isWon: false, isLost: false },
      { name: "Avance", order: 1, isWon: false, isLost: false },
      { name: "Cierre Custom", order: 2, isWon: false, isLost: false },
    ];
    for (const s of stages) {
      db.insert(pipelineStages).values(s).run();
    }
    const c = db.insert(contacts).values({ name: "Test", stage: "Inicio" }).returning().get() as Row;
    const p = makeProposal({ contactId: c.id });

    const r = applyStatusChange(p as never, "sent");

    // Debe haber avanzado al fallback (order >= 2 = "Cierre Custom").
    expect(getContact(c.id as string).stage).toBe("Cierre Custom");
    expect(r.pipeline).toMatchObject({ moved: true, type: "sent", toStage: "Cierre Custom" });
  });
});
