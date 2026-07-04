import { describe, it, expect } from "vitest";
import {
  companyKey,
  isLatamRelevant,
  computeUrgency,
  scoreProspect,
  type RawJob,
} from "@/lib/prospect-score";

const job = (over: Partial<RawJob>): RawJob => ({
  source: "test",
  company: "Acme",
  title: "Backend Dev",
  tags: [],
  url: "https://x",
  publishedAt: 0,
  location: "",
  countries: [],
  remote: false,
  minSalary: null,
  maxSalary: null,
  seniority: null,
  ...over,
});

describe("companyKey", () => {
  it("normaliza sufijos legales y símbolos", () => {
    expect(companyKey("Acme Inc.")).toBe(companyKey("ACME"));
    expect(companyKey("Globant S.A.")).toBe(companyKey("globant"));
    expect(companyKey("Fintech-Co LLC")).toBe(companyKey("Fintech Co"));
  });
  it("no colapsa empresas distintas", () => {
    expect(companyKey("Mercado Libre")).not.toBe(companyKey("Mercado Pago"));
  });
});

describe("isLatamRelevant", () => {
  it("acepta país LATAM explícito aunque no sea remoto", () => {
    expect(isLatamRelevant(job({ countries: ["Chile"] }))).toBe(true);
  });
  it("acepta remoto worldwide/latam", () => {
    expect(isLatamRelevant(job({ remote: true, location: "Remote - LATAM" }))).toBe(true);
    expect(isLatamRelevant(job({ remote: true, location: "Anywhere" }))).toBe(true);
  });
  it("rechaza remoto sin señal de región y on-site fuera de LATAM", () => {
    expect(isLatamRelevant(job({ remote: true, location: "US only" }))).toBe(false);
    expect(isLatamRelevant(job({ location: "Berlin, Germany" }))).toBe(false);
  });
});

describe("computeUrgency", () => {
  it("escala por vacantes y días abiertos", () => {
    expect(computeUrgency(1, 3)).toBe("baja");
    expect(computeUrgency(2, 3)).toBe("media");
    expect(computeUrgency(1, 14)).toBe("media");
    expect(computeUrgency(3, 0)).toBe("alta");
    expect(computeUrgency(1, 30)).toBe("alta");
  });
});

describe("scoreProspect", () => {
  it("empresa con dolor real puntúa más que una recién publicada", () => {
    const cold = scoreProspect({
      jobCount: 1, daysOpen: 1, stack: ["cobol"], seniority: null,
      latamExplicit: false, knownContact: false,
    });
    const hot = scoreProspect({
      jobCount: 4, daysOpen: 35, stack: ["react", "node"], seniority: "Senior",
      latamExplicit: true, knownContact: true,
    });
    expect(hot.total).toBeGreaterThan(cold.total);
    expect(hot.total).toBeLessThanOrEqual(100);
    expect(cold.total).toBeGreaterThan(0);
  });
  it("el desglose suma exactamente al total", () => {
    const b = scoreProspect({
      jobCount: 2, daysOpen: 20, stack: ["python"], seniority: "Senior",
      latamExplicit: true, knownContact: false,
    });
    expect(b.base + b.jobCount + b.daysOpen + b.stack + b.seniority + b.latam + b.knownContact).toBe(b.total);
  });
});
