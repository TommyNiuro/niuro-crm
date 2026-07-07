import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobDescriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeJobDescription } from "@/lib/job-descriptions";
import { refineJobDescription } from "@/lib/jd-ai/refine";

export const dynamic = "force-dynamic";

// POST /api/job-descriptions/[id]/refine { instruction: string }
// Chat de ajustes: aplica un cambio puntual sobre una JD YA generada.
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

  const row = db.select().from(jobDescriptions).where(eq(jobDescriptions.id, id)).get();
  if (!row) return NextResponse.json({ error: "Descripción de cargo no encontrada" }, { status: 404 });
  if (row.genStatus === "generating") {
    return NextResponse.json(
      { error: "La descripción todavía se está generando. Espera a que termine." },
      { status: 409 },
    );
  }

  const existing = serializeJobDescription(row);

  try {
    const { dbPatch, changedFields, explanation } = await refineJobDescription(existing, instruction);

    if (changedFields.length === 0) {
      return NextResponse.json({
        jobDescription: existing,
        explanation: explanation || "No encontré nada que cambiar con esa instrucción.",
        changedFields: [],
      });
    }

    const updated = db
      .update(jobDescriptions)
      .set({ ...dbPatch, updatedAt: new Date() })
      .where(eq(jobDescriptions.id, id))
      .returning()
      .get();

    return NextResponse.json({
      jobDescription: serializeJobDescription(updated),
      explanation,
      changedFields,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `No se pudo aplicar el ajuste: ${msg}` }, { status: 500 });
  }
}
