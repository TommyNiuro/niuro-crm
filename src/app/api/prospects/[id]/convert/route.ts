import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { prospects, contacts, tasks, activities, stepTransitions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getStageNames, stageCfgFor } from "@/lib/stages";

// POST /api/prospects/[id]/convert → pasa el prospecto al Pipeline como lead
// (contacto + tarea de contactar + transición + actividad, mismo patrón que
// image-leads/approve). Idempotente: si ya tiene contacto vinculado, lo devuelve.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(prospects).where(eq(prospects.id, id)).get();
  if (!row) return NextResponse.json({ error: "Prospecto no encontrado" }, { status: 404 });

  if (row.knownContactId) {
    const existing = db.select().from(contacts).where(eq(contacts.id, row.knownContactId)).get();
    if (existing) return NextResponse.json({ contact: existing, alreadyExists: true });
  }

  const roles = JSON.parse(row.roles || "[]") as string[];
  const stack = JSON.parse(row.stack || "[]") as string[];
  const name = row.contactName || row.company;
  const temperature = row.score >= 70 ? "hot" : row.score >= 40 ? "warm" : "cold";
  const now = new Date();

  const metaLines = [
    `Empresa: ${row.company}`,
    roles.length ? `Buscando: ${roles.join("; ")}` : null,
    stack.length ? `Stack: ${stack.join(", ")}` : null,
    `Vacantes abiertas: ${row.jobCount} (la más vieja hace ${row.daysOpen} días)`,
    row.url ? `Aviso: ${row.url}` : null,
    row.contactTitle ? `Cargo del contacto: ${row.contactTitle}` : null,
    row.contactLinkedin ? `LinkedIn: ${row.contactLinkedin}` : null,
  ].filter(Boolean);

  const defaultStage = getStageNames()[0] ?? "Prospecto";
  const prospectProb = stageCfgFor(defaultStage, 0).probability;

  const contact = db.transaction((tx) => {
    const created = tx
      .insert(contacts)
      .values({
        name,
        email: row.contactEmail,
        phone: row.contactPhone,
        company: row.company,
        jobDescription: roles.join("; ") || null,
        source: "prospeccion",
        temperature,
        score: row.score,
        stage: defaultStage,
        probability: prospectProb,
        valueCents: 0,
        tags: JSON.stringify(["Prospección"]),
        notes: metaLines.join("\n"),
        lastInteractionAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    const due = new Date(now.getTime() + 2 * 86400000);
    const taskTitle = `Contactar a ${row.contactName || row.company}`;
    tx.insert(tasks)
      .values({
        contactId: created.id,
        title: taskTitle,
        stepName: defaultStage,
        dueAt: due,
        status: "open",
        createdAt: now,
      })
      .run();
    tx.update(contacts)
      .set({ nextAction: taskTitle, nextStepDue: due, updatedAt: now })
      .where(eq(contacts.id, created.id))
      .run();
    tx.insert(stepTransitions)
      .values({ contactId: created.id, fromStep: null, toStep: defaultStage, occurredAt: now })
      .run();
    tx.insert(activities)
      .values({
        type: "note",
        description: `Lead creado desde Prospección (${row.jobCount} vacantes abiertas, urgencia ${row.urgency}).`,
        contactId: created.id,
        dealId: null,
        scheduledAt: null,
        completedAt: now,
        createdAt: now,
      })
      .run();
    tx.update(prospects)
      .set({ knownContactId: created.id, status: "contacted", updatedAt: now })
      .where(eq(prospects.id, id))
      .run();
    return created;
  });

  return NextResponse.json({ contact }, { status: 201 });
}
