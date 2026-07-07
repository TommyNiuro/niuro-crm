import { describe, it, expect, beforeEach, vi } from "vitest";

// deal-sync usa el `db` real. Mockeamos @/db con el harness :memory: sembrado
// con las 7 etapas (mismo patrón que apply-status-change.test.ts).
vi.mock("@/db", async () => {
  const { makeTestDb, seedStages } = await import("./helpers/test-db");
  const h = makeTestDb();
  seedStages(h.db);
  return { db: h.db };
});

import { db } from "@/db";
import { mirrorDealsToContact, syncMoneyFromContact, alignDealStage, stageIdByName } from "../deal-sync";
import { contacts, deals } from "@/db/schema";
import { eq } from "drizzle-orm";

type ContactRow = typeof contacts.$inferSelect;

function makeContact(over: Partial<typeof contacts.$inferInsert> = {}): ContactRow {
  return db
    .insert(contacts)
    .values({ name: "ACME", stage: "Discovery", ...over })
    .returning()
    .get();
}

function getContact(id: string): ContactRow {
  return db.select().from(contacts).where(eq(contacts.id, id)).get()!;
}

function openDeals(contactId: string) {
  return db.select().from(deals).where(eq(deals.contactId, contactId)).all().filter((d) => !d.deletedAt);
}

beforeEach(() => {
  db.delete(deals).run();
  db.delete(contacts).run();
});

describe("syncMoneyFromContact", () => {
  it("crea el deal en la etapa homónima cuando el contacto tiene monto y no tiene deal", () => {
    const c = makeContact({ valueCents: 500_000, probability: 40, company: "ACME Corp" });
    syncMoneyFromContact(c);
    const ds = openDeals(c.id);
    expect(ds).toHaveLength(1);
    expect(ds[0].value).toBe(500_000);
    expect(ds[0].probability).toBe(40);
    expect(ds[0].stageId).toBe(stageIdByName("Discovery"));
    expect(ds[0].title).toContain("ACME Corp");
  });

  it("no crea nada sin monto", () => {
    const c = makeContact({ valueCents: 0 });
    syncMoneyFromContact(c);
    expect(openDeals(c.id)).toHaveLength(0);
  });

  it("con un deal existente hace write-through directo", () => {
    const c = makeContact({ valueCents: 100_000, probability: 20 });
    syncMoneyFromContact(c);
    const updated = { ...c, valueCents: 250_000, probability: 60 };
    syncMoneyFromContact(updated as ContactRow);
    const ds = openDeals(c.id);
    expect(ds).toHaveLength(1);
    expect(ds[0].value).toBe(250_000);
    expect(ds[0].probability).toBe(60);
  });

  it("con varios deals la diferencia va al principal (mayor valor)", () => {
    const c = makeContact({ valueCents: 0 });
    const sid = stageIdByName("Discovery")!;
    db.insert(deals).values({ title: "A", value: 300_000, stageId: sid, contactId: c.id }).run();
    db.insert(deals).values({ title: "B", value: 100_000, stageId: sid, contactId: c.id }).run();
    // total nuevo 500k: el principal (A, 300k) absorbe la diferencia -> 400k
    syncMoneyFromContact({ ...c, valueCents: 500_000, probability: 50 } as ContactRow);
    const ds = openDeals(c.id).sort((a, b) => b.value - a.value);
    expect(ds.map((d) => d.value)).toEqual([400_000, 100_000]);
  });

  it("si el total baja por debajo de la suma de los deals secundarios, reparte proporcional sin perder plata", () => {
    const c = makeContact({ valueCents: 0 });
    const sid = stageIdByName("Discovery")!;
    db.insert(deals).values({ title: "A", value: 300_000, stageId: sid, contactId: c.id }).run();
    db.insert(deals).values({ title: "B", value: 100_000, stageId: sid, contactId: c.id }).run();
    syncMoneyFromContact({ ...c, valueCents: 50_000, probability: 30 } as ContactRow);
    const ds = openDeals(c.id).sort((a, b) => b.value - a.value);
    // 50k repartido proporcional (37.5k + 12.5k); la suma cuadra exacto, nada de clamp a 0
    expect(ds.map((d) => d.value)).toEqual([37_500, 12_500]);
    expect(ds.reduce((a, d) => a + d.value, 0)).toBe(50_000);
  });
});

describe("mirrorDealsToContact", () => {
  it("espeja suma y probabilidad ponderada por valor", () => {
    const c = makeContact();
    const sid = stageIdByName("Propuesta")!;
    db.insert(deals).values({ title: "A", value: 300_000, probability: 80, stageId: sid, contactId: c.id }).run();
    db.insert(deals).values({ title: "B", value: 100_000, probability: 20, stageId: sid, contactId: c.id }).run();
    mirrorDealsToContact(c.id);
    const after = getContact(c.id);
    expect(after.valueCents).toBe(400_000);
    expect(after.probability).toBe(65); // (300k*80 + 100k*20) / 400k
  });

  it("con deals de valor 0 promedia la probabilidad en vez de ponderar por valor", () => {
    const c = makeContact();
    const sid = stageIdByName("Propuesta")!;
    db.insert(deals).values({ title: "A", value: 0, probability: 40, stageId: sid, contactId: c.id }).run();
    db.insert(deals).values({ title: "B", value: 0, probability: 60, stageId: sid, contactId: c.id }).run();
    mirrorDealsToContact(c.id);
    const after = getContact(c.id);
    expect(after.valueCents).toBe(0);
    expect(after.probability).toBe(50); // promedio (40+60)/2, no ponderado por valor
  });

  it("sin deals vivos el espejo queda en cero", () => {
    const c = makeContact({ valueCents: 999, probability: 99 });
    mirrorDealsToContact(c.id);
    const after = getContact(c.id);
    expect(after.valueCents).toBe(0);
    expect(after.probability).toBe(0);
  });
});

describe("alignDealStage", () => {
  it("arrastra los deals vivos a la etapa homónima del contacto", () => {
    const c = makeContact({ valueCents: 100_000 });
    syncMoneyFromContact(c);
    alignDealStage(c.id, "Cierre");
    expect(openDeals(c.id)[0].stageId).toBe(stageIdByName("Cierre"));
  });

  it("con varios deals mueve solo el principal (mayor valor), deja los secundarios", () => {
    const c = makeContact({ valueCents: 0 });
    const disc = stageIdByName("Discovery")!;
    db.insert(deals).values({ title: "A", value: 300_000, stageId: disc, contactId: c.id }).run();
    db.insert(deals).values({ title: "B", value: 100_000, stageId: disc, contactId: c.id }).run();
    alignDealStage(c.id, "Cierre");
    const ds = openDeals(c.id).sort((a, b) => b.value - a.value);
    expect(ds[0].stageId).toBe(stageIdByName("Cierre")); // principal A movido
    expect(ds[1].stageId).toBe(disc); // secundario B intacto
  });

  it("etapa inexistente (huérfana) no toca nada", () => {
    const c = makeContact({ valueCents: 100_000 });
    syncMoneyFromContact(c);
    const before = openDeals(c.id)[0].stageId;
    alignDealStage(c.id, "EtapaQueNoExiste");
    expect(openDeals(c.id)[0].stageId).toBe(before);
  });
});
