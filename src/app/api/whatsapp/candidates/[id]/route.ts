import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leadCandidates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { promoteCandidate } from "@/lib/promote-lead";

// PATCH /api/whatsapp/candidates/[id] { action: "approve" | "dismiss" }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const action = body?.action;

  const candidate = db
    .select()
    .from(leadCandidates)
    .where(eq(leadCandidates.id, id))
    .get();

  if (!candidate) {
    return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
  }

  const now = new Date();

  if (action === "dismiss") {
    db.update(leadCandidates)
      .set({ status: "dismissed", updatedAt: now })
      .where(eq(leadCandidates.id, id))
      .run();
    return NextResponse.json({ ok: true, status: "dismissed" });
  }

  if (action === "approve") {
    const contact = promoteCandidate(candidate, { auto: false });
    return NextResponse.json({ ok: true, status: "approved", contact });
  }

  return NextResponse.json({ error: "action debe ser 'approve' o 'dismiss'" }, { status: 400 });
}
