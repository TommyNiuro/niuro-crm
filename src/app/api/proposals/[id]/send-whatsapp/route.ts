import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendMessage } from "@/lib/whatsapp";
import { getOrCreateShareToken } from "@/lib/proposals-share";

export const dynamic = "force-dynamic";

// POST /api/proposals/[id]/send-whatsapp { phone: string, message?: string }
// El bridge de WhatsApp (bridge/main.go) solo manda TEXTO, no adjuntos: no se
// puede mandar el PDF directo. En su lugar se manda un link a la pagina
// publica /p/[token] (se genera el token si todavia no existe) para que el
// cliente vea la propuesta en el navegador. Para el PDF adjunto, usar
// /send-email en su lugar.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // body vacio no es valido aca (phone es requerido), sigue y falla abajo
  }
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const customMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (!phone) return NextResponse.json({ error: "phone es requerido" }, { status: 400 });

  const row = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!row) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

  const share = getOrCreateShareToken(id);
  if (!share) return NextResponse.json({ error: "No se pudo generar el link publico" }, { status: 500 });

  const message = customMessage
    ? `${customMessage}\n\n${share.url}`
    : `Hola! Te comparto la propuesta de Niuro. Podes verla aca: ${share.url}`;

  const result = await sendMessage(phone, message);
  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, url: share.url });
}
