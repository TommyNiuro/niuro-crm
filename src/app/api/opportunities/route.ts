import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { groupOpportunities } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Radar de grupos: lista de oportunidades detectadas en grupos de WhatsApp.
// ?counts=1 devuelve solo los totales por estado (para las pestañas).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // new | contacted | discarded | null=todas
  try {
    if (searchParams.get("counts") === "1") {
      const all = db
        .select({ status: groupOpportunities.status })
        .from(groupOpportunities)
        .all();
      const counts = { new: 0, contacted: 0, discarded: 0 } as Record<string, number>;
      for (const r of all) counts[r.status] = (counts[r.status] ?? 0) + 1;
      return NextResponse.json(counts);
    }
    const base = db.select().from(groupOpportunities);
    const rows = (status
      ? base.where(eq(groupOpportunities.status, status))
      : base
    )
      .orderBy(desc(groupOpportunities.score), desc(groupOpportunities.createdAt))
      .limit(300)
      .all();
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json(
      { error: `Error al leer oportunidades: ${e instanceof Error ? e.message : "desconocido"}` },
      { status: 500 }
    );
  }
}
