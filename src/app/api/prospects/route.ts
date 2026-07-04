import { NextResponse } from "next/server";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { desc } from "drizzle-orm";
import { serializeProspect } from "@/lib/prospect-serialize";

// Solo-GET sin request: sin esto Next lo prerenderiza estático en el build y
// hornea la respuesta de la DB de dev (vacía) en vez de leer en runtime.
export const dynamic = "force-dynamic";

// GET /api/prospects → todas, más nuevas/calientes primero. El filtrado fino
// (urgencia, días abierto, estado) es client-side en el record-view.
export async function GET() {
  const rows = db.select().from(prospects).orderBy(desc(prospects.score)).all();
  return NextResponse.json(rows.map(serializeProspect));
}
