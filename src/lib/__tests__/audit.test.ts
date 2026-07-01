import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { unlinkSync } from "fs";

// audit.ts resuelve la DB via dbPath() = process.env.CRM_DB_PATH || ... en cada
// llamada; apuntamos a un archivo temporal antes de importar.
const DB = join(tmpdir(), `audit-test-${randomUUID()}.db`);
process.env.CRM_DB_PATH = DB;

import { appendAudit, verifyAuditChain } from "../audit";

beforeAll(() => {
  const db = new Database(DB);
  db.exec(`CREATE TABLE audit_log (
    id TEXT PRIMARY KEY, ts INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
    object_type TEXT, object_id TEXT, detail TEXT, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
  )`);
  db.close();
});

afterAll(() => {
  try { unlinkSync(DB); } catch { /* best-effort */ }
});

describe("audit hash-chain", () => {
  it("una cadena intacta verifica ok", () => {
    appendAudit({ actor: "a@x", action: "auth.login" });
    appendAudit({ actor: "a@x", action: "auth.password_changed" });
    appendAudit({ actor: "a@x", action: "auth.logout", detail: { ip: "127.0.0.1" } });
    const r = verifyAuditChain();
    expect(r.ok).toBe(true);
    expect(r.count).toBe(3);
  });

  it("detecta tampering: editar una fila rompe la cadena", () => {
    const db = new Database(DB);
    // Cambiar el actor de una fila SIN recomputar su hash: la cadena debe romperse.
    db.prepare("UPDATE audit_log SET actor = 'hacker' WHERE action = 'auth.password_changed'").run();
    db.close();
    const r = verifyAuditChain();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.brokenAt).toBe("string");
  });
});
