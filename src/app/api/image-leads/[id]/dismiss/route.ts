import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { imageLeads } from "@/db/schema";
import { eq } from "drizzle-orm";

// POST /api/image-leads/[id]/dismiss → marca la captura como descartada.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(imageLeads).where(eq(imageLeads.id, id)).get();
  if (!row) {
    return NextResponse.json({ error: "Captura no encontrada" }, { status: 404 });
  }
  db.update(imageLeads)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(eq(imageLeads.id, id))
    .run();
  return NextResponse.json({ ok: true, status: "dismissed" });
}
