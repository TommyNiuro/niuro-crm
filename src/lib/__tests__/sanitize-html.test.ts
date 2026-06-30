import { describe, it, expect } from "vitest";
import { sanitizeInlineHtml } from "@/components/proposals/format";

// sanitizeInlineHtml es la defensa XSS en el sink de render de las propuestas.
// El contenido sale de un prompt alimentado por el transcript del cliente, asi
// que un transcript malicioso (indirect prompt injection) podria intentar meter
// <script> / on*= / javascript:. La estrategia es escapar todo y restaurar solo
// los tags de enfasis bare: nada ejecutable sobrevive, ni siquiera tags sin '>'
// de cierre o anidados (regresion de los bypasses encontrados en auditoria).
describe("sanitizeInlineHtml — XSS sobre HTML generado por IA", () => {
  it("conserva tags de enfasis permitidos (bare)", () => {
    expect(sanitizeInlineHtml("Hola <strong>MIIDO</strong> y <em>equipo</em>")).toBe(
      "Hola <strong>MIIDO</strong> y <em>equipo</em>",
    );
  });

  it("elimina <script> cerrado junto con su contenido", () => {
    expect(sanitizeInlineHtml("ok<script>alert(1)</script>fin")).toBe("okfin");
  });

  it("neutraliza tags fuera del allowlist y conserva el texto", () => {
    const out = sanitizeInlineHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/<a[\s>]/i);
    expect(out).toContain("click");
  });

  it("un tag permitido CON atributos no queda vivo (on* neutralizado)", () => {
    const out = sanitizeInlineHtml('<strong onmouseover="alert(1)">x</strong>');
    expect(out).not.toMatch(/<strong[^>]*onmouseover/i);
    expect(out).toContain("x");
  });

  it("neutraliza <img onerror> cerrado", () => {
    expect(sanitizeInlineHtml("<img src=x onerror=alert(1)>")).not.toMatch(/<img/i);
  });

  // Regresion: el bypass era un tag peligroso SIN el '>' de cierre.
  it("neutraliza un tag peligroso SIN '>' de cierre", () => {
    expect(sanitizeInlineHtml("<img src=x onerror=alert(1)")).not.toMatch(/<img/i);
    expect(sanitizeInlineHtml("<svg onload=alert(1)")).not.toMatch(/<svg/i);
    expect(sanitizeInlineHtml("<iframe srcdoc=x")).not.toMatch(/<iframe/i);
  });

  it("neutraliza tags anidados sin residuo ejecutable", () => {
    const out = sanitizeInlineHtml("<scr<script>ipt>alert(1)</scr</script>ipt>");
    expect(out).not.toMatch(/<script/i);
  });

  it("neutraliza un payload inyectado via transcript pero conserva el enfasis", () => {
    const evil = 'Cliente <strong>ACME</strong><img src=x onerror="fetch(`/x`)">';
    const out = sanitizeInlineHtml(evil);
    expect(out).not.toMatch(/<img/i);
    expect(out).toContain("<strong>ACME</strong>");
  });

  it("no corrompe texto normal con numeros", () => {
    // Regresion de una version con placeholder fragil que rompia ' N ' en texto.
    expect(sanitizeInlineHtml("tengo 3 devs y 10 anios")).toBe("tengo 3 devs y 10 anios");
  });

  it("normaliza <br> y tolera null/undefined", () => {
    expect(sanitizeInlineHtml("a<br>b")).toBe("a<br/>b");
    expect(sanitizeInlineHtml(null)).toBe("");
    expect(sanitizeInlineHtml(undefined)).toBe("");
  });
});
