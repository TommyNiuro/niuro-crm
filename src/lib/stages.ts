/**
 * Etapas del pipeline de ventas: la fuente de verdad es la tabla
 * pipeline_stages (editable desde Ajustes). STAGE_CFG en crm-ui.ts queda como
 * config visual/operativa por nombre (colores, SLA, tarea sugerida) con
 * defaults genéricos para etapas renombradas o creadas por el usuario.
 * Server-only (abre la DB); para Client Components está /api/pipeline/stages.
 */
import { db } from "@/db";
import { pipelineStages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { STAGES, STAGE_CFG } from "./crm-ui";

export type StageRow = typeof pipelineStages.$inferSelect;

/** Etapas ordenadas desde la DB; si la instalación no tiene seed, las default. */
export function getStages(pipeline: string = "prospectos"): StageRow[] {
  const rows = db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.pipeline, pipeline))
    .orderBy(asc(pipelineStages.order))
    .all();
  if (rows.length) return rows;
  return STAGES.map((name, i) => ({
    id: name,
    name,
    order: i,
    color: STAGE_CFG[name]?.text ?? "#64748b",
    isWon: name === "Cierre",
    isLost: false,
    pipeline,
  }));
}

export function getStageNames(pipeline: string = "prospectos"): string[] {
  return getStages(pipeline).map((s) => s.name);
}

/** Config operativa de una etapa: la conocida por nombre, o defaults sanos. */
export function stageCfgFor(name: string, order: number) {
  return (
    STAGE_CFG[name] ?? {
      text: "#64748b",
      bg: "rgba(148,163,184,0.12)",
      order,
      task: `Avanzar en ${name}`,
      sla: "",
      dueInDays: 2,
      probability: 10,
    }
  );
}
