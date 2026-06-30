import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { groupOpportunities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/timeline";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";

const VALID_STATUS = new Set(["new", "contacted", "discarded"]);

// Cambiar estado de una oportunidad del radar (nueva → contactada/descartada).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  const { status } = body as { status?: string };
  if (!status || !VALID_STATUS.has(status)) {
    return NextResponse.json({ error: "status debe ser new|contacted|discarded" }, { status: 400 });
  }

  const existing = db.select({ status: groupOpportunities.status }).from(groupOpportunities).where(eq(groupOpportunities.id, id)).get();

  const updated = db
    .update(groupOpportunities)
    .set({ status, updatedAt: new Date() })
    .where(eq(groupOpportunities.id, id))
    .returning()
    .get();
  if (!updated) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (existing && existing.status !== status) {
    logActivity("opportunities", id, "updated", { status: { from: existing.status, to: status } });
  }
  // opportunities es metadata-only (sin tabla en el whitelist de record steps del
  // engine): el evento igual dispara workflows con steps http_request/ai_step/etc.
  dispatchRecordEvent("opportunities", "updated", updated as { id: string } & Record<string, unknown>);
  return NextResponse.json(updated);
}
