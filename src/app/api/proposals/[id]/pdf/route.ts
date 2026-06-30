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

// Playwright necesita el runtime Node (no edge). force-dynamic: nunca cachear.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deriva un nombre de archivo seguro a partir del cliente de la propuesta. El
 * campo `client` es JSON en una columna TEXT: {name, industry, country, ...}.
 */
function fileNameFromClient(clientRaw: string | null): string {
  let name = "propuesta";
  if (clientRaw) {
    try {
      const parsed = JSON.parse(clientRaw) as { name?: unknown };
      if (typeof parsed.name === "string" && parsed.name.trim()) {
        name = parsed.name.trim();
      }
    } catch {
      // client no era JSON valido: usamos el fallback.
    }
  }
  // Solo caracteres seguros para un header Content-Disposition / filename.
  const safe = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
  return `${safe || "propuesta"}.pdf`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const proposal = db
    .select({ id: proposals.id, client: proposals.client })
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

  const fileName = fileNameFromClient(proposal.client);

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
    },
  });
}
