/**
 * src/lib/proposals-ai/run-generation.ts · Generacion de propuesta en background
 *
 * Patron fire-and-forget (igual que analyze-image-lead): el endpoint crea la fila
 * en genStatus='generating' y dispara esta funcion SIN await. La UI hace polling
 * de GET /api/proposals/[id] hasta que genStatus pase a 'ready' (o 'error').
 *
 * Motivo: una propuesta completa con Sonnet via subprocess tarda varios minutos
 * (y compite por el semaforo global con los servicios IA del CRM). Esperar de
 * forma sincrona haria timeout del HTTP; el background no bloquea al usuario.
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateProposal, type FullGenerateMode } from "@/lib/proposals-ai";

export async function runProposalGeneration(id: string): Promise<void> {
  const row = db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!row) return;

  if (!row.transcript || !row.transcript.trim()) {
    db.update(proposals)
      .set({
        genStatus: "error",
        genError: "La propuesta no tiene transcript para generar.",
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, id))
      .run();
    return;
  }

  try {
    const result = await generateProposal({
      transcript: row.transcript,
      notes: row.notes ?? undefined,
      mode: row.mode as FullGenerateMode,
    });

    const now = new Date();
    db.update(proposals)
      .set({
        // El cliente generado por la IA reemplaza el placeholder del contacto.
        client: JSON.stringify(result.client),
        role: result.role ?? null,
        duration: result.duration ?? null,
        pricing: result.pricing ? JSON.stringify(result.pricing) : null,
        summary: result.summary || null,
        context: JSON.stringify(result.context),
        cards: JSON.stringify(result.cards),
        roadmap: JSON.stringify(result.roadmap),
        team: JSON.stringify(result.team),
        risks: JSON.stringify(result.risks),
        generated: true,
        genStatus: "ready",
        genError: null,
        updatedAt: now,
      })
      .where(eq(proposals.id, id))
      .run();
  } catch (e) {
    const err = e as Error & { rawContent?: unknown };
    let extra = "";
    // Si generateProposal adjunto el rawContent (post-proceso fallido), lo
    // preservamos a disco: asi un fallo de sanitizado o un shape parcial no
    // obliga a re-generar (varios min de Sonnet). Best-effort.
    if (err && err.rawContent !== undefined) {
      try {
        const dir = join(process.cwd(), "data", "recovery");
        mkdirSync(dir, { recursive: true });
        const p = join(dir, `proposal-${id}-raw.json`);
        const raw = err.rawContent;
        writeFileSync(p, typeof raw === "string" ? raw : JSON.stringify(raw, null, 2));
        extra = ` (rawContent preservado en ${p})`;
      } catch {
        // si falla guardar el raw, seguimos con el error original
      }
    }
    db.update(proposals)
      .set({
        genStatus: "error",
        genError: (e instanceof Error ? e.message : String(e)) + extra,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, id))
      .run();
  }
}
