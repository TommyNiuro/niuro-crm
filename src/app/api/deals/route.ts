import { NextRequest, NextResponse } from "next/server";
import { loggedErrorDetail } from "@/lib/api-error";
import { db } from "@/db";
import { deals, contacts, pipelineStages } from "@/db/schema";
import { eq, desc, isNull, isNotNull } from "drizzle-orm";
import { dealCreateSchema, validate } from "@/lib/validation";
import { mergeCustomFields } from "@/lib/custom-fields";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";
import { mirrorDealsToContact } from "@/lib/deal-sync";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Papelera (b7): por defecto solo vivos; ?deleted=1 lista solo los borrados.
  const deleted = new URL(request.url).searchParams.get("deleted") === "1";
  const results = db
    .select({
      id: deals.id,
      title: deals.title,
      value: deals.value,
      stageId: deals.stageId,
      contactId: deals.contactId,
      expectedClose: deals.expectedClose,
      probability: deals.probability,
      notes: deals.notes,
      createdAt: deals.createdAt,
      updatedAt: deals.updatedAt,
      contactName: contacts.name,
      contactEmail: contacts.email,
      contactTemperature: contacts.temperature,
      stageName: pipelineStages.name,
      stageColor: pipelineStages.color,
      stageOrder: pipelineStages.order,
      stageIsWon: pipelineStages.isWon,
      stageIsLost: pipelineStages.isLost,
    })
    .from(deals)
    .leftJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(deleted ? isNotNull(deals.deletedAt) : isNull(deals.deletedAt))
    .orderBy(desc(deals.createdAt))
    .all();

  return NextResponse.json(mergeCustomFields("deals", results));
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const parsed = validate(dealCreateSchema, body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { title, value, stageId, contactId, expectedClose, probability, notes } = parsed.data;

  // Get first stage if none provided
  let finalStageId = stageId;
  if (!finalStageId) {
    const firstStage = db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.pipeline, "prospectos"))
      .orderBy(pipelineStages.order)
      .limit(1)
      .get();
    finalStageId = firstStage?.id;
  }

  if (!finalStageId) {
    return NextResponse.json(
      { error: "No hay etapas de pipeline configuradas" },
      { status: 400 }
    );
  }

  try {
    const now = new Date();
    const result = db
      .insert(deals)
      .values({
        title,
        value: value || 0,
        stageId: finalStageId,
        contactId,
        expectedClose: expectedClose ? new Date(expectedClose) : null,
        probability: Math.max(0, Math.min(100, Number(probability) || 0)),
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // El deal es la fuente de verdad del dinero: re-espejar el contacto (Fase 1).
    mirrorDealsToContact(result.contactId);
    dispatchRecordEvent("deals", "created", result as { id: string } & Record<string, unknown>);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const msg = loggedErrorDetail(error);
    if (msg.includes("FOREIGN KEY")) {
      return NextResponse.json(
        { error: "Contacto no encontrado" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: `Error al crear deal: ${msg}` },
      { status: 500 }
    );
  }
}
