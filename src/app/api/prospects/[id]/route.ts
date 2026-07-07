import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serializeProspect } from "@/lib/prospect-serialize";

export const dynamic = "force-dynamic";

const VALID_STATUS = ["new", "enriched", "contacted", "conversation", "discarded"];

// Campos editables desde la UI (edición inline del record-view + acciones).
const EDITABLE = [
  "status",
  "urgency",
  "domain",
  "contactName",
  "contactTitle",
  "contactEmail",
  "contactPhone",
  "contactLinkedin",
  "msgConnect",
  "msgPitch",
  "snoozedUntil",
] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(prospects).where(eq(prospects.id, id)).get();
  if (!row) return NextResponse.json({ error: "Prospecto no encontrado" }, { status: 404 });
  return NextResponse.json(serializeProspect(row));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(prospects).where(eq(prospects.id, id)).get();
  if (!row) return NextResponse.json({ error: "Prospecto no encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (key in body) patch[key] = body[key] === "" ? null : body[key];
  }
  if (typeof patch.status === "string" && !VALID_STATUS.includes(patch.status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }
  if (typeof patch.snoozedUntil === "number") patch.snoozedUntil = new Date(patch.snoozedUntil);

  // Al marcar "Contactada": registrar el toque en contact_log (historial de
  // veces que se contactó, mejora #9) para poder mostrar "3 intentos, último
  // hace 5 días" en vez de solo la etapa actual.
  if (patch.status === "contacted" && row.status !== "contacted") {
    let log: number[] = [];
    try { log = row.contactLog ? (JSON.parse(row.contactLog) as number[]) : []; } catch { log = []; }
    patch.contactLog = JSON.stringify([...log, Date.now()]);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(serializeProspect(row));
  }

  const updated = db
    .update(prospects)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(prospects.id, id))
    .returning()
    .get();
  return NextResponse.json(serializeProspect(updated));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  db.delete(prospects).where(eq(prospects.id, id)).run();
  return NextResponse.json({ ok: true });
}
