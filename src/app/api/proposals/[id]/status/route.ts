import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeProposal, applyStatusChange, PROPOSAL_STATUSES } from "@/lib/proposals";

// POST /api/proposals/[id]/status   body: { status }
// Cambia el estado de la propuesta y MUEVE el pipeline del contacto/deal ligado
// de forma atomica (toda la logica vive en applyStatusChange, en src/lib/proposals):
//   sent   -> sentAt=now; contacto a etapa "Propuesta" + step_transition.
//   signed -> signedAt=now; contacto/deal a etapa isWon ("Cierre") + activity.
//   lost   -> closedAt=now; contacto archived=true ("Perdidos") + activity.
// Si la propuesta no tiene contacto ni deal, solo cambia el status.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const status = body.status;
  if (typeof status !== "string" || !PROPOSAL_STATUSES.includes(status as (typeof PROPOSAL_STATUSES)[number])) {
    return NextResponse.json(
      { error: `status es requerido y debe ser uno de: ${PROPOSAL_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const existing = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

  try {
    const result = applyStatusChange(existing, status);
    return NextResponse.json({ ...serializeProposal(result.proposal), pipeline: result.pipeline });
  } catch (e) {
    console.error(`[proposals/status] error para ${id}:`, e);
    return NextResponse.json(
      { error: `No se pudo cambiar el status: ${e instanceof Error ? e.message : "desconocido"}` },
      { status: 500 }
    );
  }
}
