import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobDescriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeJobDescription, JOB_DESCRIPTION_STATUSES } from "@/lib/job-descriptions";

// POST /api/job-descriptions/[id]/status  body: { status }
// Cambia el estado (draft|sent|archived). Sin pipeline: la JD no mueve etapas
// (a diferencia de propuestas). Sirve para archivar/restaurar desde el listado.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const status = body.status;
  if (
    typeof status !== "string" ||
    !JOB_DESCRIPTION_STATUSES.includes(status as (typeof JOB_DESCRIPTION_STATUSES)[number])
  ) {
    return NextResponse.json(
      { error: `status es requerido y debe ser uno de: ${JOB_DESCRIPTION_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const existing = db.select().from(jobDescriptions).where(eq(jobDescriptions.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Descripción de cargo no encontrada" }, { status: 404 });

  const updated = db
    .update(jobDescriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(jobDescriptions.id, id))
    .returning()
    .get();

  return NextResponse.json(serializeJobDescription(updated));
}
