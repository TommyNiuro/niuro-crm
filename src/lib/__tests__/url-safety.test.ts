import { describe, it, expect } from "vitest";
import { assertPublicHttpUrl, assertLoopbackHttpUrl } from "../url-safety";

describe("assertPublicHttpUrl (destinos externos, ej. workflows)", () => {
  it("permite hosts públicos http/https", () => {
    expect(() => assertPublicHttpUrl("https://api.slack.com/hooks/x")).not.toThrow();
  });

  it("bloquea metadata endpoint y rangos privados", () => {
    expect(() => assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/")).toThrow();
    expect(() => assertPublicHttpUrl("http://192.168.1.5:80")).toThrow();
    expect(() => assertPublicHttpUrl("http://10.0.0.5")).toThrow();
    expect(() => assertPublicHttpUrl("http://172.16.0.1")).toThrow();
  });

  it("bloquea localhost y protocolos no http", () => {
    expect(() => assertPublicHttpUrl("http://localhost:8080/api/send")).toThrow();
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow();
  });
});

describe("assertLoopbackHttpUrl (bridge de WhatsApp)", () => {
  it("permite localhost y 127.0.0.1", () => {
    expect(() => assertLoopbackHttpUrl("http://localhost:8080")).not.toThrow();
    expect(() => assertLoopbackHttpUrl("http://127.0.0.1:8080")).not.toThrow();
  });

  it("bloquea hosts externos o de red privada", () => {
    expect(() => assertLoopbackHttpUrl("http://evil.example.com:8080")).toThrow();
    expect(() => assertLoopbackHttpUrl("http://192.168.1.50:8080")).toThrow();
  });
});
