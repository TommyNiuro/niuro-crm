import { NextRequest, NextResponse } from "next/server";
import { getOrCreateShareToken } from "@/lib/proposals-share";

export const dynamic = "force-dynamic";

// POST /api/proposals/[id]/share -> genera (si no existe) el shareToken y
// devuelve la URL publica /p/[token]. Idempotente: si ya tiene token, lo
// reusa (no invalida links ya mandados).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = getOrCreateShareToken(id);
  if (!result) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  return NextResponse.json(result);
}
