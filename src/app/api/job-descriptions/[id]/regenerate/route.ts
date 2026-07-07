import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobDescriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeJobDescription } from "@/lib/job-descriptions";
import { runJobDescriptionGeneration } from "@/lib/jd-ai/run-generation";

// POST /api/job-descriptions/[id]/regenerate
// Re-dispara la generación IA en background para una JD que ya tiene transcript
// (útil tras un error). Setea genStatus='generating'; corre fire-and-forget.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(jobDescriptions).where(eq(jobDescriptions.id, id)).get();
  if (!row) {
    return NextResponse.json({ error: "Descripción de cargo no encontrada" }, { status: 404 });
  }
  if (!row.transcript || !row.transcript.trim()) {
    return NextResponse.json(
      { error: "La descripción no tiene transcript para regenerar" },
      { status: 400 },
    );
  }
  if (row.genStatus === "generating") {
    return NextResponse.json(
      { error: "Ya hay una generación en curso para esta descripción" },
      { status: 409 },
    );
  }

  const updated = db
    .update(jobDescriptions)
    .set({ genStatus: "generating", genError: null, updatedAt: new Date() })
    .where(eq(jobDescriptions.id, id))
    .returning()
    .get();

  runJobDescriptionGeneration(id).catch((err) =>
    console.error(`[job-descriptions] regeneración ${id} falló:`, err),
  );

  return NextResponse.json(serializeJobDescription(updated), { status: 200 });
}
