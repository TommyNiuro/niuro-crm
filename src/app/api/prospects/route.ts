import { NextResponse } from "next/server";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { desc } from "drizzle-orm";
import { serializeProspect } from "@/lib/prospect-serialize";

// GET /api/prospects → todas, más nuevas/calientes primero. El filtrado fino
// (urgencia, días abierto, estado) es client-side en el record-view.
export async function GET() {
  const rows = db.select().from(prospects).orderBy(desc(prospects.score)).all();
  return NextResponse.json(rows.map(serializeProspect));
}
