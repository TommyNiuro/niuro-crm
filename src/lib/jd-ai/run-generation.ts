/**
 * src/lib/jd-ai/run-generation.ts · Generación de JD en background
 *
 * Patrón fire-and-forget (igual que proposals-ai/run-generation): el endpoint
 * crea la fila en genStatus='generating' y dispara esta función SIN await. La UI
 * hace polling de GET /api/job-descriptions/[id] hasta que genStatus pase a
 * 'ready' (o 'error').
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { recoveryDir } from "@/lib/paths";
import { db } from "@/db";
import { jobDescriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateJobDescription } from "@/lib/jd-ai";

export async function runJobDescriptionGeneration(id: string): Promise<void> {
  const row = db
    .select()
    .from(jobDescriptions)
    .where(eq(jobDescriptions.id, id))
    .get();
  if (!row) return;

  if (!row.transcript || !row.transcript.trim()) {
    db.update(jobDescriptions)
      .set({
        genStatus: "error",
        genError: "La descripción de cargo no tiene transcripción para generar.",
        updatedAt: new Date(),
      })
      .where(eq(jobDescriptions.id, id))
      .run();
    return;
  }

  try {
    const result = await generateJobDescription({
      transcript: row.transcript,
      notes: row.notes ?? undefined,
      template: (row.template as "compact" | "intermediate" | "full") ?? "intermediate",
    });

    // El logo se sube al crear y vive en el placeholder de `client`; la IA no lo
    // genera, así que lo preservamos al pisar `client` con el resultado.
    let existingLogoSrc: string | undefined;
    try {
      existingLogoSrc = (JSON.parse(row.client) as { logoSrc?: string }).logoSrc;
    } catch {
      existingLogoSrc = undefined;
    }

    const now = new Date();
    db.update(jobDescriptions)
      .set({
        client: JSON.stringify(
          existingLogoSrc
            ? { ...result.client, logoSrc: existingLogoSrc }
            : result.client,
        ),
        roleTitle: result.roleTitle || null,
        pitch: result.pitch || null,
        conditions: JSON.stringify(result.conditions),
        about: result.about || null,
        roleObjective: result.roleObjective || null,
        responsibilities: JSON.stringify(result.responsibilities),
        profile: JSON.stringify(result.profile),
        powerSkills: JSON.stringify(result.powerSkills),
        notLookingFor: JSON.stringify(result.notLookingFor),
        whyCompany: result.whyCompany || null,
        conditionsClosing: result.conditionsClosing || null,
        benefits: result.benefits || null,
        startDate: result.startDate || null,
        successIndicators: JSON.stringify(result.successIndicators),
        onboarding: result.onboarding ? JSON.stringify(result.onboarding) : null,
        viability: JSON.stringify(result.viability),
        generated: true,
        genStatus: "ready",
        genError: null,
        updatedAt: now,
      })
      .where(eq(jobDescriptions.id, id))
      .run();
  } catch (e) {
    const err = e as Error & { rawContent?: unknown };
    let extra = "";
    if (err && err.rawContent !== undefined) {
      try {
        const dir = recoveryDir();
        mkdirSync(dir, { recursive: true });
        const p = join(dir, `job-description-${id}-raw.json`);
        const raw = err.rawContent;
        writeFileSync(
          p,
          typeof raw === "string" ? raw : JSON.stringify(raw, null, 2),
        );
        extra = ` (rawContent preservado en ${p})`;
      } catch {
        // si falla guardar el raw, seguimos con el error original
      }
    }
    db.update(jobDescriptions)
      .set({
        genStatus: "error",
        genError: (e instanceof Error ? e.message : String(e)) + extra,
        updatedAt: new Date(),
      })
      .where(eq(jobDescriptions.id, id))
      .run();
  }
}
