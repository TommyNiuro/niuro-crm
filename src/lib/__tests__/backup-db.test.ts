import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";
import { selectBackupsToDelete } from "../../../scripts/backup-db";
import { openDb } from "../db-open";

describe("selectBackupsToDelete (rotación de backups)", () => {
  it("con menos archivos que keep, no borra nada", () => {
    const files = [
      { name: "crm-1.db.gz", mtime: 100 },
      { name: "crm-2.db.gz", mtime: 200 },
    ];
    expect(selectBackupsToDelete(files, 14)).toEqual([]);
  });

  it("con exactamente keep archivos, no borra nada", () => {
    const files = [
      { name: "crm-1.db.gz", mtime: 100 },
      { name: "crm-2.db.gz", mtime: 200 },
      { name: "crm-3.db.gz", mtime: 300 },
    ];
    expect(selectBackupsToDelete(files, 3)).toEqual([]);
  });

  it("con más archivos que keep, borra los más viejos y conserva los más nuevos", () => {
    const files = [
      { name: "crm-viejo1.db.gz", mtime: 100 },
      { name: "crm-viejo2.db.gz", mtime: 150 },
      { name: "crm-nuevo1.db.gz", mtime: 300 },
      { name: "crm-nuevo2.db.gz", mtime: 250 },
      { name: "crm-nuevo3.db.gz", mtime: 200 },
    ];
    const toDelete = selectBackupsToDelete(files, 3);
    expect(toDelete.sort()).toEqual(["crm-viejo1.db.gz", "crm-viejo2.db.gz"].sort());
  });
});

describe("checkpoint + copia + integrity_check (integración liviana)", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-db-test-"));
  const src = path.join(tmpDir, "test.db");
  const out = path.join(tmpDir, "test-backup.db");

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("produce una copia SQLite válida y legible tras checkpoint + integrity_check", () => {
    // Crear una DB de prueba (NO data/crm.db) y escribirle algo.
    const db = new Database(src);
    db.pragma("journal_mode = WAL");
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run("hola");

    // Misma lógica que backup-db.ts: checkpoint + copia cruda de bytes.
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    fs.copyFileSync(src, out);

    // Verificación de integridad, igual que el script.
    const check = openDb(out, { readonly: true });
    const ok = (check.pragma("integrity_check", { simple: true }) as unknown) === "ok";
    expect(ok).toBe(true);

    // Y que el dato escrito sobrevive en la copia.
    const row = check.prepare("SELECT v FROM t WHERE id = 1").get() as { v: string };
    expect(row.v).toBe("hola");
    check.close();
  });
});
