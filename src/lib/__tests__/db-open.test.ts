import { describe, it, expect } from "vitest";
import fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import { migrateToEncryptedIfNeeded } from "../db-open";

// El header "SQLite format 3\0" solo lo tiene una DB en texto plano; una cifrada
// arranca con bytes opacos. Distingue plano de cifrado sin abrir con llave.
const isPlain = (f: string) =>
  fs.readFileSync(f).subarray(0, 16).toString("latin1").startsWith("SQLite format 3");

describe("cifrado en reposo (db-open)", () => {
  it("migra una DB plana a cifrada in-place, borra el backup plano y la protege con llave", () => {
    const p = join(tmpdir(), `dbopen-${randomUUID()}.db`);
    const key = "test-key-xyz-123";

    // DB plana con datos
    const d = new Database(p);
    d.exec("CREATE TABLE t(x TEXT)");
    d.prepare("INSERT INTO t VALUES('secreto-de-cliente')").run();
    d.close();
    expect(isPlain(p)).toBe(true);

    migrateToEncryptedIfNeeded(p, key);

    expect(isPlain(p)).toBe(false); // ahora cifrada
    expect(fs.existsSync(`${p}.plain-bak`)).toBe(false); // backup plano borrado (no dejar datos sin cifrar)

    // lee con la llave correcta
    const d2 = new Database(p);
    d2.pragma(`key = '${key}'`);
    expect((d2.prepare("SELECT x FROM t").get() as { x: string }).x).toBe("secreto-de-cliente");
    d2.close();

    // sin llave, cualquier lectura falla. El handle se cierra igual: en Windows
    // un handle abierto bloquea el rmSync de abajo (EPERM, lo detecto el CI).
    const d3 = new Database(p);
    try {
      expect(() => d3.prepare("SELECT x FROM t").get()).toThrow();
    } finally {
      d3.close();
    }

    fs.rmSync(p, { force: true });
  });

  it("es idempotente: sobre una DB ya cifrada no la toca", () => {
    const p = join(tmpdir(), `dbopen-${randomUUID()}.db`);
    const key = "k2";
    const d = new Database(p);
    d.pragma(`key = '${key}'`); // nace cifrada
    d.exec("CREATE TABLE t(x)");
    d.close();
    expect(isPlain(p)).toBe(false);

    migrateToEncryptedIfNeeded(p, key); // debe detectar que no es plana y no hacer nada

    const d2 = new Database(p);
    d2.pragma(`key = '${key}'`);
    expect(() => d2.prepare("SELECT * FROM t").get()).not.toThrow();
    d2.close();
    fs.rmSync(p, { force: true });
  });
});
