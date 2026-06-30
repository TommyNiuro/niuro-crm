import { describe, it, expect } from "vitest";
import { cleanVoice, cleanObject } from "../proposals-ai/voice-sanitizer";

// REGLA INVIOLABLE del proyecto: cero guiones largos (—) en el output visible.
// Estos tests son la regresion explicita de esa regla mas el diccionario de voz.
describe("cleanVoice — regla inviolable: cero guiones largos", () => {
  it("em-dash con espacios alrededor -> dos puntos", () => {
    expect(cleanVoice("Niuro acelera la entrega — sin sorpresas")).toBe(
      "Niuro acelera la entrega: sin sorpresas",
    );
  });

  it("em-dash pegado -> coma", () => {
    expect(cleanVoice("rapido—seguro")).toBe("rapido,seguro");
  });

  it("nunca deja un em-dash en el resultado", () => {
    const out = cleanVoice("uno — dos — tres—cuatro");
    expect(out).not.toContain("—");
  });
});

describe("cleanVoice — diccionario de voz Niuro", () => {
  it("reemplaza palabras prohibidas (case-insensitive, word-boundary)", () => {
    expect(cleanVoice("vamos a Potenciar el equipo")).toBe("vamos a mejorar el equipo");
    expect(cleanVoice("una arquitectura robusta")).toBe("una arquitectura sólida");
    expect(cleanVoice("buscamos sinergias")).toBe("buscamos alineación");
    expect(cleanVoice("es crucial avanzar")).toBe("es clave avanzar");
  });

  it("reemplaza frases completas, no solo palabras", () => {
    expect(cleanVoice("ofrecemos soluciones innovadoras")).toBe(
      "ofrecemos soluciones concretas",
    );
  });

  it("deja intacto un texto ya limpio", () => {
    expect(cleanVoice("texto claro y directo")).toBe("texto claro y directo");
  });

  it("tolera strings vacios y no-strings", () => {
    expect(cleanVoice("")).toBe("");
    // @ts-expect-error probamos robustez ante input no-string
    expect(cleanVoice(null)).toBe(null);
  });
});

describe("cleanObject — recursivo y null-safe", () => {
  it("limpia strings en objetos y arrays anidados", () => {
    const input = { a: "x — y", b: [{ c: "potenciar" }], d: 42, e: null };
    expect(cleanObject(input)).toEqual({
      a: "x: y",
      b: [{ c: "mejorar" }],
      d: 42,
      e: null,
    });
  });

  it("no rompe con null/undefined", () => {
    expect(cleanObject(null)).toBe(null);
    expect(cleanObject(undefined)).toBe(undefined);
  });

  it("preserva tipos no-string", () => {
    expect(cleanObject({ n: 1, b: true })).toEqual({ n: 1, b: true });
  });
});
