import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quickReplies } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(db.select().from(quickReplies).all());
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { label, text } = body || {};
  if (!label || !text) return NextResponse.json({ error: "label y text requeridos" }, { status: 400 });
  try {
    const row = db.insert(quickReplies).values({ label, text }).returning().get();
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    // UNIQUE sobre label → 409 con mensaje claro (antes respondía 500 genérico)
    if (String(e).includes("UNIQUE")) {
      return NextResponse.json({ error: `Ya existe una respuesta rápida con el label "${label}"` }, { status: 409 });
    }
    throw e;
  }
}
