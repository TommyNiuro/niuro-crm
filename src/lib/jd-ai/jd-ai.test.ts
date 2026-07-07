import { describe, it, expect } from "vitest";
import { cleanJdObject } from "@/lib/jd-ai/voice";
import { normViability, normConditions, findMissingJdFields } from "@/lib/jd-ai";
import type { GeneratedJobDescription } from "@/lib/jd-ai";

describe("cleanJdObject (voz JD)", () => {
  it("elimina guiones largos (regla inviolable) y palabras prohibidas propias de JD", () => {
    const dirty = {
      about: "Empresa innovadora — líder del panorama, con un producto vibrante y valioso.",
      responsibilities: ["Resolver un problema intrincado — con criterio."],
    };
    const clean = cleanJdObject(dirty);
    const blob = JSON.stringify(clean).toLowerCase();
    expect(blob).not.toContain("—"); // sin guion largo
    for (const w of ["innovadora", "panorama", "vibrante", "valioso", "intrincado"]) {
      expect(blob).not.toContain(w);
    }
  });
});

describe("normViability (Frankenstein, interno)", () => {
  it("default 'viable' ante basura; respeta 'warning'", () => {
    expect(normViability(null).status).toBe("viable");
    expect(normViability({ status: "warning", note: "cruce de roles" })).toEqual({
      status: "warning",
      note: "cruce de roles",
    });
    expect(normViability({ status: "otro", note: "x" }).status).toBe("viable");
  });
});

describe("normConditions", () => {
  it("solo conserva celdas con dato real (string no vacío)", () => {
    const c = normConditions({ location: "Santiago", compensation: "  ", modality: null, teamSize: "4" });
    expect(c).toEqual({ location: "Santiago", teamSize: "4" });
  });
});

describe("findMissingJdFields (completitud)", () => {
  const full: GeneratedJobDescription = {
    client: { name: "AgroSense" },
    roleTitle: "Ingeniero de Datos Senior",
    pitch: "Buscamos un crack de datos.",
    conditions: {},
    about: "Empresa de agro.",
    roleObjective: "Armar el pipeline.",
    responsibilities: ["Diseñar pipelines."],
    profile: { experience: "5 años.", stackMust: ["Python"], stackNice: [] },
    powerSkills: ["Autonomía."],
    notLookingFor: ["Perfiles que necesiten todo definido."],
    whyCompany: "La data es el producto.",
    conditionsClosing: "Renta competitiva.",
    benefits: "Herramientas de IA pagadas.",
    startDate: "Lo antes posible.",
    successIndicators: [],
    onboarding: null,
    viability: { status: "viable", note: "ok" },
  };

  it("una JD completa no tiene campos faltantes", () => {
    expect(findMissingJdFields(full)).toEqual([]);
  });

  it("detecta core universal vacío (no exige whyCompany/pitch/etc: son por plantilla)", () => {
    const partial = { ...full, roleTitle: "", responsibilities: [], about: "" };
    const missing = findMissingJdFields(partial);
    expect(missing).toContain("roleTitle");
    expect(missing).toContain("responsibilities");
    expect(missing).toContain("about");
    // whyCompany NO se exige (la plantilla compact no lo genera).
    expect(missing).not.toContain("whyCompany");
  });
});
