import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";

// readSettings/writeSettings resuelven la ruta de DB en cada llamada via
// CRM_DB_PATH: apuntamos esa env a un archivo temporal por test (better-sqlite3
// no comparte ":memory:" entre conexiones nuevas, así que hace falta un archivo real).
let tmpDbPath: string;
let originalCrmDbPath: string | undefined;

beforeEach(() => {
  tmpDbPath = path.join(os.tmpdir(), `settings-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  originalCrmDbPath = process.env.CRM_DB_PATH;
  process.env.CRM_DB_PATH = tmpDbPath;
  const sqlite = new Database(tmpDbPath);
  sqlite.exec(`CREATE TABLE crm_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  sqlite.close();
});

afterEach(() => {
  process.env.CRM_DB_PATH = originalCrmDbPath;
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      fs.unlinkSync(tmpDbPath + suffix);
    } catch {
      /* ya borrado o nunca existió */
    }
  }
});

describe("settings.ts: readSettings/writeSettings roundtrip", () => {
  it("escribe y lee de vuelta las mismas claves", async () => {
    const { readSettings, writeSettings } = await import("../settings");
    writeSettings({ operator_name: "Tomás", company_name: "Niuro" });
    expect(readSettings(["operator_name", "company_name", "no_existe"])).toEqual({
      operator_name: "Tomás",
      company_name: "Niuro",
    });
  });

  it("writeSettings hace upsert (la segunda escritura gana)", async () => {
    const { readSettings, writeSettings } = await import("../settings");
    writeSettings({ k: "v1" });
    writeSettings({ k: "v2" });
    expect(readSettings(["k"])).toEqual({ k: "v2" });
  });

  it("readSettings devuelve vacío (no revienta) si la DB no existe", async () => {
    const { readSettings } = await import("../settings");
    process.env.CRM_DB_PATH = path.join(os.tmpdir(), "nunca-existe-xyz-123.db");
    expect(readSettings(["cualquier_key"])).toEqual({});
  });
});

describe("operator.ts: getOperator (crm_settings > default)", () => {
  it("cae al default genérico si crm_settings está vacío", async () => {
    const { getOperator } = await import("../operator");
    expect(getOperator().name).toBe("Operador");
    expect(getOperator().company).toBe("Tu Empresa");
  });

  it("usa el valor de crm_settings cuando el onboarding ya lo seteó", async () => {
    const { writeSettings } = await import("../settings");
    const { getOperator } = await import("../operator");
    writeSettings({ operator_name: "Tomás", company_name: "Niuro" });
    const op = getOperator();
    expect(op.name).toBe("Tomás");
    expect(op.company).toBe("Niuro");
  });
});

describe("Motor EAV: object_metadata + field_metadata + custom_records + custom_field_values", () => {
  function makeEavDb(): Database.Database {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE object_metadata (
        id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, label_singular TEXT,
        label_plural TEXT, icon TEXT, is_custom INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
      );
      CREATE TABLE field_metadata (
        id TEXT PRIMARY KEY, object_name TEXT NOT NULL, name TEXT NOT NULL,
        label TEXT, type TEXT NOT NULL, options TEXT,
        is_custom INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, UNIQUE(object_name, name)
      );
      CREATE TABLE custom_records (
        id TEXT PRIMARY KEY, object_name TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE custom_field_values (
        object_name TEXT NOT NULL, record_id TEXT NOT NULL, field_id TEXT NOT NULL,
        value TEXT, PRIMARY KEY(object_name, record_id, field_id)
      );
    `);
    return db;
  }

  it("crea un objeto custom, le agrega un campo, crea un registro y setea/lee un valor", () => {
    const db = makeEavDb();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO object_metadata (id, name, label_singular, label_plural, is_custom, created_at) VALUES (?, ?, ?, ?, 1, ?)`
    ).run("obj1", "vendors", "Proveedor", "Proveedores", now);

    db.prepare(
      `INSERT INTO field_metadata (id, object_name, name, label, type, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run("f1", "vendors", "contact_email", "Email de contacto", "text", now);

    db.prepare(`INSERT INTO custom_records (id, object_name, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(
      "rec1",
      "vendors",
      now,
      now
    );

    db.prepare(`INSERT INTO custom_field_values (object_name, record_id, field_id, value) VALUES (?, ?, ?, ?)`).run(
      "vendors",
      "rec1",
      "f1",
      "proveedor@ejemplo.com"
    );

    const value = db
      .prepare(`SELECT value FROM custom_field_values WHERE object_name = ? AND record_id = ? AND field_id = ?`)
      .get("vendors", "rec1", "f1") as { value: string } | undefined;
    expect(value?.value).toBe("proveedor@ejemplo.com");

    const obj = db.prepare(`SELECT * FROM object_metadata WHERE name = ?`).get("vendors") as
      | { is_custom: number }
      | undefined;
    expect(obj?.is_custom).toBe(1);

    db.close();
  });

  it("un segundo campo con el mismo nombre en el mismo objeto viola el UNIQUE(object_name, name)", () => {
    const db = makeEavDb();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO field_metadata (id, object_name, name, type, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      "f1",
      "vendors",
      "email",
      "text",
      now
    );
    expect(() =>
      db
        .prepare(`INSERT INTO field_metadata (id, object_name, name, type, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run("f2", "vendors", "email", "text", now)
    ).toThrow();
    db.close();
  });

  it("custom_field_values respeta su PK compuesta: un segundo set del mismo campo/registro requiere upsert explícito", () => {
    const db = makeEavDb();
    db.prepare(`INSERT INTO custom_field_values (object_name, record_id, field_id, value) VALUES (?, ?, ?, ?)`).run(
      "vendors",
      "rec1",
      "f1",
      "v1"
    );
    expect(() =>
      db
        .prepare(`INSERT INTO custom_field_values (object_name, record_id, field_id, value) VALUES (?, ?, ?, ?)`)
        .run("vendors", "rec1", "f1", "v2")
    ).toThrow();
    db.prepare(`INSERT OR REPLACE INTO custom_field_values (object_name, record_id, field_id, value) VALUES (?, ?, ?, ?)`).run(
      "vendors",
      "rec1",
      "f1",
      "v2"
    );
    const row = db
      .prepare(`SELECT value FROM custom_field_values WHERE object_name = ? AND record_id = ? AND field_id = ?`)
      .get("vendors", "rec1", "f1") as { value: string };
    expect(row.value).toBe("v2");
    db.close();
  });
});
