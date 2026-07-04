import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findHiringContact, apolloKey } from "@/lib/apollo";
import { serializeProspect } from "@/lib/prospect-serialize";

// POST /api/prospects/[id]/enrich → busca el decisor tech en Apollo y guarda
// nombre/cargo/email/teléfono/linkedin. Consume créditos del plan de Apollo.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(prospects).where(eq(prospects.id, id)).get();
  if (!row) return NextResponse.json({ error: "Prospecto no encontrado" }, { status: 404 });
  if (!apolloKey()) {
    return NextResponse.json(
      { error: "Apollo no configurado: pegá tu API key en la barra superior de Prospección" },
      { status: 400 }
    );
  }

  try {
    const contact = await findHiringContact(row.company, row.domain);
    if (!contact) {
      return NextResponse.json(
        { error: `Apollo no encontró un decisor tech en ${row.company}` },
        { status: 404 }
      );
    }
    const updated = db
      .update(prospects)
      .set({
        contactName: contact.name,
        contactTitle: contact.title,
        contactEmail: contact.email,
        contactPhone: contact.phone,
        contactLinkedin: contact.linkedin,
        domain: row.domain || contact.organizationDomain,
        apolloEnrichedAt: new Date(),
        status: row.status === "new" ? "enriched" : row.status,
        updatedAt: new Date(),
      })
      .where(eq(prospects.id, id))
      .returning()
      .get();
    return NextResponse.json(serializeProspect(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de Apollo";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
