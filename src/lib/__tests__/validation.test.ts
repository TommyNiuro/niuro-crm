import { describe, it, expect } from "vitest";
import {
  contactCreateSchema,
  contactUpdateSchema,
  dealCreateSchema,
  dealUpdateSchema,
  companyCreateSchema,
  companyUpdateSchema,
} from "../validation";

// Trust boundary: estos schemas validan el body de POST/PUT de contactos,
// deals y empresas (input de red no confiable). Casos cubiertos por schema:
// creacion valida, tipo incorrecto, campo requerido faltante, .partial() de
// update, y el caso especial deletedAt: null para restaurar de la papelera.

describe("contactCreateSchema", () => {
  it("acepta un payload valido", () => {
    const r = contactCreateSchema.safeParse({ name: "Ana", email: "ana@x.com" });
    expect(r.success).toBe(true);
  });

  it("rechaza tipo incorrecto (score no numerico)", () => {
    const r = contactCreateSchema.safeParse({ name: "Ana", score: "no-es-numero" });
    expect(r.success).toBe(false);
  });

  it("rechaza si falta el campo requerido (name)", () => {
    const r = contactCreateSchema.safeParse({ email: "ana@x.com" });
    expect(r.success).toBe(false);
  });
});

describe("contactUpdateSchema", () => {
  it("permite un objeto parcial (un solo campo)", () => {
    const r = contactUpdateSchema.safeParse({ temperature: "hot" });
    expect(r.success).toBe(true);
  });

  it("acepta deletedAt: null para restaurar de la papelera", () => {
    const r = contactUpdateSchema.safeParse({ deletedAt: null });
    expect(r.success).toBe(true);
  });
});

describe("dealCreateSchema", () => {
  it("acepta un payload valido", () => {
    const r = dealCreateSchema.safeParse({ title: "Deal 1", contactId: "c1" });
    expect(r.success).toBe(true);
  });

  it("rechaza tipo incorrecto (value no numerico)", () => {
    const r = dealCreateSchema.safeParse({
      title: "Deal 1",
      contactId: "c1",
      value: "gratis",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza si falta el campo requerido (contactId)", () => {
    const r = dealCreateSchema.safeParse({ title: "Deal 1" });
    expect(r.success).toBe(false);
  });
});

describe("dealUpdateSchema", () => {
  it("permite un objeto parcial (un solo campo)", () => {
    const r = dealUpdateSchema.safeParse({ stageId: "stage-2" });
    expect(r.success).toBe(true);
  });

  it("acepta deletedAt: null para restaurar de la papelera", () => {
    const r = dealUpdateSchema.safeParse({ deletedAt: null });
    expect(r.success).toBe(true);
  });
});

describe("companyCreateSchema", () => {
  it("acepta un payload valido", () => {
    const r = companyCreateSchema.safeParse({ name: "Acme" });
    expect(r.success).toBe(true);
  });

  it("rechaza tipo incorrecto (domain no string)", () => {
    const r = companyCreateSchema.safeParse({ name: "Acme", domain: 123 });
    expect(r.success).toBe(false);
  });

  it("rechaza si falta el campo requerido (name)", () => {
    const r = companyCreateSchema.safeParse({ domain: "acme.com" });
    expect(r.success).toBe(false);
  });
});

describe("companyUpdateSchema", () => {
  it("permite un objeto parcial (un solo campo)", () => {
    const r = companyUpdateSchema.safeParse({ industry: "tech" });
    expect(r.success).toBe(true);
  });

  it("acepta deletedAt: null para restaurar de la papelera", () => {
    const r = companyUpdateSchema.safeParse({ deletedAt: null });
    expect(r.success).toBe(true);
  });
});
