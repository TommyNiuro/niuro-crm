import { describe, it, expect } from "vitest";
import { calcMilestones } from "../proposals-ai/prompts/full-generate";

// calcMilestones reparte el precio de un Project Sprint en 20% setup + 3 cuotas.
// Es plata en la propuesta: un off-by-one en el redondeo es un monto mal cotizado.
describe("calcMilestones — pagos del Project Sprint", () => {
  it("devuelve [] si total<=0 o startDate vacio", () => {
    expect(calcMilestones(0, "2026-06-15")).toEqual([]);
    expect(calcMilestones(-100, "2026-06-15")).toEqual([]);
    expect(calcMilestones(10000, "")).toEqual([]);
  });

  it("reparte 20% setup + 3 cuotas y el total se conserva exacto", () => {
    const ms = calcMilestones(10000, "2026-06-15");
    expect(ms).toHaveLength(4);
    expect(ms[0]).toMatchObject({ date: "2026-06-15", amount: 2000 });
    const sum = ms.reduce((a, m) => a + m.amount, 0);
    expect(sum).toBe(10000);
  });

  it("la ultima cuota absorbe el redondeo cuando no divide exacto", () => {
    // total=10000 -> setup=2000, remaining=8000, per=2666, last=2668
    const ms = calcMilestones(10000, "2026-06-15");
    expect(ms[1].amount).toBe(2666);
    expect(ms[2].amount).toBe(2666);
    expect(ms[3].amount).toBe(2668);
    expect(ms[3].note).toBe("Cuota final · entrega");
  });

  it("el setup va en startDate y las cuotas son posteriores", () => {
    const ms = calcMilestones(12000, "2026-01-10");
    expect(ms[0].date).toBe("2026-01-10");
    expect(new Date(ms[3].date).getTime()).toBeGreaterThan(
      new Date(ms[0].date).getTime(),
    );
  });

  it("rollover de fin de mes: 2026-01-31 + 1 mes rueda a marzo (comportamiento nativo de setMonth)", () => {
    // Date('2026-01-31').setMonth(1) -> setMonth(febrero) con dia 31 rueda a
    // 2026-03-03 (febrero tiene 28 dias en 2026). Este es el comportamiento
    // nativo de JS: no hay correccion al ultimo dia del mes.
    // El test documenta y fija este comportamiento para detectar si alguien lo
    // "arregla" sin querer. Si se decide corregir, este test debe actualizarse
    // deliberadamente y con un caso real de propuesta.
    const ms = calcMilestones(6000, "2026-01-31");
    expect(ms).toHaveLength(4);
    expect(ms[0].date).toBe("2026-01-31");
    // Cuota 1: enero+1 = febrero, dia 31 rueda a marzo 3.
    expect(ms[1].date).toBe("2026-03-03");
    // Cuota 2: enero+2 = marzo, dia 31 -> ok (marzo tiene 31 dias).
    expect(ms[2].date).toBe("2026-03-31");
    // Cuota 3: enero+3 = abril, dia 31 rueda a mayo 1.
    expect(ms[3].date).toBe("2026-05-01");
    // El total se conserva sin importar el rollover de fecha.
    const sum = ms.reduce((a, m) => a + m.amount, 0);
    expect(sum).toBe(6000);
  });
});
