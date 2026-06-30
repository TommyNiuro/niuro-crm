import { describe, it, expect } from "vitest";
import { scoreLead, detectNiuroPitch , DEFAULT_RUBRIC_CONFIG } from "../score-lead";

const ts = new Date().toISOString();

describe("señal niuro.io (pitch de Niuro)", () => {
  it("detectNiuroPitch reconoce el pitch enviado por el operador", () => {
    const pitch =
      "en niuro.io proveemos mas de 10.000 ingenieros de software senior en latam " +
      "que se integran directamente con equipos de producto.";
    expect(detectNiuroPitch(pitch, "")).toBe(true);
    expect(detectNiuroPitch("", "vi su web niuro.io y me interesa")).toBe(true);
    expect(detectNiuroPitch("hola como estas", "todo bien y tu")).toBe(false);
  });

  it("el pitch enviado activa ownerSelling y sube el score", () => {
    const r = scoreLead(
      [
        {
          content:
            "En Niuro.io proveemos mas de 10.000 ingenieros de software senior en LATAM que se integran directamente con equipos de producto.",
          isFromMe: true,
          timestamp: ts,
        },
        { content: "me interesa, cómo funciona?", isFromMe: false, timestamp: ts },
      ],
      null
    );
    expect(r.signals.ownerSelling).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.reason).toContain("pitch Niuro.io");
  });

  it("con pitch enviado no se descalifica como personal", () => {
    const r = scoreLead(
      [
        { content: "hola amor como estas te quiero", isFromMe: false, timestamp: ts },
        { content: "En niuro.io proveemos ingenieros senior LATAM", isFromMe: true, timestamp: ts },
      ],
      null
    );
    expect(r.disqualifier).toBeNull();
  });

  it("la rúbrica custom cambia el score (keywords y max editados)", () => {
    const msgs = [
      { content: "necesitamos un ninja del código para nuestra tribu", isFromMe: false, timestamp: ts },
    ];
    const base = scoreLead(msgs, null);
    const custom = structuredClone(DEFAULT_RUBRIC_CONFIG);
    // Keyword nueva en el tier más alto de intención + max ampliado
    custom.intencion.keywords[0] = ["ninja del código"];
    custom.intencion.max = 50;
    const r = scoreLead(msgs, null, { rubric: custom });
    expect(r.breakdown.intencion).toBe(50);
    expect(r.score).toBeGreaterThan(base.score);
  });
});
