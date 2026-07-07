import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals, proposalVersions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeProposal, type SerializedProposal } from "@/lib/proposals";

export const dynamic = "force-dynamic";

// POST /api/proposals/[id]/versions/[versionId]/restore
// Reescribe el contenido editorial de la propuesta con el snapshot guardado.
// No toca contactId/dealId/status/fechas de pipeline: restaurar una version es
// deshacer el CONTENIDO, no el estado comercial (a que etapa llego, si se
// mando, etc). El propio restore queda disponible para deshacerse: no borra
// versiones al restaurar.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id, versionId } = await params;

  const version = db.select().from(proposalVersions).where(eq(proposalVersions.id, versionId)).get();
  if (!version || version.proposalId !== id) {
    return NextResponse.json({ error: "Version no encontrada" }, { status: 404 });
  }

  const existing = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

  let snapshot: SerializedProposal;
  try {
    snapshot = JSON.parse(version.snapshot) as SerializedProposal;
  } catch {
    return NextResponse.json({ error: "El snapshot guardado esta corrupto" }, { status: 500 });
  }

  const updated = db
    .update(proposals)
    .set({
      mode: snapshot.mode,
      client: JSON.stringify(snapshot.client),
      role: snapshot.role,
      duration: snapshot.duration,
      transcript: snapshot.transcript,
      notes: snapshot.notes,
      pricing: snapshot.pricing ? JSON.stringify(snapshot.pricing) : null,
      summary: snapshot.summary,
      context: snapshot.context ? JSON.stringify(snapshot.context) : null,
      cards: snapshot.cards ? JSON.stringify(snapshot.cards) : null,
      roadmap: snapshot.roadmap ? JSON.stringify(snapshot.roadmap) : null,
      team: snapshot.team ? JSON.stringify(snapshot.team) : null,
      risks: snapshot.risks ? JSON.stringify(snapshot.risks) : null,
      generated: snapshot.generated,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, id))
    .returning()
    .get();

  return NextResponse.json(serializeProposal(updated));
}
