/**
 * src/app/api/job-descriptions/[id]/pdf/route.ts
 *   GET /api/job-descriptions/[id]/pdf -> 200 application/pdf (attachment)
 *
 * Genera el PDF de la JD con Playwright local (src/lib/job-descriptions-pdf.ts),
 * que renderiza /job-descriptions/[id]/print con el Chrome del sistema.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { jobDescriptions } from "@/db/schema";
import { generateJobDescriptionPdf } from "@/lib/job-descriptions-pdf";
import { buildJobDescriptionFileName } from "@/lib/job-description-filename";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const jd = db
    .select({
      id: jobDescriptions.id,
      client: jobDescriptions.client,
      roleTitle: jobDescriptions.roleTitle,
      createdAt: jobDescriptions.createdAt,
    })
    .from(jobDescriptions)
    .where(eq(jobDescriptions.id, id))
    .get();

  if (!jd) {
    return NextResponse.json({ error: "Descripción de cargo no encontrada" }, { status: 404 });
  }

  let pdf: Buffer;
  try {
    pdf = await generateJobDescriptionPdf(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al generar el PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let clientName = "Empresa";
  try {
    const parsed = JSON.parse(jd.client) as { name?: unknown };
    if (typeof parsed.name === "string" && parsed.name.trim()) clientName = parsed.name.trim();
  } catch {
    // client no era JSON válido: fallback.
  }
  const fileName = buildJobDescriptionFileName(
    { roleTitle: jd.roleTitle, clientName, createdAt: jd.createdAt },
    "pdf",
  );

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "no-store",
    },
  });
}
