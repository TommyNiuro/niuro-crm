import { describe, it, expect, beforeEach, vi } from "vitest";

// pickCandidates usa el `db` real (contacts + tasks) y getMessages de
// @/lib/whatsapp. Mockeamos ambos: @/db con el harness better-sqlite3
// :memory: (mismo patrón que apply-status-change.test.ts) y getMessages con
// un mock controlable por test.
vi.mock("@/db", async () => {
  const { makeTestDb } = await import("./helpers/test-db");
  const h = makeTestDb();
  return { db: h.db };
});

const getMessagesMock = vi.fn();
vi.mock("@/lib/whatsapp", () => ({ getMessages: (...args: unknown[]) => getMessagesMock(...args) }));

import { db } from "@/db";
import { pickCandidates } from "../task-intel";
import { contacts, tasks } from "@/db/schema";

type Row = Record<string, unknown>;

function makeContact(over: Row = {}): Row {
  return db
    .insert(contacts)
    .values({ name: "Juan Pérez", whatsappJid: "5491111@s.whatsapp.net", contactType: "lead", ...over })
    .returning()
    .get() as Row;
}

// Mensajes con longitud total >= 40 chars por defecto (umbral de transcript.length < 40).
const msgs = (contentList: string[], daysAgo = 1) => {
  const ts = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return contentList.map((content, i) => ({
    id: `m${i}`,
    sender: null,
    content,
    mediaType: null,
    filename: null,
    timestamp: ts,
    isFromMe: false,
  }));
};

beforeEach(() => {
  db.delete(tasks).run();
  db.delete(contacts).run();
  getMessagesMock.mockReset();
});

describe("pickCandidates", () => {
  it("candidato valido: pasa todos los filtros", () => {
    const c = makeContact();
    getMessagesMock.mockReturnValue(msgs(["hola necesito cotizar un desarrollador senior de backend para mi equipo"]));

    const out = pickCandidates();

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(c.id);
    expect(out[0].transcript).toContain("Juan: hola");
  });

  it("filtra por contactType invalido (ni lead ni client)", () => {
    makeContact({ contactType: "engineer" });
    getMessagesMock.mockReturnValue(msgs(["hola necesito cotizar un desarrollador senior de backend"]));

    expect(pickCandidates()).toHaveLength(0);
  });

  it("filtra chats fuera de RECENT_DAYS (mas de 21 dias)", () => {
    makeContact();
    getMessagesMock.mockReturnValue(msgs(["hola necesito cotizar un desarrollador senior de backend"], 30));

    expect(pickCandidates()).toHaveLength(0);
  });

  it("filtra por dedup: ya tiene una tarea IA abierta", () => {
    const c = makeContact();
    db.insert(tasks).values({ contactId: c.id as string, title: "Seguimiento", stepName: "IA", status: "open" }).run();
    getMessagesMock.mockReturnValue(msgs(["hola necesito cotizar un desarrollador senior de backend"]));

    expect(pickCandidates()).toHaveLength(0);
  });

  it("filtra por transcript corto (< 40 chars)", () => {
    makeContact();
    getMessagesMock.mockReturnValue(msgs(["ok"]));

    expect(pickCandidates()).toHaveLength(0);
  });
});
