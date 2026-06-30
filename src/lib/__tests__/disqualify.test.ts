/**
 * Primeros tests del repo (auditoría 2026-06-09, Fase 2).
 * Cubren la lógica determinista más crítica: descalificadores, detección de
 * empresa (regresión del bug de porteo) y límites del scoring.
 */
import { describe, it, expect } from "vitest";
import { checkDisqualifier, detectCompanyToken, type DisqMsg } from "../disqualify";
import { scoreLead, type ScoreLeadMessage } from "../score-lead";

const msg = (content: string, isFromMe = false): DisqMsg => ({ content, isFromMe });

describe("detectCompanyToken", () => {
  it("detecta la empresa en un nombre calificado (regresión: el puerto TS eliminaba los espacios)", () => {
    expect(detectCompanyToken("Juan Pérez ACME")).toEqual({ has: true, text: "ACME" });
  });

  it("ignora tokens de cargo y geografía", () => {
    const r = detectCompanyToken("Pedro Gómez CEO ACME");
    expect(r.has).toBe(true);
    expect(r.text).toBe("ACME");
    expect(detectCompanyToken("Ana Gómez CHILE")).toEqual({ has: false, text: null });
  });

  it("nombre y apellido solos no son empresa", () => {
    expect(detectCompanyToken("Juan Pérez").has).toBe(false);
    expect(detectCompanyToken(null).has).toBe(false);
  });
});

describe("checkDisqualifier", () => {
  const romanticChat: DisqMsg[] = [
    msg("te amo mi amor"), msg("mi vida te extraño"), msg("te quiero bebé"),
    msg("mi cielo, beso"), msg("te amo te amo"),
  ];

  it("descarta chats personales por densidad", () => {
    expect(checkDisqualifier(romanticChat)).toBe("personal");
  });

  it("la protección por empresa evita el descarte (regresión: nunca funcionaba)", () => {
    expect(checkDisqualifier(romanticChat, "Laura Soto ACME")).toBeNull();
  });

  it("no descarta por una mención romántica incidental (umbral por densidad)", () => {
    const business: DisqMsg[] = [
      msg("necesitamos un perfil senior de react"), msg("cuánto cuesta?"),
      msg("ok amor, te dejo — hablamos mañana del proyecto"), msg("dale, agendemos"),
      msg("perfecto"), msg("propuesta enviada", true), msg("gracias!"),
      msg("lo reviso con el equipo"), msg("buenísimo"), msg("hablamos"),
    ];
    expect(checkDisqualifier(business)).toBeNull();
  });

  it("detecta buscadores de trabajo solo en mensajes del contacto", () => {
    expect(checkDisqualifier([msg("hola! estoy buscando trabajo, te dejo mi cv")])).toBe("busca-trabajo");
    // si lo dice el operador (isFromMe), no descalifica al contacto
    expect(checkDisqualifier([msg("estoy buscando trabajo para un amigo", true)])).toBeNull();
  });
});

describe("scoreLead", () => {
  const m = (content: string, isFromMe = false): ScoreLeadMessage => ({
    content,
    isFromMe,
    timestamp: new Date().toISOString(),
  });

  it("el token de empresa suma autoridad y aparece en signals (regresión del bug de porteo)", () => {
    const r = scoreLead([m("hola, cómo funciona niuro? necesitamos un perfil senior")], "Juan Pérez ACME");
    expect(r.signals.companyToken).toBe(true);
    expect(r.signals.companyTokenText).toBe("ACME");
    expect(r.breakdown.autoridad).toBeGreaterThanOrEqual(12);
  });

  it("el score siempre queda entre 0 y 100", () => {
    const hot = scoreLead(
      [
        m("soy el cto, necesitamos contratar un perfil senior de react urgente, tenemos presupuesto"),
        m("mándame la propuesta y agendemos esta semana, hay deadline del board"),
        m("propuesta enviada", true),
      ],
      "Pedro Soto KAVAK"
    );
    expect(hot.score).toBeGreaterThan(0);
    expect(hot.score).toBeLessThanOrEqual(100);
    const empty = scoreLead([m("hola")], null);
    expect(empty.score).toBeGreaterThanOrEqual(0);
  });

  it("un chat descalificado devuelve score 0 y discard", () => {
    const r = scoreLead(
      [m("te amo mi amor"), m("mi vida te extraño"), m("te quiero bebé"), m("mi cielo beso"), m("te amo te amo")],
      null
    );
    expect(r.score).toBe(0);
    expect(r.recommendation).toBe("discard");
    expect(r.disqualifier).toBe("personal");
  });
});
