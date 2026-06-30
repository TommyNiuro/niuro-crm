import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeProposal } from "@/lib/proposals";
import { runProposalGeneration } from "@/lib/proposals-ai/run-generation";

// POST /api/proposals/[id]/regenerate
// Re-dispara la generacion IA en background para una propuesta que ya tiene
// transcript (util tras un error). Setea genStatus='generating' y devuelve la
// fila; la generacion corre fire-and-forget y la UI hace polling.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const row = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!row) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }
  if (!row.transcript || !row.transcript.trim()) {
    return NextResponse.json(
      { error: "La propuesta no tiene transcript para regenerar" },
      { status: 400 }
    );
  }
  // Idempotencia: si ya hay una generacion en vuelo, no dispares otra (dos POST
  // concurrentes pisarian la misma fila).
  if (row.genStatus === "generating") {
    return NextResponse.json(
      { error: "Ya hay una generacion en curso para esta propuesta" },
      { status: 409 }
    );
  }

  const updated = db
    .update(proposals)
    .set({ genStatus: "generating", genError: null, updatedAt: new Date() })
    .where(eq(proposals.id, id))
    .returning()
    .get();

  runProposalGeneration(id).catch((err) =>
    console.error(`[proposals] regeneracion ${id} fallo:`, err)
  );

  return NextResponse.json(serializeProposal(updated), { status: 200 });
}
