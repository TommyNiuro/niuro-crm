import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Regresión de 3 bugs reales encontrados corriendo el sync contra datos de
// producción de verdad (no sintéticos): timestamps que llegan como epoch-ms
// numérico en vez de ISO string, un objeto anidado (proposals.client) que
// better-sqlite3 no puede bindear sin serializar, y un campo NOT NULL
// (tasks.createdAt / proposals.generated) ausente de la respuesta remota.
let tmpDbPath: string;
let originalCrmDbPath: string | undefined;

beforeEach(() => {
  tmpDbPath = path.join(os.tmpdir(), `crm-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  originalCrmDbPath = process.env.CRM_DB_PATH;
  process.env.CRM_DB_PATH = tmpDbPath;
  process.env.CRM_SYNC_URL = "http://localhost:9999";
});

afterEach(() => {
  process.env.CRM_DB_PATH = originalCrmDbPath;
  delete process.env.CRM_SYNC_URL;
  vi.unstubAllGlobals();
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      fs.unlinkSync(tmpDbPath + suffix);
    } catch {
      /* ya borrado o nunca existió */
    }
  }
});

describe("runFullSync: casos reales que rompieron contra producción", () => {
  it("sincroniza un contact, un task sin createdAt, y una proposal con timestamp numérico + objeto anidado + campo faltante", async () => {
    const { rawDb } = await import("@/db");
    const { runFullSync } = await import("../crm-sync");

    const remoteData: Record<string, unknown[]> = {
      "/api/contacts": [
        { id: "c1", name: "Ana", email: "ana@x.com", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      "/api/companies": [],
      "/api/deals": [],
      "/api/tickets": [],
      "/api/opportunities": [],
      "/api/activities": [
        { id: "a1", type: "note", description: "hola", contactId: "c1", createdAt: "2026-01-02T00:00:00.000Z" },
      ],
      // sin createdAt (bug real: la ruta remota no lo devuelve para tasks)
      "/api/tasks": [{ id: "t1", contactId: "c1", title: "Llamar", status: "open" }],
      // createdAt/updatedAt como epoch-ms numerico (no ISO string), client
      // como objeto anidado, y "generated" (NOT NULL con default) ausente.
      "/api/proposals": [
        {
          id: "p1",
          mode: "staff-aug",
          status: "draft",
          client: { name: "Acme", country: "Chile" },
          createdAt: 1782174692000,
          updatedAt: 1782174945000,
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        const rows = remoteData[path] ?? [];
        return { ok: true, json: async () => rows } as Response;
      })
    );

    const results = await runFullSync(rawDb);

    expect(results.contacts).toMatchObject({ created: 1, failed: 0 });
    expect(results.activities).toMatchObject({ created: 1, failed: 0 });
    expect(results.tasks).toMatchObject({ created: 1, failed: 0 });
    expect(results.proposals).toMatchObject({ created: 1, failed: 0 });

    const task = rawDb.prepare("SELECT created_at, contact_id FROM tasks WHERE title = 'Llamar'").get() as
      | { created_at: number; contact_id: string }
      | undefined;
    expect(task?.created_at).toBeGreaterThan(0); // fallback a "ahora", no NULL

    const proposal = rawDb.prepare("SELECT client, generated FROM proposals WHERE mode = 'staff-aug'").get() as
      | { client: string; generated: number }
      | undefined;
    expect(JSON.parse(proposal!.client)).toEqual({ name: "Acme", country: "Chile" });
    expect(proposal?.generated).toBe(0); // cayo al DEFAULT local, no NULL

    // La actividad debe apuntar al contacto LOCAL (remapeado), no al id remoto "c1".
    const contactLocalId = (
      rawDb.prepare("SELECT id FROM contacts WHERE email = 'ana@x.com'").get() as { id: string }
    ).id;
    const activity = rawDb.prepare("SELECT contact_id FROM activities WHERE description = 'hola'").get() as {
      contact_id: string;
    };
    expect(activity.contact_id).toBe(contactLocalId);
    expect(activity.contact_id).not.toBe("c1");
  });

  it("una segunda corrida no duplica nada (idempotencia)", async () => {
    const { rawDb } = await import("@/db");
    const { runFullSync } = await import("../crm-sync");

    const remoteData: Record<string, unknown[]> = {
      "/api/contacts": [
        { id: "c1", name: "Ana", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      "/api/companies": [],
      "/api/deals": [],
      "/api/tickets": [],
      "/api/opportunities": [],
      "/api/activities": [],
      "/api/tasks": [],
      "/api/proposals": [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const rows = remoteData[new URL(url).pathname] ?? [];
        return { ok: true, json: async () => rows } as Response;
      })
    );

    await runFullSync(rawDb);
    const second = await runFullSync(rawDb);

    expect(second.contacts).toMatchObject({ created: 0, failed: 0 });
    const count = rawDb.prepare("SELECT COUNT(*) as n FROM contacts").get() as { n: number };
    expect(count.n).toBe(1);
  });
});
