import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobDescriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  serializeJobDescription,
  stringifyJsonField,
  JOB_DESCRIPTION_STATUSES,
} from "@/lib/job-descriptions";

export const dynamic = "force-dynamic";

// GET /api/job-descriptions/[id] -> una JD con los campos JSON parseados.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(jobDescriptions).where(eq(jobDescriptions.id, id)).get();
  if (!row) return NextResponse.json({ error: "Descripción de cargo no encontrada" }, { status: 404 });
  return NextResponse.json(serializeJobDescription(row));
}

// PUT /api/job-descriptions/[id] -> actualiza cualquier subconjunto de campos.
// Los campos JSON (client/conditions/profile/viability + arrays) se re-serializan.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const existing = db.select().from(jobDescriptions).where(eq(jobDescriptions.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Descripción de cargo no encontrada" }, { status: 404 });

  if (
    body.status !== undefined &&
    !JOB_DESCRIPTION_STATUSES.includes(body.status as (typeof JOB_DESCRIPTION_STATUSES)[number])
  ) {
    return NextResponse.json({ error: `status invalido: ${String(body.status)}` }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  // Texto plano.
  for (const key of ["roleTitle", "about", "roleObjective", "whyCompany", "conditionsClosing", "transcript", "notes"] as const) {
    if (body[key] !== undefined) patch[key] = typeof body[key] === "string" ? body[key] : null;
  }
  if (body.status !== undefined) patch.status = body.status;
  if (body.contactId !== undefined)
    patch.contactId = typeof body.contactId === "string" && body.contactId ? body.contactId : null;
  if (body.dealId !== undefined)
    patch.dealId = typeof body.dealId === "string" && body.dealId ? body.dealId : null;
  if (body.generated !== undefined) patch.generated = !!body.generated;

  // Campos JSON.
  const jsonKeys = [
    "client",
    "conditions",
    "responsibilities",
    "profile",
    "powerSkills",
    "notLookingFor",
    "successIndicators",
    "onboarding",
    "viability",
  ] as const;
  for (const key of jsonKeys) {
    if (body[key] !== undefined) {
      const serialized = stringifyJsonField(body[key]);
      if (key === "client" && (serialized === null || serialized === undefined)) {
        return NextResponse.json({ error: "client no puede quedar vacío" }, { status: 400 });
      }
      patch[key] = serialized ?? null;
    }
  }

  const updated = db
    .update(jobDescriptions)
    .set(patch)
    .where(eq(jobDescriptions.id, id))
    .returning()
    .get();

  return NextResponse.json(serializeJobDescription(updated));
}

// DELETE /api/job-descriptions/[id] -> soft delete: status='archived'.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = db.select().from(jobDescriptions).where(eq(jobDescriptions.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Descripción de cargo no encontrada" }, { status: 404 });

  const archived = db
    .update(jobDescriptions)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(jobDescriptions.id, id))
    .returning()
    .get();

  return NextResponse.json(serializeJobDescription(archived));
}
