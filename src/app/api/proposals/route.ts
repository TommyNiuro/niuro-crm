import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals, contacts } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  serializeProposal,
  stringifyJsonField,
  PROPOSAL_MODES,
  PROPOSAL_STATUSES,
} from "@/lib/proposals";
import { runProposalGeneration } from "@/lib/proposals-ai/run-generation";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";

// GET /api/proposals                        -> todas (newest first)
// GET /api/proposals?contactId=<id>         -> filtra por contacto
// GET /api/proposals?status=<status>        -> filtra por estado
// Devuelve una fila LIVIANA por propuesta: solo las columnas que el listado
// (ProposalsList) consume. NO traemos ni parseamos los JSON pesados
// (context/cards/roadmap/team/risks/transcript), que el listado no usa: eso es
// trabajo del GET de detalle. 'client' SI se parsea a objeto (es la unica
// columna JSON que el listado necesita) para mantener el contrato del endpoint.
function parseClientCol(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { name: raw };
  }
}

export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  const status = request.nextUrl.searchParams.get("status");

  const filters = [];
  if (contactId) filters.push(eq(proposals.contactId, contactId));
  if (status && PROPOSAL_STATUSES.includes(status as (typeof PROPOSAL_STATUSES)[number])) {
    filters.push(eq(proposals.status, status));
  }

  const where = filters.length === 1 ? filters[0] : filters.length > 1 ? and(...filters) : undefined;

  // Column-select: solo lo que necesita el listado. Evita serializar JSON pesado.
  const cols = {
    id: proposals.id,
    mode: proposals.mode,
    status: proposals.status,
    date: proposals.date,
    client: proposals.client,
    role: proposals.role,
    duration: proposals.duration,
    priority: proposals.priority,
    genStatus: proposals.genStatus, // lo usa el record-view para el polling (pollWhile)
    createdAt: proposals.createdAt,
    updatedAt: proposals.updatedAt,
  };

  const rows = where
    ? db.select(cols).from(proposals).where(where).orderBy(desc(proposals.createdAt)).all()
    : db.select(cols).from(proposals).orderBy(desc(proposals.createdAt)).all();

  // createdAt/updatedAt vienen como Date (timestamp mode); el cliente los
  // formatea con new Date(value), asi que los pasamos a epoch ms (igual que serializeProposal).
  return NextResponse.json(
    rows.map((r) => {
      const client = parseClientCol(r.client);
      const clientName =
        client && typeof client === "object" && "name" in client
          ? String((client as { name?: unknown }).name ?? "")
          : typeof client === "string"
            ? client
            : "";
      return {
        ...r,
        client,
        clientName, // derivado para el primary del record-view
        createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : r.createdAt,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.getTime() : r.updatedAt,
      };
    })
  );
}

// POST /api/proposals
// Crea una propuesta en estado 'draft'. Body:
//   { contactId?, dealId?, mode, client, role?, duration?, transcript?, notes?,
//     date?, priority?, pricing?, summary?, context?, cards?, roadmap?, team?,
//     risks?, generated? }
// Los campos editoriales (client/pricing/context/cards/roadmap/team/risks) se
// aceptan como objeto y se guardan como JSON serializado. 'client' y 'mode' son
// obligatorios (client es NOT NULL en la tabla).
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const mode = body.mode;
  if (typeof mode !== "string" || !PROPOSAL_MODES.includes(mode as (typeof PROPOSAL_MODES)[number])) {
    return NextResponse.json(
      { error: `mode es requerido y debe ser uno de: ${PROPOSAL_MODES.join(", ")}` },
      { status: 400 }
    );
  }

  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

  // ── MODO GENERAR: crea la propuesta en 'generating' y dispara la IA en
  // background (fire-and-forget). No espera el resultado: la UI hace polling.
  // En este modo el contenido editorial (incluido client) lo produce la IA, asi
  // que solo exigimos transcript; client arranca como placeholder del contacto.
  if (body.generate === true) {
    const transcript = typeof body.transcript === "string" ? body.transcript : "";
    if (!transcript.trim()) {
      return NextResponse.json(
        { error: "transcript es requerido para generar con IA" },
        { status: 400 }
      );
    }
    const contactId = str(body.contactId);
    let clientName = "Generando propuesta";
    if (contactId) {
      const c = db.select().from(contacts).where(eq(contacts.id, contactId)).get();
      if (c) clientName = c.company || c.name || clientName;
    }
    const now = new Date();
    const created = db
      .insert(proposals)
      .values({
        contactId,
        dealId: str(body.dealId),
        mode,
        status: "draft",
        client: JSON.stringify({ name: clientName }),
        transcript,
        notes: typeof body.notes === "string" ? body.notes : null,
        generated: false,
        genStatus: "generating",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Fire-and-forget: el server next start vive lo suficiente. Si falla, queda
    // genStatus='error' con el detalle (la UI lo muestra y permite reintentar).
    runProposalGeneration(created.id).catch((err) =>
      console.error(`[proposals] generacion ${created.id} fallo:`, err)
    );

    dispatchRecordEvent("proposals", "created", created as { id: string } & Record<string, unknown>);
    return NextResponse.json(serializeProposal(created), { status: 201 });
  }

  if (body.client === undefined || body.client === null) {
    return NextResponse.json({ error: "client es requerido" }, { status: 400 });
  }
  const client = stringifyJsonField(body.client);
  if (typeof client !== "string") {
    return NextResponse.json({ error: "client no se pudo serializar" }, { status: 400 });
  }

  const now = new Date();

  const created = db
    .insert(proposals)
    .values({
      contactId: str(body.contactId),
      dealId: str(body.dealId),
      mode,
      status: "draft",
      date: str(body.date),
      client,
      role: str(body.role),
      duration: str(body.duration),
      transcript: typeof body.transcript === "string" ? body.transcript : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      pricing: stringifyJsonField(body.pricing) ?? null,
      summary: str(body.summary),
      context: stringifyJsonField(body.context) ?? null,
      cards: stringifyJsonField(body.cards) ?? null,
      roadmap: stringifyJsonField(body.roadmap) ?? null,
      team: stringifyJsonField(body.team) ?? null,
      risks: stringifyJsonField(body.risks) ?? null,
      generated: typeof body.generated === "boolean" ? body.generated : false,
      priority: str(body.priority),
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  dispatchRecordEvent("proposals", "created", created as { id: string } & Record<string, unknown>);
  return NextResponse.json(serializeProposal(created), { status: 201 });
}
