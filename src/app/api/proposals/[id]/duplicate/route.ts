import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeProposal } from "@/lib/proposals";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";

export const dynamic = "force-dynamic";

// POST /api/proposals/[id]/duplicate -> crea una copia como draft.
// Copia el contenido editorial completo (para poder ajustar y reenviar a otro
// cliente/rol rapido) pero resetea todo lo que es especifico de UN envio:
// status, fechas del pipeline, generacion IA en curso y el share token (una
// propuesta nueva no deberia heredar el link publico de otra).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const source = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!source) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

  const now = new Date();
  const copy = db
    .insert(proposals)
    .values({
      contactId: source.contactId,
      dealId: source.dealId,
      mode: source.mode,
      status: "draft",
      date: source.date,
      client: source.client,
      role: source.role,
      duration: source.duration,
      transcript: source.transcript,
      notes: source.notes,
      pricing: source.pricing,
      summary: source.summary,
      context: source.context,
      cards: source.cards,
      roadmap: source.roadmap,
      team: source.team,
      risks: source.risks,
      generated: source.generated,
      priority: source.priority,
      genStatus: source.generated ? "ready" : null,
      genError: null,
      shareToken: null,
      sentAt: null,
      signedAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  dispatchRecordEvent("proposals", "created", copy as { id: string } & Record<string, unknown>);
  return NextResponse.json(serializeProposal(copy), { status: 201 });
}
