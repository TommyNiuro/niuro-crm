import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, stepTransitions } from "@/db/schema";
import { eq, like, or, desc, and, inArray, isNull, isNotNull } from "drizzle-orm";
import { contactCreateSchema, validate } from "@/lib/validation";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";
import { mergeCustomFields } from "@/lib/custom-fields";
import { canonicalJid, phonebookNames } from "@/lib/lid";

// Nombres que en realidad son un número/JID crudo (contactos importados de
// WhatsApp sin nombre real). Solo dígitos, con separadores opcionales.
const JID_NAME_RE = /^\+?\d[\d\s.-]{5,}$/;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const temperature = searchParams.get("temperature");
  const source = searchParams.get("source");
  const type = searchParams.get("type"); // lead | client | engineer
  const includeArchived = searchParams.get("includeArchived") === "1";
  const deleted = searchParams.get("deleted") === "1"; // papelera: solo borrados
  // || fallback: parseInt("abc") = NaN rompía la query con 500 (auditoría 2026-06-09)
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "500", 10) || 500, 1), 1000);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

  const conditions = [];
  // Papelera (b7): por defecto solo registros vivos; ?deleted=1 lista solo los borrados.
  conditions.push(deleted ? isNotNull(contacts.deletedAt) : isNull(contacts.deletedAt));
  if (!includeArchived) conditions.push(eq(contacts.archived, false));
  if (search) {
    conditions.push(
      or(
        like(contacts.name, `%${search}%`),
        like(contacts.email, `%${search}%`),
        like(contacts.company, `%${search}%`)
      )
    );
  }
  if (temperature) conditions.push(eq(contacts.temperature, temperature));
  if (source) conditions.push(eq(contacts.source, source));
  if (type) conditions.push(eq(contacts.contactType, type));

  const results = db
    .select()
    .from(contacts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(contacts.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  // Fecha de entrada a la etapa actual: última transición hacia esa etapa.
  // Fallback: createdAt (contactos que nunca cambiaron de etapa).
  // Filtramos por los contactos de ESTA página (inArray sobre el índice
  // idx_step_transitions_contact) en vez de cargar la tabla entera: el .all()
  // crecía sin límite con cada cambio de etapa (auditoría 2026-06-22).
  const pageIds = results.map((c) => c.id);
  const transitions = pageIds.length
    ? db
        .select({ contactId: stepTransitions.contactId, toStep: stepTransitions.toStep, occurredAt: stepTransitions.occurredAt })
        .from(stepTransitions)
        .where(inArray(stepTransitions.contactId, pageIds))
        .all()
    : [];
  const enteredAt = new Map<string, number>();
  for (const t of transitions) {
    const ts = new Date(t.occurredAt).getTime();
    if (isNaN(ts)) continue;
    const key = `${t.contactId}:${t.toStep}`;
    if (!enteredAt.has(key) || ts > enteredAt.get(key)!) enteredAt.set(key, ts);
  }
  // Nombre visible: si el contacto quedó con el número/JID como nombre (import
  // de WhatsApp sin nombre), se resuelve contra la agenda real del teléfono.
  // Solo presentación: no se escribe en la DB.
  const pb = phonebookNames();
  const withStage = results.map((c) => {
    const ts = enteredAt.get(`${c.id}:${c.stage}`) ?? new Date(c.createdAt).getTime();
    const name =
      c.whatsappJid && JID_NAME_RE.test(c.name)
        ? pb.get(canonicalJid(c.whatsappJid)) ?? c.name
        : c.name;
    return { ...c, name, stageEnteredAt: isNaN(ts) ? null : new Date(ts).toISOString() };
  });
  return NextResponse.json(mergeCustomFields("contacts", withStage));
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = validate(contactCreateSchema, body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name, email, phone, company, source, temperature, score, notes } =
    parsed.data;

  try {
    const now = new Date();
    const result = db
      .insert(contacts)
      .values({
        name,
        email: email || null,
        phone: phone || null,
        company: company || null,
        source: source || "otro",
        temperature: temperature || "cold",
        score: score || 0,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    dispatchRecordEvent("contacts", "created", result as { id: string } & Record<string, unknown>);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: `Error al crear contacto: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
