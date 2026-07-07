import { describe, it, expect } from "vitest";
import { scoreJob, type Job } from "../../../scripts/scan-external-jobs";

const attrs = (over: Partial<Job["attributes"]>): Job["attributes"] => ({
  title: "Backend Dev",
  description: "",
  projects: null,
  remote: false,
  remote_modality: null,
  countries: null,
  min_salary: null,
  max_salary: null,
  published_at: Date.now() / 1000,
  lang: "es",
  seniority: { data: { id: 0 } },
  company: { data: { id: "acme" } },
  ...over,
});

describe("scoreJob", () => {
  it("aviso frío puntúa menos que uno caliente", () => {
    const cold = scoreJob(attrs({
      seniority: { data: { id: 1 } },
      remote: false,
      title: "Cobol Dev",
      published_at: Date.now() / 1000 - 30 * 86400,
    }), ["cobol"]);
    const hot = scoreJob(attrs({
      seniority: { data: { id: 4 } },
      remote: true,
      min_salary: 4000,
      published_at: Date.now() / 1000,
    }), ["react", "node"]);
    expect(hot).toBeGreaterThan(cold);
    expect(hot).toBeLessThanOrEqual(100);
    expect(cold).toBeGreaterThanOrEqual(0);
  });

  it("seniority alto suma más que semi senior, y bajo no suma", () => {
    const base = attrs({ seniority: { data: { id: 0 } } });
    const senior = scoreJob(attrs({ seniority: { data: { id: 4 } } }), []);
    const semiSenior = scoreJob(attrs({ seniority: { data: { id: 3 } } }), []);
    const junior = scoreJob(base, []);
    expect(senior).toBeGreaterThan(semiSenior);
    expect(semiSenior).toBeGreaterThan(junior);
  });

  it("remoto total suma más que híbrido, y presencial no suma", () => {
    const remote = scoreJob(attrs({ remote: true }), []);
    const hybrid = scoreJob(attrs({ remote: false, remote_modality: "hybrid" }), []);
    const onsite = scoreJob(attrs({ remote: false, remote_modality: null }), []);
    expect(remote).toBeGreaterThan(hybrid);
    expect(hybrid).toBeGreaterThan(onsite);
  });

  it("salario dentro de rango suma, fuera de rango no", () => {
    const inRange = scoreJob(attrs({ min_salary: 3000 }), []);
    const alsoInRange = scoreJob(attrs({ max_salary: 3500 }), []);
    const outOfRange = scoreJob(attrs({ min_salary: 1000, max_salary: 2000 }), []);
    expect(inRange).toBeGreaterThan(outOfRange);
    expect(alsoInRange).toBeGreaterThan(outOfRange);
  });

  it("stack que matchea HOT_STACK_RE suma, uno que no matchea no suma", () => {
    const matchByTag = scoreJob(attrs({ title: "Dev" }), ["react"]);
    const matchByTitle = scoreJob(attrs({ title: "React Developer" }), []);
    const noMatch = scoreJob(attrs({ title: "Dev" }), ["cobol"]);
    expect(matchByTag).toBeGreaterThan(noMatch);
    expect(matchByTitle).toBeGreaterThan(noMatch);
  });

  it("antigüedad reciente suma más que vieja", () => {
    const fresh = scoreJob(attrs({ published_at: Date.now() / 1000 - 1 * 86400 }), []);
    const weekOld = scoreJob(attrs({ published_at: Date.now() / 1000 - 5 * 86400 }), []);
    const old = scoreJob(attrs({ published_at: Date.now() / 1000 - 30 * 86400 }), []);
    expect(fresh).toBeGreaterThan(weekOld);
    expect(weekOld).toBeGreaterThan(old);
  });
});
