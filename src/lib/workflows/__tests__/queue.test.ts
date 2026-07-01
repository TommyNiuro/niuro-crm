import { describe, it, expect, vi } from "vitest";
import Database from "better-sqlite3";

// queue.ts (y engine.ts, que importa) hacen `import { rawDb } from "@/db"`, lo
// que inicializaria la DB real al importar. La mockeamos: los tests inyectan su
// propia DB en memoria en cada llamada, asi el rawDb del modulo nunca se usa.
vi.mock("@/db", () => ({ rawDb: {} }));

import { enqueueJob, drainJobs, type Runner } from "../queue";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE workflows (id TEXT PRIMARY KEY, name TEXT, trigger_type TEXT, steps TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE workflow_jobs (
      id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, trigger_context TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3, run_after INTEGER NOT NULL, locked_at INTEGER,
      last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  db.prepare(`INSERT INTO workflows (id, name, trigger_type, steps) VALUES ('wf1','Test','record_event','[]')`).run();
  return db;
}

const ok: Runner = async () => ({ status: "success", logs: [{ ok: true }] });
const fail: Runner = async () => ({ status: "error", logs: [{ ok: false, detail: "boom" }] });

function job(db: Database.Database, id: string) {
  return db.prepare("SELECT status, attempts, run_after FROM workflow_jobs WHERE id=?").get(id) as
    { status: string; attempts: number; run_after: number };
}
const now = () => Math.floor(Date.now() / 1000);

describe("cola durable de workflows", () => {
  it("un job exitoso queda 'done' en un intento", async () => {
    const db = makeDb();
    const id = enqueueJob("wf1", { x: 1 }, { db });
    const stats = await drainJobs({ db, runner: ok });
    expect(stats).toMatchObject({ ran: 1, done: 1, failed: 0, retried: 0 });
    expect(job(db, id)).toMatchObject({ status: "done", attempts: 1 });
  });

  it("un job que falla reintenta con backoff y termina 'failed' tras max_attempts", async () => {
    const db = makeDb();
    const id = enqueueJob("wf1", {}, { db });
    // intento 1
    let stats = await drainJobs({ db, runner: fail });
    expect(stats).toMatchObject({ ran: 1, retried: 1, failed: 0 });
    const s = job(db, id);
    expect(s.status).toBe("pending");
    expect(s.attempts).toBe(1);
    expect(s.run_after).toBeGreaterThan(now()); // backoff hacia el futuro
    // forzar vencimiento -> intento 2
    db.prepare("UPDATE workflow_jobs SET run_after=? WHERE id=?").run(now(), id);
    await drainJobs({ db, runner: fail });
    expect(job(db, id).attempts).toBe(2);
    // forzar -> intento 3 agota reintentos
    db.prepare("UPDATE workflow_jobs SET run_after=? WHERE id=?").run(now(), id);
    stats = await drainJobs({ db, runner: fail });
    expect(stats).toMatchObject({ failed: 1 });
    expect(job(db, id)).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("reclama un job 'running' colgado (proceso murió a mitad) y lo reprocesa", async () => {
    const db = makeDb();
    const t = now();
    db.prepare(
      `INSERT INTO workflow_jobs (id, workflow_id, trigger_context, status, attempts, max_attempts, run_after, locked_at, created_at, updated_at)
       VALUES ('stuck','wf1','{}','running',1,3,?,?,?,?)`
    ).run(t, t - 600, t, t); // locked_at 10min atrás (> STUCK_SEC)
    const stats = await drainJobs({ db, runner: ok });
    expect(stats).toMatchObject({ ran: 1, done: 1 });
    expect(job(db, "stuck").status).toBe("done");
  });

  it("no procesa un job cuyo run_after está en el futuro", async () => {
    const db = makeDb();
    enqueueJob("wf1", {}, { runAfter: now() + 3600, db });
    const stats = await drainJobs({ db, runner: ok });
    expect(stats).toMatchObject({ ran: 0, done: 0 });
  });
});
