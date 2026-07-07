import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { automations, leadCandidates, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = db.select().from(automations).all();
  // Métricas reales para la automatización de detección de leads.
  const detected = db.select().from(leadCandidates).all().length;
  const approved = db
    .select()
    .from(contacts)
    .where(eq(contacts.source, "whatsapp"))
    .all().length;
  const enriched = rows.map((a) => {
    if (a.id === "scan") {
      const success = detected > 0 ? Math.round((approved / detected) * 100) : 0;
      return { ...a, processed: detected, successPct: success };
    }
    return a;
  });
  return NextResponse.json(enriched);
}

export async function PATCH(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { id, active } = body || {};
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  db.update(automations)
    .set({ active: !!active })
    .where(eq(automations.id, id))
    .run();
  return NextResponse.json({ ok: true });
}
