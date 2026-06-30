import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

// Rutas API de proposals: db real (harness :memory:) + generacion IA mockeada
// (no queremos disparar el subprocess claude en los tests).
vi.mock("@/db", async () => {
  const { makeTestDb, seedStages } = await import("./helpers/test-db");
  const h = makeTestDb();
  seedStages(h.db);
  return { db: h.db };
});

// vi.hoisted: el mock se usa dentro de la factory hoisteada de vi.mock, asi que
// debe existir antes. Devuelve una promesa porque la ruta hace .catch() encima.
const { runProposalGeneration } = vi.hoisted(() => ({
  runProposalGeneration: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/proposals-ai/run-generation", () => ({ runProposalGeneration }));

import { db } from "@/db";
import { proposals, contacts } from "@/db/schema";
import { POST, GET } from "../../app/api/proposals/route";
import { PUT } from "../../app/api/proposals/[id]/route";
import { POST as STATUS } from "../../app/api/proposals/[id]/status/route";
import { POST as REGENERATE } from "../../app/api/proposals/[id]/regenerate/route";

// NextRequest falso: los handlers solo usan request.json() y, en GET, nextUrl.
function postReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}
function getReq(qs = ""): NextRequest {
  return { nextUrl: { searchParams: new URLSearchParams(qs) } } as unknown as NextRequest;
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  runProposalGeneration.mockClear();
  db.delete(proposals).run();
  db.delete(contacts).run();
});

describe("POST /api/proposals", () => {
  it("rechaza mode invalido con 400", async () => {
    const res = await POST(postReq({ mode: "loquesea", client: { name: "X" } }));
    expect(res.status).toBe(400);
  });

  it("modo generar sin transcript -> 400", async () => {
    const res = await POST(postReq({ mode: "staff-aug", generate: true }));
    expect(res.status).toBe(400);
    expect(runProposalGeneration).not.toHaveBeenCalled();
  });

  it("modo generar con transcript -> 201, genStatus generating y dispara la IA", async () => {
    const res = await POST(postReq({ mode: "staff-aug", generate: true, transcript: "hola necesito un dev" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.genStatus).toBe("generating");
    expect(runProposalGeneration).toHaveBeenCalledOnce();
    expect(runProposalGeneration).toHaveBeenCalledWith(json.id);
  });

  it("modo manual sin client -> 400", async () => {
    const res = await POST(postReq({ mode: "sprint" }));
    expect(res.status).toBe(400);
  });

  it("modo manual con client -> 201 y persiste", async () => {
    const res = await POST(postReq({ mode: "sprint", client: { name: "MIIDO", industry: "Fintech" } }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.client).toEqual({ name: "MIIDO", industry: "Fintech" });
    expect(json.status).toBe("draft");
    // realmente quedo en la DB
    const all = db.select().from(proposals).all();
    expect(all).toHaveLength(1);
  });
});

describe("GET /api/proposals", () => {
  it("filtra por status (whitelist) y devuelve serializado", async () => {
    await POST(postReq({ mode: "sprint", client: { name: "A" } }));
    const res = await GET(getReq("status=draft"));
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(1);
    expect(list[0].client).toEqual({ name: "A" });
  });
});

describe("PUT /api/proposals/[id]", () => {
  async function createManual() {
    const res = await POST(postReq({ mode: "staff-aug", client: { name: "ACME" } }));
    return (await res.json()).id as string;
  }

  it("404 si la propuesta no existe", async () => {
    const res = await PUT(postReq({ summary: "x" }), ctx("no-existe"));
    expect(res.status).toBe(404);
  });

  it("status invalido -> 400", async () => {
    const id = await createManual();
    const res = await PUT(postReq({ status: "loquesea" }), ctx(id));
    expect(res.status).toBe(400);
  });

  it("client vacio -> 400 (no se puede borrar, es NOT NULL)", async () => {
    const id = await createManual();
    const res = await PUT(postReq({ client: null }), ctx(id));
    expect(res.status).toBe(400);
  });

  it("actualiza pricing sin tocar client ni status", async () => {
    const id = await createManual();
    const res = await PUT(
      postReq({ pricing: { currency: "USD", monthlyMin: 4500, monthlyMax: 5500, iva: true } }),
      ctx(id),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pricing).toEqual({ currency: "USD", monthlyMin: 4500, monthlyMax: 5500, iva: true });
    expect(json.client).toEqual({ name: "ACME" });
    expect(json.status).toBe("draft");
  });
});

describe("POST /api/proposals/[id]/status", () => {
  async function createManual() {
    const res = await POST(postReq({ mode: "staff-aug", client: { name: "StatusCo" } }));
    return (await res.json()).id as string;
  }

  it("404 si la propuesta no existe", async () => {
    const res = await STATUS(postReq({ status: "sent" }), ctx("no-existe"));
    expect(res.status).toBe(404);
  });

  it("400 si el status es invalido", async () => {
    const id = await createManual();
    const res = await STATUS(postReq({ status: "loquesea" }), ctx(id));
    expect(res.status).toBe(400);
  });

  it("sent: 200 con campo pipeline en la respuesta (sin contacto -> moved:false)", async () => {
    const id = await createManual();
    const res = await STATUS(postReq({ status: "sent" }), ctx(id));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("sent");
    // pipeline siempre presente; sin contacto ligado moved=false es correcto.
    expect(json.pipeline).toBeDefined();
    expect(typeof json.pipeline.moved).toBe("boolean");
  });

  it("signed: 200 con campo pipeline en la respuesta", async () => {
    const id = await createManual();
    const res = await STATUS(postReq({ status: "signed" }), ctx(id));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("signed");
    expect(json.pipeline).toBeDefined();
    expect(typeof json.pipeline.moved).toBe("boolean");
  });

  it("lost: 200 con campo pipeline en la respuesta", async () => {
    const id = await createManual();
    const res = await STATUS(postReq({ status: "lost" }), ctx(id));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("lost");
    expect(json.pipeline).toBeDefined();
    expect(typeof json.pipeline.moved).toBe("boolean");
  });
});

describe("POST /api/proposals/[id]/regenerate", () => {
  async function createWithTranscript() {
    const res = await POST(
      postReq({ mode: "staff-aug", generate: true, transcript: "Necesito un dev senior." }),
    );
    return (await res.json()).id as string;
  }

  async function createManual() {
    const res = await POST(postReq({ mode: "staff-aug", client: { name: "RegCo" } }));
    return (await res.json()).id as string;
  }

  it("404 si la propuesta no existe", async () => {
    const res = await REGENERATE(postReq({}), ctx("no-existe"));
    expect(res.status).toBe(404);
  });

  it("400 si el transcript esta vacio", async () => {
    const id = await createManual();
    const res = await REGENERATE(postReq({}), ctx(id));
    expect(res.status).toBe(400);
  });

  it("409 si genStatus ya es 'generating' (no debe disparar otra generacion)", async () => {
    // Creamos la propuesta con generate=true -> queda en genStatus='generating'.
    const id = await createWithTranscript();
    runProposalGeneration.mockClear(); // limpiar la llamada del POST inicial

    const res = await REGENERATE(postReq({}), ctx(id));
    expect(res.status).toBe(409);
    // No debe haber disparado otra generacion.
    expect(runProposalGeneration).not.toHaveBeenCalled();
  });

  it("200: setea genStatus=generating y llama runProposalGeneration exactamente una vez", async () => {
    // Propuesta con transcript pero genStatus=ready (simula post-generacion exitosa).
    const id = await createWithTranscript();
    // Simulamos que ya termino la generacion previa poniendola en 'ready'.
    db.update(proposals).set({ genStatus: "ready" }).where(
      // eq importado al tope del archivo
      (await import("drizzle-orm")).eq(proposals.id, id)
    ).run();
    runProposalGeneration.mockClear();

    const res = await REGENERATE(postReq({}), ctx(id));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.genStatus).toBe("generating");
    expect(runProposalGeneration).toHaveBeenCalledOnce();
    expect(runProposalGeneration).toHaveBeenCalledWith(id);
  });
});
