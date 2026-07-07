import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  serializeProposal,
  stringifyJsonField,
  applyStatusChange,
  PROPOSAL_MODES,
  PROPOSAL_STATUSES,
} from "@/lib/proposals";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";

export const dynamic = "force-dynamic";

// GET /api/proposals/[id] -> una propuesta con los campos JSON parseados.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!row) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  return NextResponse.json(serializeProposal(row));
}

// PUT /api/proposals/[id]
// Actualiza campos de la propuesta. Acepta cualquier subconjunto del body. Los
// campos JSON (client/pricing/context/cards/roadmap/team/risks) se re-serializan
// con JSON.stringify (se aceptan como objeto). Si el body cambia el status, se
// delega en applyStatusChange, que ademas mueve el pipeline de forma atomica.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const existing = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

  // Validar mode/status si vienen en el body.
  if (body.mode !== undefined && !PROPOSAL_MODES.includes(body.mode as (typeof PROPOSAL_MODES)[number])) {
    return NextResponse.json({ error: `mode invalido: ${String(body.mode)}` }, { status: 400 });
  }
  if (
    body.status !== undefined &&
    !PROPOSAL_STATUSES.includes(body.status as (typeof PROPOSAL_STATUSES)[number])
  ) {
    return NextResponse.json({ error: `status invalido: ${String(body.status)}` }, { status: 400 });
  }

  // 1) Construir el patch de campos NO relacionados al status.
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  // Texto plano.
  if (body.mode !== undefined) patch.mode = body.mode;
  if (body.date !== undefined) patch.date = typeof body.date === "string" ? body.date : null;
  if (body.role !== undefined) patch.role = typeof body.role === "string" ? body.role : null;
  if (body.duration !== undefined) patch.duration = typeof body.duration === "string" ? body.duration : null;
  if (body.transcript !== undefined)
    patch.transcript = typeof body.transcript === "string" ? body.transcript : null;
  if (body.notes !== undefined) patch.notes = typeof body.notes === "string" ? body.notes : null;
  if (body.summary !== undefined) patch.summary = typeof body.summary === "string" ? body.summary : null;
  if (body.priority !== undefined) patch.priority = typeof body.priority === "string" ? body.priority : null;
  if (body.contactId !== undefined)
    patch.contactId = typeof body.contactId === "string" && body.contactId ? body.contactId : null;
  if (body.dealId !== undefined)
    patch.dealId = typeof body.dealId === "string" && body.dealId ? body.dealId : null;
  if (body.generated !== undefined) patch.generated = !!body.generated;

  // Campos JSON: re-stringify. stringifyJsonField devuelve undefined si el valor
  // del body era undefined (no se toca), null para null explicito, o el JSON.
  for (const key of ["client", "pricing", "context", "cards", "roadmap", "team", "risks"] as const) {
    if (body[key] !== undefined) {
      const serialized = stringifyJsonField(body[key]);
      // client es NOT NULL: no permitir borrarlo a null por accidente.
      if (key === "client" && (serialized === null || serialized === undefined)) {
        return NextResponse.json({ error: "client no puede quedar vacio" }, { status: 400 });
      }
      patch[key] = serialized ?? null;
    }
  }

  // 2) Aplicar el patch de campos (si hay algo mas que updatedAt).
  let current = existing;
  const hasFieldChanges = Object.keys(patch).length > 1;
  if (hasFieldChanges) {
    current = db.update(proposals).set(patch).where(eq(proposals.id, id)).returning().get();
  }

  // 3) Si cambia el status, delegar en applyStatusChange (mueve pipeline atomico).
  const statusChanged = typeof body.status === "string" && body.status !== existing.status;
  if (statusChanged) {
    const result = applyStatusChange(current, body.status as string);
    dispatchRecordEvent("proposals", "updated", result.proposal as { id: string } & Record<string, unknown>);
    return NextResponse.json({ ...serializeProposal(result.proposal), pipeline: result.pipeline });
  }

  dispatchRecordEvent("proposals", "updated", current as { id: string } & Record<string, unknown>);
  return NextResponse.json(serializeProposal(current));
}

// DELETE /api/proposals/[id] -> soft delete: status='archived'. No borra la fila.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

  const archived = db
    .update(proposals)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(proposals.id, id))
    .returning()
    .get();

  dispatchRecordEvent("proposals", "deleted", archived as { id: string } & Record<string, unknown>);
  return NextResponse.json(serializeProposal(archived));
}
