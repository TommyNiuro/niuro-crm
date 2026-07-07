import { describe, it, expect } from "vitest";
import { findRoleEntry, estimateMonthlyRate } from "../rate-cards";

describe("findRoleEntry", () => {
  it("matchea exacto por nombre de rol", () => {
    expect(findRoleEntry("Backend Developer")?.role).toBe("Backend Developer");
  });

  it("matchea solo por keyword cuando el rol no aparece literal", () => {
    expect(findRoleEntry("necesito un dev nodejs")?.role).toBe("Backend Developer");
  });

  it("ambiguedad real: 'apex' y 'salesforce' matchean roles distintos, gana el primero en RATE_CARDS (Architect antes que Specialist)", () => {
    expect(findRoleEntry("salesforce apex")?.role).toBe("Salesforce Architect");
    // el orden de las palabras en la query no cambia el resultado: el que decide es el orden del array
    expect(findRoleEntry("apex salesforce")?.role).toBe("Salesforce Architect");
  });

  it("sin match devuelve null", () => {
    expect(findRoleEntry("astronauta")).toBeNull();
    expect(findRoleEntry("")).toBeNull();
  });
});

describe("estimateMonthlyRate", () => {
  it("devuelve el rango exacto cuando el seniority existe", () => {
    expect(estimateMonthlyRate("Backend Developer", "mid")).toEqual({ min: 3900, max: 3900 });
  });

  it("hace fallback al rango global del rol si el seniority pedido no esta definido", () => {
    // Backend Developer solo tiene mid y senior, no junior
    expect(estimateMonthlyRate("Backend Developer", "junior")).toEqual({ min: 3250, max: 5850 });
  });

  it("devuelve null si el rol no existe", () => {
    expect(estimateMonthlyRate("astronauta", "senior")).toBeNull();
  });
});
