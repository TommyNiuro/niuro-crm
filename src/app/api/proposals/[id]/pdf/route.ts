/**
 * src/app/api/proposals/[id]/pdf/route.ts
 *
 *   GET /api/proposals/[id]/pdf
 *   -> 200 application/pdf (attachment), nombre basado en el cliente
 *
 * Genera el PDF de la propuesta con Playwright local (src/lib/proposals-pdf.ts),
 * que renderiza /proposals/[id]/print con el Chrome del sistema. Sin Vercel
 * Blob, sin share links: devuelve el binario directo.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { proposals } from "@/db/schema";
import { generateProposalPdf } from "@/lib/proposals-pdf";
import { buildProposalFileName } from "@/lib/proposal-filename";

// Playwright necesita el runtime Node (no edge). force-dynamic: nunca cachear.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const proposal = db
    .select({
      id: proposals.id,
      client: proposals.client,
      role: proposals.role,
      mode: proposals.mode,
      createdAt: proposals.createdAt,
    })
    .from(proposals)
    .where(eq(proposals.id, id))
    .get();

  if (!proposal) {
    return NextResponse.json(
      { error: "Propuesta no encontrada" },
      { status: 404 },
    );
  }

  let pdf: Buffer;
  try {
    pdf = await generateProposalPdf(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al generar el PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let clientName = "Cliente";
  try {
    const parsed = JSON.parse(proposal.client) as { name?: unknown };
    if (typeof parsed.name === "string" && parsed.name.trim()) clientName = parsed.name.trim();
  } catch {
    // client no era JSON valido: usamos el fallback.
  }
  const fileName = buildProposalFileName(
    { role: proposal.role, mode: proposal.mode, clientName, createdAt: proposal.createdAt },
    "pdf",
  );

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // filename= (ASCII, ya sin tildes) + filename*= (UTF-8 percent-encoded)
      // para que navegadores viejos y nuevos muestren el nombre completo.
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
    },
  });
}
