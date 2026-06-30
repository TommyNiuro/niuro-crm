import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { imageLeads, contacts, tasks, activities, stepTransitions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { STAGE_CFG } from "@/lib/crm-ui";

// POST /api/image-leads/[id]/approve
// Crea un contacto en etapa Prospecto con los datos extraidos (acepta overrides
// editados desde la UI) y marca la captura como aprobada. Mismo patron que
// /api/whatsapp/save-lead: contacto + tarea + transicion + actividad en una tx.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const row = db.select().from(imageLeads).where(eq(imageLeads.id, id)).get();
  if (!row) {
    return NextResponse.json({ error: "Captura no encontrada" }, { status: 404 });
  }

  // Idempotencia: si ya se aprobo y existe el contacto, devolvelo.
  if (row.status === "approved" && row.contactId) {
    const existing = db.select().from(contacts).where(eq(contacts.id, row.contactId)).get();
    if (existing) return NextResponse.json({ contact: existing, alreadyExists: true }, { status: 200 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Sin body: usamos lo extraido tal cual.
  }

  const pick = (key: string, fallback: string | null): string | null => {
    const v = body[key];
    if (typeof v === "string") return v.trim() || null;
    return fallback;
  };

  const company = pick("company", row.company);
  // Un contacto necesita name (NOT NULL). Para una captura no hay persona: usamos
  // la empresa como nombre (el operador puede editarlo despues en el Directorio).
  const name = pick("name", company) || "Empresa sin nombre";
  const email = pick("contactEmail", row.contactEmail);
  const role = pick("role", row.role);
  const seniority = pick("seniority", row.seniority);
  const contactUrl = pick("contactUrl", row.contactUrl);
  const whatTheyDo = pick("whatTheyDo", row.whatTheyDo);
  const summary = pick("summary", row.summary);
  const editedNotes = pick("notes", row.notes);

  let stack: string[] = [];
  try {
    stack = row.stack ? (JSON.parse(row.stack) as string[]) : [];
  } catch {
    stack = [];
  }

  const score = row.score ?? 0;
  const temperature = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  const now = new Date();

  // Notas combinadas: lo editado + metadata que no tiene columna propia.
  const metaLines: string[] = [];
  if (company) metaLines.push(`Empresa: ${company}`);
  if (role) metaLines.push(`Rol potencial: ${role}${seniority ? ` (${seniority})` : ""}`);
  if (stack.length) metaLines.push(`Stack: ${stack.join(", ")}`);
  if (contactUrl) metaLines.push(`Web: ${contactUrl}`);
  if (summary) metaLines.push(`Resumen IA: ${summary}`);
  const fullNotes = [editedNotes, metaLines.join("\n")].filter(Boolean).join("\n");

  const jobDescription = [whatTheyDo, role ? `Rol potencial: ${role}${seniority ? ` (${seniority})` : ""}` : null]
    .filter(Boolean)
    .join(" ") || null;

  const prospectProb = STAGE_CFG.Prospecto?.probability ?? 5;

  const contact = db.transaction((tx) => {
    const created = tx
      .insert(contacts)
      .values({
        name,
        email,
        phone: null,
        company: company,
        jobDescription,
        source: "captura",
        temperature,
        score,
        stage: "Prospecto",
        probability: prospectProb,
        valueCents: 0,
        country: null,
        tags: JSON.stringify(["Captura"]),
        notes: fullNotes || null,
        scoreBreakdown: JSON.stringify({
          mode: "image",
          reason: summary || "Importado desde captura de web",
          score,
          stack,
          updatedAt: now.toISOString(),
        }),
        lastInteractionAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Primer paso de Prospecto: contactar. Tarea + nextAction para que aparezca en Agenda.
    const due = new Date(now.getTime() + 2 * 86400000);
    const taskTitle = `Contactar a ${company || name}`;
    tx.insert(tasks)
      .values({
        contactId: created.id,
        title: taskTitle,
        stepName: "Prospecto",
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
      .values({ contactId: created.id, fromStep: null, toStep: "Prospecto", occurredAt: now })
      .run();

    tx.insert(activities)
      .values({
        type: "note",
        description: `Lead importado desde una captura de web.${summary ? `\n${summary}` : ""}`,
        contactId: created.id,
        dealId: null,
        scheduledAt: null,
        completedAt: now,
        createdAt: now,
      })
      .run();

    tx.update(imageLeads)
      .set({ status: "approved", contactId: created.id, notes: editedNotes, updatedAt: now })
      .where(eq(imageLeads.id, id))
      .run();

    return created;
  });

  return NextResponse.json({ contact }, { status: 201 });
}
