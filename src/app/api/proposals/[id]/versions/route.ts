import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals, proposalVersions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { serializeProposal } from "@/lib/proposals";

export const dynamic = "force-dynamic";

// GET /api/proposals/[id]/versions -> snapshots guardados, mas nuevo primero.
// Devuelve metadata liviana (sin el snapshot completo): el detalle se pide al
// restaurar. Max 10 mostrados (ver limite de guardado en el POST).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = db
    .select({
      id: proposalVersions.id,
      label: proposalVersions.label,
      createdAt: proposalVersions.createdAt,
    })
    .from(proposalVersions)
    .where(eq(proposalVersions.proposalId, id))
    .orderBy(desc(proposalVersions.createdAt))
    .all();

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : r.createdAt,
    })),
  );
}

// POST /api/proposals/[id]/versions { label? } -> guarda un snapshot manual de
// la propuesta tal como esta ahora. Sin diff visual (no pedido): guardar y
// restaurar alcanza para deshacer un cambio que no gusto.
// Cap de 10 versiones por propuesta (FIFO): borra la mas vieja al superarlo,
// mismo limite que el repo original (propuestas-niuro).
const MAX_VERSIONS = 10;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const row = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!row) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // body vacio esta OK, label es opcional
  }
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;

  const now = new Date();
  const created = db
    .insert(proposalVersions)
    .values({
      proposalId: id,
      snapshot: JSON.stringify(serializeProposal(row)),
      label,
      createdAt: now,
    })
    .returning()
    .get();

  // FIFO: si hay mas de MAX_VERSIONS, borra las mas viejas.
  const existing = db
    .select({ id: proposalVersions.id })
    .from(proposalVersions)
    .where(eq(proposalVersions.proposalId, id))
    .orderBy(desc(proposalVersions.createdAt))
    .all();
  const toDelete = existing.slice(MAX_VERSIONS).map((v) => v.id);
  for (const vid of toDelete) {
    db.delete(proposalVersions).where(eq(proposalVersions.id, vid)).run();
  }

  return NextResponse.json(
    { id: created.id, label: created.label, createdAt: created.createdAt.getTime() },
    { status: 201 },
  );
}
