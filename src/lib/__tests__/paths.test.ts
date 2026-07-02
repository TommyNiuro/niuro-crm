import { describe, it, expect, afterEach } from "vitest";
import path from "path";
import { dataDir, dbPath, uploadsDir, recoveryDir } from "../paths";

const ENV_KEYS = ["CRM_DATA_DIR", "CRM_DB_PATH"] as const;

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("resolución de paths de datos", () => {
  it("por defecto cae en <cwd>/data (comportamiento dev/local)", () => {
    const base = path.join(process.cwd(), "data");
    expect(dataDir()).toBe(base);
    expect(dbPath()).toBe(path.join(base, "crm.db"));
    expect(uploadsDir()).toBe(path.join(base, "uploads"));
    expect(recoveryDir()).toBe(path.join(base, "recovery"));
  });

  it("CRM_DATA_DIR reubica TODO lo escribible (caso desktop/.app)", () => {
    process.env.CRM_DATA_DIR = "/tmp/niuro-app-data";
    expect(dataDir()).toBe("/tmp/niuro-app-data");
    // path.join en las esperanzas: en Windows el separador es \ y el assert
    // literal con / fallaba (lo detecto el runner de CI en windows-latest).
    expect(dbPath()).toBe(path.join("/tmp/niuro-app-data", "crm.db"));
    expect(uploadsDir()).toBe(path.join("/tmp/niuro-app-data", "uploads"));
    expect(recoveryDir()).toBe(path.join("/tmp/niuro-app-data", "recovery"));
  });

  it("CRM_DB_PATH tiene prioridad sobre CRM_DATA_DIR para la DB (compat)", () => {
    process.env.CRM_DATA_DIR = "/tmp/niuro-app-data";
    process.env.CRM_DB_PATH = "/custom/otro.db";
    expect(dbPath()).toBe("/custom/otro.db");
    // pero uploads/recovery siguen colgando de CRM_DATA_DIR
    expect(uploadsDir()).toBe(path.join("/tmp/niuro-app-data", "uploads"));
  });
});
