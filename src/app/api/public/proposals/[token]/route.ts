import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// GET /api/public/proposals/[token] -> SOLO los campos que se pueden mostrar
// a un cliente externo sin sesion. Deliberadamente NO devuelve transcript,
// notes, contactId, dealId, genError, priority: esos son datos internos del
// CRM que nunca deberian salir por un link publico.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Token invalido" }, { status: 400 });

  const row = db.select().from(proposals).where(eq(proposals.shareToken, token)).get();
  if (!row) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

  return NextResponse.json({
    mode: row.mode,
    status: row.status,
    date: row.date,
    client: parseJson(row.client),
    role: row.role,
    duration: row.duration,
    pricing: parseJson(row.pricing),
    summary: row.summary,
    context: parseJson(row.context),
    cards: parseJson(row.cards),
    roadmap: parseJson(row.roadmap),
    team: parseJson(row.team),
    risks: parseJson(row.risks),
  });
}
