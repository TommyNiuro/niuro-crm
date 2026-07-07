import { describe, it, expect } from "vitest";
import { computeNextTouch, toMillis, MAX_TOUCHES } from "../followup-cadence-calc";

const DAY = 86400000;

describe("computeNextTouch — cadencia de seguimiento (Agenda)", () => {
  it("contacto no habló: avanza al siguiente toque, dueAt = baseTs + touch*DAY", () => {
    const now = Date.parse("2026-07-04T12:00:00Z");
    // baseTs reciente para que baseTs+touch*DAY caiga en el futuro respecto a "now"
    // (si no, el clamp Math.max(now, ...) tapa lo que este test quiere verificar).
    const baseTs = now - 1 * DAY;
    const r = computeNextTouch({ hasIncomingMsg: false, baseTs, prevTouches: 1, now });
    expect(r.touch).toBe(2);
    expect(r.dueAt).toBe(baseTs + 2 * DAY);
    expect(r.title).toMatch(/Seguimiento 2/);
  });

  it("contacto habló último: no aplica cadencia, vence hoy y touch es null", () => {
    const now = Date.parse("2026-07-04T12:00:00Z");
    const r = computeNextTouch({ hasIncomingMsg: true, baseTs: now - 5 * DAY, prevTouches: 3, now });
    expect(r.touch).toBeNull();
    expect(r.dueAt).toBe(now);
  });

  it("tope de MAX_TOUCHES: nunca pasa de 5 aunque prevTouches sea mayor", () => {
    const now = Date.parse("2026-07-04T12:00:00Z");
    const baseTs = now - 1 * DAY;
    const r = computeNextTouch({ hasIncomingMsg: false, baseTs, prevTouches: 50, now });
    expect(r.touch).toBe(MAX_TOUCHES);
    expect(r.title).toMatch(/Seguimiento 5/);
    expect(r.dueAt).toBe(baseTs + MAX_TOUCHES * DAY);
  });

  it("dueAt nunca queda en el pasado: si el cálculo cae antes de 'now', vence hoy", () => {
    const now = Date.parse("2026-07-04T12:00:00Z");
    const baseTs = now - 1 * DAY; // muy reciente, touch*DAY no alcanza a superar "now"
    const r = computeNextTouch({ hasIncomingMsg: false, baseTs, prevTouches: 0, now });
    expect(r.dueAt).toBe(now);
  });

  it("toMillis: 10 dígitos (segundos) se multiplica por 1000, más dígitos queda igual (ms)", () => {
    const seconds = 1751630400; // 10 dígitos
    const millis = 1751630400123; // 13 dígitos
    expect(toMillis(seconds)).toBe(seconds * 1000);
    expect(toMillis(millis)).toBe(millis);
  });
});
