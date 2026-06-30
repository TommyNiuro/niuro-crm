import { describe, it, expect } from "vitest";
import { formatCurrency, formatDateES } from "../../components/proposals/format";

// Tests de Node puro para los helpers de formateo de propuestas.
// No se importa sanitizeInlineHtml: ya tiene cobertura en sanitize-html.test.ts.

describe("formatCurrency", () => {
  it("CLP: sin decimales, locale es-CL", () => {
    const result = formatCurrency(1000000, "CLP");
    // El formato exacto de separadores depende de la implementacion de Intl en Node.
    // En es-CL el separador de miles es '.' lo que hace que '$1.000.000' sea
    // correcto y NO tiene decimales al final. Verificamos que no termine en ,XX o .XX.
    expect(result).toBeTruthy();
    // No debe terminar con separador decimal de dos cifras (,00 o .00).
    expect(result).not.toMatch(/[,\.]\d{2}$/);
    // Debe contener el numero 1000000 de alguna forma.
    expect(result.replace(/[\s.,]/g, "")).toContain("1000000");
  });

  it("USD: dos decimales, locale en-US", () => {
    const result = formatCurrency(1500, "USD");
    expect(result).toBe("$1,500.00");
  });

  it("null devuelve 'Pendiente'", () => {
    expect(formatCurrency(null)).toBe("Pendiente");
  });

  it("undefined devuelve 'Pendiente'", () => {
    expect(formatCurrency(undefined)).toBe("Pendiente");
  });

  it("moneda invalida: no lanza, devuelve el monto como string", () => {
    // Intl lanza RangeError con currency invalida; el fallback devuelve el numero.
    const result = formatCurrency(999, "INVALIDA");
    expect(result).toBe("999");
  });

  it("cero devuelve formato de cero (no 'Pendiente')", () => {
    const result = formatCurrency(0, "USD");
    expect(result).toBe("$0.00");
  });
});

describe("formatDateES", () => {
  it("ISO valido YYYY-MM-DD -> 'DD de mes de AAAA'", () => {
    expect(formatDateES("2026-06-15")).toBe("15 de junio de 2026");
  });

  it("1 de enero", () => {
    expect(formatDateES("2025-01-01")).toBe("1 de enero de 2025");
  });

  it("31 de diciembre", () => {
    expect(formatDateES("2024-12-31")).toBe("31 de diciembre de 2024");
  });

  it("null devuelve 'Pendiente'", () => {
    expect(formatDateES(null)).toBe("Pendiente");
  });

  it("undefined devuelve 'Pendiente'", () => {
    expect(formatDateES(undefined)).toBe("Pendiente");
  });

  it("string vacio devuelve 'Pendiente'", () => {
    expect(formatDateES("")).toBe("Pendiente");
  });

  it("formato invalido (no ISO) devuelve el string original", () => {
    expect(formatDateES("no-es-fecha")).toBe("no-es-fecha");
  });

  it("mes fuera de rango (mes 13) devuelve el string original sin crashear", () => {
    // MONTH_NAMES_ES[12] es undefined -> cae al fallback que devuelve el iso.
    expect(formatDateES("2026-13-01")).toBe("2026-13-01");
  });
});
