import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { generateProposalPdf } from "@/lib/proposals-pdf";

export const dynamic = "force-dynamic";

// Texto plano -> HTML minimo (preserva parrafos y saltos de linea). El mail de
// resumen y los mensajes cortos no necesitan un template mas elaborado.
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #141241; white-space: pre-wrap;">${escaped}</div>`;
}

// POST /api/proposals/[id]/send-email
// Body: { to: string, subject?: string, message: string, attachPdf?: boolean }
// Envia un mail ad-hoc (mail de resumen de requerimiento, o la propuesta con
// el PDF adjunto). No cambia el status de la propuesta: eso lo decide el
// vendedor a mano desde el selector de estado.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const message = typeof body.message === "string" ? body.message : "";
  const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim() : "Propuesta Niuro";
  const attachPdf = body.attachPdf === true;

  if (!to) return NextResponse.json({ error: "to es requerido" }, { status: 400 });
  if (!message.trim()) return NextResponse.json({ error: "message es requerido" }, { status: 400 });

  const row = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!row) return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });

  const attachments = [];
  if (attachPdf) {
    try {
      const pdf = await generateProposalPdf(id);
      attachments.push({ filename: "propuesta-niuro.pdf", content: pdf.toString("base64") });
    } catch (err) {
      return NextResponse.json(
        { error: `No se pudo generar el PDF adjunto: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }
  }

  const result = await sendEmail({ to, subject, html: textToHtml(message), attachments });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason || "No se pudo enviar el mail" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
