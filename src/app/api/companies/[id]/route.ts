import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies, contacts, deals } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { companyUpdateSchema, validate } from "@/lib/validation";
import { mergeCustomFields, applyCustomFieldsFromBody } from "@/lib/custom-fields";
import { logActivity, diffChanges } from "@/lib/timeline";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const company = db.select().from(companies).where(eq(companies.id, id)).get();
  if (!company) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  // Capa relacional por texto (la FK normalizada llega en una iteración futura):
  // contactos cuyo company == nombre de la empresa (case-insensitive) y sus deals.
  const key = company.name.trim().toLowerCase();
  const companyContacts = db
    .select({ id: contacts.id, name: contacts.name, email: contacts.email, stage: contacts.stage, score: contacts.score })
    .from(contacts)
    .where(and(eq(contacts.archived, false), sql`lower(trim(${contacts.company})) = ${key}`))
    .all();

  const contactIds = companyContacts.map((c) => c.id);
  const companyDeals = contactIds.length
    ? db
        .select({ id: deals.id, title: deals.title, value: deals.value, contactId: deals.contactId })
        .from(deals)
        .where(inArray(deals.contactId, contactIds))
        .all()
    : [];

  const [withCustom] = mergeCustomFields("companies", [company]);
  return NextResponse.json({
    ...withCustom,
    contacts: companyContacts,
    deals: companyDeals,
  });
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

  const parsed = validate(companyUpdateSchema, raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  const existing = db.select().from(companies).where(eq(companies.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.domain !== undefined) updateData.domain = body.domain;
  if (body.industry !== undefined) updateData.industry = body.industry;
  if (body.size !== undefined) updateData.size = body.size;
  if (body.country !== undefined) updateData.country = body.country;
  if (body.linkedin !== undefined) updateData.linkedin = body.linkedin;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.archived !== undefined) updateData.archived = !!body.archived;
  if (body.deletedAt === null) updateData.deletedAt = null; // restaurar desde papelera (b7)

  try {
    const result = db.update(companies).set(updateData).where(eq(companies.id, id)).returning().get();
    if (raw && typeof raw === "object") applyCustomFieldsFromBody("companies", id, raw as Record<string, unknown>);
    if (body.deletedAt === null && existing.deletedAt) {
      logActivity("companies", id, "restored");
    } else {
      logActivity("companies", id, "updated", diffChanges(existing, updateData, Object.keys(updateData).filter((k) => k !== "updatedAt")));
    }
    const [merged] = mergeCustomFields("companies", [result]);
    dispatchRecordEvent("companies", "updated", result as { id: string } & Record<string, unknown>);
    return NextResponse.json(merged);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    const dup = /UNIQUE|constraint/i.test(msg);
    return NextResponse.json(
      { error: dup ? "Ya existe una empresa con ese nombre" : `Error al actualizar: ${msg}` },
      { status: dup ? 409 : 500 }
    );
  }
}

// DELETE soft por defecto (papelera b7): deleted_at = ahora. ?hard=1 borra la fila.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const existing = db.select().from(companies).where(eq(companies.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }
  // Borrar la empresa NO huérfana nada: los contactos guardan company como texto
  // libre (la relación es derivada, no una FK).
  if (hard) db.delete(companies).where(eq(companies.id, id)).run();
  else db.update(companies).set({ deletedAt: new Date() }).where(eq(companies.id, id)).run();
  logActivity("companies", id, "deleted");
  dispatchRecordEvent("companies", "deleted", existing as { id: string } & Record<string, unknown>);
  return NextResponse.json({ success: true });
}
