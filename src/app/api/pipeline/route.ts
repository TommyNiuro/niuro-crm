import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineStages, deals, contacts, stepTransitions } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { STAGE_CFG } from "@/lib/crm-ui";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stages = db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.pipeline, "prospectos"))
      .orderBy(asc(pipelineStages.order))
      .all();

    const allDeals = db
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
        contactTemperature: contacts.temperature,
      })
      .from(deals)
      .leftJoin(contacts, eq(deals.contactId, contacts.id))
      .all();

    const pipeline = stages.map((stage) => ({
      ...stage,
      deals: allDeals.filter((d) => d.stageId === stage.id),
    }));

    return NextResponse.json(pipeline);
  } catch (error) {
    return NextResponse.json(
      { error: `Error al obtener pipeline: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  // Update a single deal's stage (drag and drop)
  if (body.dealId && body.stageId) {
    const existing = db.select().from(deals).where(eq(deals.id, body.dealId)).get();
    if (!existing) {
      return NextResponse.json({ error: "Deal no encontrado" }, { status: 404 });
    }

    // Transacción: deal + contacto + transición se mueven juntos (auditoría 2026-06-09)
    const result = db.transaction(() => {
      const stage = db.select().from(pipelineStages).where(eq(pipelineStages.id, body.stageId)).get();
      // La etapa destino define la probabilidad del deal y del contacto
      const stageProb = stage ? STAGE_CFG[stage.name]?.probability : undefined;
      const updated = db
        .update(deals)
        .set({
          stageId: body.stageId,
          updatedAt: new Date(),
          ...(stageProb !== undefined ? { probability: stageProb } : {}),
        })
        .where(eq(deals.id, body.dealId))
        .returning()
        .get();

      if (stage && existing.contactId) {
        const currentContact = db.select({ stage: contacts.stage }).from(contacts).where(eq(contacts.id, existing.contactId)).get();
        db.update(contacts).set({
          stage: stage.name,
          updatedAt: new Date(),
          ...(stageProb !== undefined ? { probability: stageProb } : {}),
        }).where(eq(contacts.id, existing.contactId)).run();
        db.insert(stepTransitions).values({
          contactId: existing.contactId,
          fromStep: currentContact?.stage ?? null,
          toStep: stage.name,
          occurredAt: new Date(),
        }).run();
      }
      return updated;
    });

    return NextResponse.json(result);
  }

  // Bulk update stages (from /setup or /customize)
  if (body.stages && Array.isArray(body.stages)) {
    // Delete existing stages (only if no deals reference them)
    const existingDeals = db.select().from(deals).all();
    if (existingDeals.length > 0) {
      return NextResponse.json(
        {
          error:
            "No se pueden reemplazar etapas cuando hay deals activos. Elimina los deals primero.",
        },
        { status: 400 }
      );
    }

    // Transacción: si un insert falla a mitad, el CRM no queda sin etapas
    // (auditoría 2026-06-09 — antes era delete + inserts sueltos).
    db.transaction(() => {
      db.delete(pipelineStages).run();
      for (const stage of body.stages) {
        db.insert(pipelineStages)
          .values({
            name: stage.name,
            order: stage.order,
            color: stage.color || "#64748b",
            isWon: stage.isWon || false,
            isLost: stage.isLost || false,
          })
          .run();
      }
    });

    const updated = db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.pipeline, "prospectos"))
      .orderBy(asc(pipelineStages.order))
      .all();

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Request invalido" }, { status: 400 });
}
