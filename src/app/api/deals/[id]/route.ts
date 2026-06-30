import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, contacts, proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dealUpdateSchema, validate } from "@/lib/validation";
import { mergeCustomFields, applyCustomFieldsFromBody } from "@/lib/custom-fields";
import { logActivity, diffChanges } from "@/lib/timeline";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";

/** Saca el nombre legible del cliente desde la columna 'client' (JSON o string). */
function parseClientName(raw: unknown): string {
  if (typeof raw !== "string") return "Propuesta";
  try {
    const obj = JSON.parse(raw);
    return typeof obj?.name === "string" ? obj.name : "Propuesta";
  } catch {
    return raw || "Propuesta";
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const deal = db.select().from(deals).where(eq(deals.id, id)).get();

  if (!deal) {
    return NextResponse.json(
      { error: "Deal no encontrado" },
      { status: 404 }
    );
  }

  // Capa relacional: el contacto dueño + las propuestas vinculadas al deal.
  const contact = deal.contactId
    ? db.select({ id: contacts.id, name: contacts.name }).from(contacts).where(eq(contacts.id, deal.contactId)).get()
    : null;

  const dealProposals = db
    .select({ id: proposals.id, client: proposals.client, role: proposals.role, status: proposals.status })
    .from(proposals)
    .where(eq(proposals.dealId, id))
    .all()
    .map((p) => ({ ...p, clientName: parseClientName(p.client) }));

  const [withCustom] = mergeCustomFields("deals", [deal]);
  return NextResponse.json({ ...withCustom, contact, proposals: dealProposals });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let raw;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = validate(dealUpdateSchema, raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  const existing = db.select().from(deals).where(eq(deals.id, id)).get();

  if (!existing) {
    return NextResponse.json(
      { error: "Deal no encontrado" },
      { status: 404 }
    );
  }

  // Only allow updating specific fields
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.value !== undefined) updateData.value = body.value;
  if (body.stageId !== undefined) updateData.stageId = body.stageId;
  if (body.contactId !== undefined) updateData.contactId = body.contactId;
  if (body.expectedClose !== undefined) {
    updateData.expectedClose = body.expectedClose ? new Date(body.expectedClose) : null;
  }
  if (body.probability !== undefined) {
    updateData.probability = Math.max(0, Math.min(100, Number(body.probability)));
  }
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.deletedAt === null) updateData.deletedAt = null; // restaurar desde papelera (b7)

  const result = db
    .update(deals)
    .set(updateData)
    .where(eq(deals.id, id))
    .returning()
    .get();

  if (raw && typeof raw === "object") applyCustomFieldsFromBody("deals", id, raw as Record<string, unknown>);

  if (body.deletedAt === null && existing.deletedAt) {
    logActivity("deals", id, "restored");
  } else {
    logActivity("deals", id, "updated", diffChanges(existing, updateData, Object.keys(updateData).filter((k) => k !== "updatedAt")));
  }

  const [merged] = mergeCustomFields("deals", [result]);
  dispatchRecordEvent("deals", "updated", result as { id: string } & Record<string, unknown>);
  return NextResponse.json(merged);
}

// DELETE soft por defecto (papelera b7): deleted_at = ahora. ?hard=1 borra la fila.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const hard = new URL(request.url).searchParams.get("hard") === "1";

  const existing = db.select().from(deals).where(eq(deals.id, id)).get();

  if (!existing) {
    return NextResponse.json(
      { error: "Deal no encontrado" },
      { status: 404 }
    );
  }

  if (hard) db.delete(deals).where(eq(deals.id, id)).run();
  else db.update(deals).set({ deletedAt: new Date() }).where(eq(deals.id, id)).run();
  logActivity("deals", id, hard ? "deleted" : "deleted");
  dispatchRecordEvent("deals", "deleted", existing as { id: string } & Record<string, unknown>);
  return NextResponse.json({ success: true });
}
