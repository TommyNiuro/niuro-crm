import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runClaude, DEFAULT_MODEL } from "@/lib/claude-subprocess";
import { buildSummaryEmailPrompt } from "@/lib/proposals-ai/prompts/summary-email";

export const dynamic = "force-dynamic";

// POST /api/proposals/[id]/summary-email
// Genera el mail de resumen de requerimiento a partir de transcript+notas de
// la propuesta. Independiente de la generacion de la propuesta completa: se
// puede pedir apenas hay transcripcion, sin esperar los ~4 min de la IA.
// Stateless a proposito: no se persiste (se regenera on-demand), asi evitamos
// una columna nueva para algo que el vendedor va a querer re-generar seguido
// si edita la transcripcion.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const row = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!row) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  if (!row.transcript || !row.transcript.trim()) {
    return NextResponse.json(
      { error: "Esta propuesta no tiene transcripcion cargada." },
      { status: 400 },
    );
  }

  let contactHint: string | undefined;
  if (row.contactId) {
    const c = db.select().from(contacts).where(eq(contacts.id, row.contactId)).get();
    if (c) contactHint = [c.name, c.company].filter(Boolean).join(" · ");
  }

  try {
    const prompt = buildSummaryEmailPrompt({
      transcript: row.transcript,
      notes: row.notes ?? undefined,
      contactHint,
    });
    const email = await runClaude(prompt, { model: DEFAULT_MODEL, timeoutMs: 180_000 });
    return NextResponse.json({ email: email.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `No se pudo generar el mail: ${msg}` }, { status: 500 });
  }
}
