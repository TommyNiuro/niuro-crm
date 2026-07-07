import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeProposal } from "@/lib/proposals";
import { refineProposal } from "@/lib/proposals-ai/refine";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";

export const dynamic = "force-dynamic";

// POST /api/proposals/[id]/refine { instruction: string }
// Chat de ajustes: aplica un cambio puntual sobre una propuesta YA generada sin
// regenerarla completa. Devuelve { proposal, explanation, changedFields }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return NextResponse.json({ error: "instruction es requerido" }, { status: 400 });
  }

  const row = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!row) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  if (row.genStatus === "generating") {
    return NextResponse.json(
      { error: "La propuesta todavia se esta generando. Espera a que termine." },
      { status: 409 },
    );
  }

  const existing = serializeProposal(row);

  try {
    const { dbPatch, changedFields, explanation } = await refineProposal(existing, instruction);

    if (changedFields.length === 0) {
      return NextResponse.json({
        proposal: existing,
        explanation: explanation || "No encontre nada que cambiar con esa instruccion.",
        changedFields: [],
      });
    }

    const updated = db
      .update(proposals)
      .set({ ...dbPatch, updatedAt: new Date() })
      .where(eq(proposals.id, id))
      .returning()
      .get();

    dispatchRecordEvent("proposals", "updated", updated as { id: string } & Record<string, unknown>);

    return NextResponse.json({
      proposal: serializeProposal(updated),
      explanation,
      changedFields,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `No se pudo aplicar el ajuste: ${msg}` }, { status: 500 });
  }
}
