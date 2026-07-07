import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobDescriptions, contacts } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  serializeJobDescription,
  JOB_DESCRIPTION_STATUSES,
  JOB_DESCRIPTION_TEMPLATES,
} from "@/lib/job-descriptions";
import { runJobDescriptionGeneration } from "@/lib/jd-ai/run-generation";

export const dynamic = "force-dynamic";

function parseClientCol(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { name: raw };
  }
}

// GET /api/job-descriptions            -> todas (newest first)
// GET /api/job-descriptions?contactId= -> filtra por contacto
// GET /api/job-descriptions?status=    -> filtra por estado
// Fila LIVIANA: solo lo que consume el listado (no parsea los JSON pesados).
export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");
  const status = request.nextUrl.searchParams.get("status");

  const filters = [];
  if (contactId) filters.push(eq(jobDescriptions.contactId, contactId));
  if (status && JOB_DESCRIPTION_STATUSES.includes(status as (typeof JOB_DESCRIPTION_STATUSES)[number])) {
    filters.push(eq(jobDescriptions.status, status));
  }
  const where = filters.length === 1 ? filters[0] : filters.length > 1 ? and(...filters) : undefined;

  const cols = {
    id: jobDescriptions.id,
    status: jobDescriptions.status,
    client: jobDescriptions.client,
    roleTitle: jobDescriptions.roleTitle,
    genStatus: jobDescriptions.genStatus,
    createdAt: jobDescriptions.createdAt,
    updatedAt: jobDescriptions.updatedAt,
  };

  const rows = where
    ? db.select(cols).from(jobDescriptions).where(where).orderBy(desc(jobDescriptions.createdAt)).all()
    : db.select(cols).from(jobDescriptions).orderBy(desc(jobDescriptions.createdAt)).all();

  return NextResponse.json(
    rows.map((r) => {
      const client = parseClientCol(r.client);
      const clientName =
        client && typeof client === "object" && "name" in client
          ? String((client as { name?: unknown }).name ?? "")
          : "";
      return {
        ...r,
        client,
        clientName,
        createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : r.createdAt,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.getTime() : r.updatedAt,
      };
    }),
  );
}

// POST /api/job-descriptions
// Modo turbo: crea la JD en genStatus='generating' y dispara la IA en background
// (fire-and-forget). Solo exige transcript; el contenido lo produce la IA. La UI
// hace polling de GET /api/job-descriptions/[id] hasta 'ready' o 'error'.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  if (!transcript.trim()) {
    return NextResponse.json(
      { error: "transcript es requerido para generar la descripción de cargo" },
      { status: 400 },
    );
  }

  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  const contactId = str(body.contactId);
  const template =
    typeof body.template === "string" &&
    JOB_DESCRIPTION_TEMPLATES.includes(body.template as (typeof JOB_DESCRIPTION_TEMPLATES)[number])
      ? body.template
      : "intermediate";

  let clientName = "Generando descripción";
  if (contactId) {
    const c = db.select().from(contacts).where(eq(contacts.id, contactId)).get();
    if (c) clientName = c.company || c.name || clientName;
  }
  const logoSrc = str(body.logoSrc);

  const now = new Date();
  const created = db
    .insert(jobDescriptions)
    .values({
      contactId,
      dealId: str(body.dealId),
      status: "draft",
      template,
      client: JSON.stringify({ name: clientName, logoSrc: logoSrc ?? undefined }),
      transcript,
      notes: typeof body.notes === "string" ? body.notes : null,
      generated: false,
      genStatus: "generating",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  runJobDescriptionGeneration(created.id).catch((err) =>
    console.error(`[job-descriptions] generación ${created.id} falló:`, err),
  );

  return NextResponse.json(serializeJobDescription(created), { status: 201 });
}
