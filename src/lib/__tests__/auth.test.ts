import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

let tmpDbPath: string;
let originalCrmDbPath: string | undefined;

beforeEach(() => {
  tmpDbPath = path.join(os.tmpdir(), `auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  originalCrmDbPath = process.env.CRM_DB_PATH;
  process.env.CRM_DB_PATH = tmpDbPath;
  const sqlite = new Database(tmpDbPath);
  sqlite.exec(`
    CREATE TABLE crm_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
  `);
  sqlite.close();
});

afterEach(() => {
  process.env.CRM_DB_PATH = originalCrmDbPath;
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      fs.unlinkSync(tmpDbPath + suffix);
    } catch {
      /* ya borrado */
    }
  }
});

describe("hashPassword/verifyPassword", () => {
  it("un password correcto verifica true, uno incorrecto false", async () => {
    const { hashPassword, verifyPassword } = await import("../auth");
    const stored = hashPassword("correcta-123");
    expect(verifyPassword("correcta-123", stored)).toBe(true);
    expect(verifyPassword("incorrecta", stored)).toBe(false);
  });

  it("dos hashes del mismo password son distintos (salt random)", async () => {
    const { hashPassword } = await import("../auth");
    expect(hashPassword("igual")).not.toBe(hashPassword("igual"));
  });
});

describe("cuenta: createAccount/hasAccount/verifyAccountPassword/deleteAccount", () => {
  it("no hay cuenta al inicio, se crea, se verifica, se borra", async () => {
    const { hasAccount, createAccount, verifyAccountPassword, deleteAccount } = await import("../auth");
    expect(hasAccount()).toBe(false);

    createAccount("a@b.com", "password123");
    expect(hasAccount()).toBe(true);
    expect(verifyAccountPassword("password123")).toBe(true);
    expect(verifyAccountPassword("mala")).toBe(false);

    deleteAccount();
    expect(hasAccount()).toBe(false);
  });

  it("createAccount falla si ya existe una cuenta", async () => {
    const { createAccount } = await import("../auth");
    createAccount("a@b.com", "password123");
    expect(() => createAccount("otro@b.com", "otro-pass")).toThrow();
  });
});

describe("sesiones: createSession/verifySessionToken/destroySession", () => {
  it("una sesión recién creada verifica true; un token inventado, false", async () => {
    const { createSession, verifySessionToken } = await import("../auth");
    const token = createSession();
    expect(verifySessionToken(token)).toBe(true);
    expect(verifySessionToken("token-inventado")).toBe(false);
  });

  it("destroySession invalida esa sesión puntual, no rompe con token vacío", async () => {
    const { createSession, verifySessionToken, destroySession } = await import("../auth");
    const token = createSession();
    destroySession(token);
    expect(verifySessionToken(token)).toBe(false);
    expect(() => destroySession(null)).not.toThrow();
    expect(() => destroySession(undefined)).not.toThrow();
  });
});
