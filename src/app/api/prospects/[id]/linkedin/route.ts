import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCompanyProfile, linkedinSessionExists, checkAndRecordLinkedinBudget } from "@/lib/linkedin-mcp";
import { serializeProspect } from "@/lib/prospect-serialize";

// POST /api/prospects/[id]/linkedin → trae industria/tamaño/sede/descripción
// de la empresa en LinkedIn (mejora: "saber más del cliente antes de
// contactar"). Manual únicamente (no en el scan diario) y comparte el
// presupuesto semanal con la búsqueda de empleos, ver linkedin-mcp.ts.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(prospects).where(eq(prospects.id, id)).get();
  if (!row) return NextResponse.json({ error: "Prospecto no encontrado" }, { status: 404 });

  if (!linkedinSessionExists()) {
    return NextResponse.json(
      { error: "LinkedIn no configurado: correr 'uvx mcp-server-linkedin@latest --import-from-browser' en Terminal" },
      { status: 400 }
    );
  }
  if (!checkAndRecordLinkedinBudget()) {
    return NextResponse.json(
      { error: "Se alcanzó el presupuesto semanal de consultas a LinkedIn, probá de nuevo en unos días" },
      { status: 429 }
    );
  }

  try {
    const info = await getCompanyProfile(row.company);
    const updated = db
      .update(prospects)
      .set({ linkedinCompanyInfo: JSON.stringify(info), updatedAt: new Date() })
      .where(eq(prospects.id, id))
      .returning()
      .get();
    return NextResponse.json(serializeProspect(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de LinkedIn";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
