import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeProposal } from "@/lib/proposals";
import { renderProposalStandaloneHtml } from "@/lib/proposals-html";

export const dynamic = "force-dynamic";

// GET /api/proposals/[id]/html -> { html } standalone (fuentes + CSS + markup
// inline). Usado por la pestaña "Codigo HTML" del detalle y por "Exportar
// HTML" (el frontend arma el Blob/download con este string, mismo patron que
// Cotizador Niuro).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!row) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

  const client = serializeProposal(row).client;
  try {
    const html = await renderProposalStandaloneHtml(id, client?.name);
    return NextResponse.json({ html });
  } catch (err) {
    return NextResponse.json(
      { error: `No se pudo generar el HTML: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
