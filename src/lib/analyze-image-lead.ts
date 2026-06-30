/**
 * analyze-image-lead.ts — Corre la extracción IA de visión sobre una fila
 * image_leads y persiste el resultado. Se dispara fire-and-forget desde el
 * upload (el server de next start es de larga vida, así que la promesa sobrevive)
 * y deja la fila en status 'ready' (con datos) o 'ready' con summary de error.
 */
import { db } from "@/db";
import { imageLeads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractWebLead } from "@/lib/extract-web-lead";

export async function runImageLeadAnalysis(id: string): Promise<void> {
  const row = db.select().from(imageLeads).where(eq(imageLeads.id, id)).get();
  if (!row) return;

  const extract = await extractWebLead(row.imagePath);
  const now = new Date();

  if (!extract) {
    db.update(imageLeads)
      .set({
        status: "ready",
        score: 0,
        summary: "No se pudo analizar la imagen automaticamente. Revisa la captura o reintenta.",
        updatedAt: now,
      })
      .where(eq(imageLeads.id, id))
      .run();
    return;
  }

  db.update(imageLeads)
    .set({
      status: "ready",
      score: extract.score,
      company: extract.company,
      whatTheyDo: extract.whatTheyDo,
      role: extract.role,
      stack: extract.stack.length ? JSON.stringify(extract.stack) : null,
      seniority: extract.seniority,
      contactEmail: extract.contactEmail,
      contactUrl: extract.contactUrl,
      contactInfo: extract.contactInfo,
      summary: extract.summary,
      notes: extract.notes,
      rawExtract: JSON.stringify(extract),
      updatedAt: now,
    })
    .where(eq(imageLeads.id, id))
    .run();
}
