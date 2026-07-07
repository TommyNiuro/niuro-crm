import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { imageLeads } from "@/db/schema";
import { desc, eq, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

type ImageLeadRow = typeof imageLeads.$inferSelect;

const VALID_STATUS = ["analyzing", "ready", "approved", "dismissed"];

// Convierte la fila a la forma que consume el cliente: stack como array, isLead
// desde rawExtract, y SIN imagePath (es un path absoluto del server; la imagen
// se sirve por /api/image-leads/[id]/image).
function serializeImageLead(row: ImageLeadRow) {
  let stack: string[] = [];
  try {
    stack = row.stack ? (JSON.parse(row.stack) as string[]) : [];
  } catch {
    stack = [];
  }
  let isLead: boolean | null = null;
  try {
    if (row.rawExtract) isLead = !!(JSON.parse(row.rawExtract) as { isLead?: boolean }).isLead;
  } catch {
    isLead = null;
  }
  return {
    id: row.id,
    status: row.status,
    score: row.score,
    company: row.company,
    whatTheyDo: row.whatTheyDo,
    role: row.role,
    stack,
    seniority: row.seniority,
    contactEmail: row.contactEmail,
    contactUrl: row.contactUrl,
    contactInfo: row.contactInfo,
    summary: row.summary,
    notes: row.notes,
    isLead,
    contactId: row.contactId,
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : row.updatedAt,
  };
}

// GET /api/image-leads        → todas menos las descartadas (newest first)
// GET /api/image-leads?status=ready  → filtra por status
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");

  const rows =
    status && VALID_STATUS.includes(status)
      ? db.select().from(imageLeads).where(eq(imageLeads.status, status)).orderBy(desc(imageLeads.createdAt)).all()
      : db.select().from(imageLeads).where(ne(imageLeads.status, "dismissed")).orderBy(desc(imageLeads.createdAt)).all();

  return NextResponse.json(rows.map(serializeImageLead));
}
