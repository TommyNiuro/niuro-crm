import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { eq, like, or, asc, and, sql, isNull, isNotNull } from "drizzle-orm";
import { companyCreateSchema, validate } from "@/lib/validation";
import { mergeCustomFields } from "@/lib/custom-fields";
import { dispatchRecordEvent } from "@/lib/workflows/dispatch";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const includeArchived = searchParams.get("includeArchived") === "1";
  const deleted = searchParams.get("deleted") === "1"; // papelera: solo borrados
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "500", 10) || 500, 1), 1000);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

  const conditions = [];
  // Papelera (b7): por defecto solo vivos; ?deleted=1 lista solo los borrados.
  conditions.push(deleted ? isNotNull(companies.deletedAt) : isNull(companies.deletedAt));
  if (!includeArchived) conditions.push(eq(companies.archived, false));
  if (search) {
    conditions.push(
      or(
        like(companies.name, `%${search}%`),
        like(companies.domain, `%${search}%`),
        like(companies.industry, `%${search}%`),
        like(companies.country, `%${search}%`)
      )
    );
  }

  const results = db
    .select()
    .from(companies)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(companies.name))
    .limit(limit)
    .offset(offset)
    .all();

  // Contactos por empresa en UNA query agrupada (no N+1). La relación es por
  // texto: contacts.company normalizado (lower+trim) == lower+trim del nombre.
  const counts = db
    .select({
      key: sql<string>`lower(trim(${contacts.company}))`,
      n: sql<number>`count(*)`,
    })
    .from(contacts)
    .where(eq(contacts.archived, false))
    .groupBy(sql`lower(trim(${contacts.company}))`)
    .all();
  const byKey = new Map(counts.map((c) => [c.key, c.n]));
  const withCounts = results.map((c) => ({
    ...c,
    contactsCount: byKey.get(c.name.trim().toLowerCase()) ?? 0,
  }));

  return NextResponse.json(mergeCustomFields("companies", withCounts));
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = validate(companyCreateSchema, body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name, domain, industry, size, country, linkedin, notes } = parsed.data;

  try {
    const now = new Date();
    const result = db
      .insert(companies)
      .values({
        name,
        domain: domain || null,
        industry: industry || null,
        size: size || null,
        country: country || null,
        linkedin: linkedin || null,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    dispatchRecordEvent("companies", "created", result as { id: string } & Record<string, unknown>);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    // El índice único NOCASE rebota nombres duplicados con un mensaje legible.
    const msg = error instanceof Error ? error.message : "Unknown";
    const dup = /UNIQUE|constraint/i.test(msg);
    return NextResponse.json(
      { error: dup ? "Ya existe una empresa con ese nombre" : `Error al crear empresa: ${msg}` },
      { status: dup ? 409 : 500 }
    );
  }
}
