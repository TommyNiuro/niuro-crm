import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineStages, contacts } from "@/db/schema";
import { eq, and, asc, sql, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

// CRUD de etapas multi-pipeline desde Ajustes. Tres pipelines:
//   prospectos (ventas, contact_type='lead') | clientes ('client') | ingenieros ('engineer')
// Los contactos y tareas referencian la etapa POR NOMBRE, así que renombrar
// propaga a contacts.stage y tasks.step_name SOLO para los contactos del tipo
// del pipeline (dos pipelines pueden tener etapas homónimas sin pisarse).
// Borrar se bloquea si hay contactos del pipeline en la etapa.

const MAX_NAME = 40;
const PIPELINES = ["prospectos", "clientes", "ingenieros"] as const;
type Pipeline = (typeof PIPELINES)[number];

const CONTACT_TYPES: Record<Pipeline, string[]> = {
  prospectos: ["lead"],
  clientes: ["client"],
  ingenieros: ["engineer"],
};

function isPipeline(v: unknown): v is Pipeline {
  return typeof v === "string" && (PIPELINES as readonly string[]).includes(v);
}

function list(pipeline?: Pipeline) {
  const q = db.select().from(pipelineStages);
  const rows = pipeline ? q.where(eq(pipelineStages.pipeline, pipeline)) : q;
  return rows.orderBy(asc(pipelineStages.pipeline), asc(pipelineStages.order)).all();
}

function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, MAX_NAME);
  return s.length ? s : null;
}

export async function GET(req: NextRequest) {
  // Sin pipeline devolvía los 3 mezclados y el kanban de Ventas renderizaba
  // columnas de Clientes/Ingenieros (auditoría 2026-07-02). Parámetro obligatorio.
  const p = req.nextUrl.searchParams.get("pipeline");
  if (!isPipeline(p)) {
    return NextResponse.json(
      { error: `pipeline requerido: ${PIPELINES.join(" | ")}` },
      { status: 400 }
    );
  }
  return NextResponse.json(list(p));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = cleanName(body?.name);
  const pipeline: Pipeline = isPipeline(body?.pipeline) ? body.pipeline : "prospectos";
  if (!name) return NextResponse.json({ error: "Nombre requerido (máx 40)" }, { status: 400 });
  if (list(pipeline).some((s) => s.name === name)) {
    return NextResponse.json({ error: "Ya existe una etapa con ese nombre en este pipeline" }, { status: 409 });
  }
  const color = typeof body?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : "#64748b";
  const maxOrder =
    db
      .select({ m: sql<number>`COALESCE(MAX("order"), -1)` })
      .from(pipelineStages)
      .where(eq(pipelineStages.pipeline, pipeline))
      .get()?.m ?? -1;
  const created = db
    .insert(pipelineStages)
    .values({ name, color, order: maxOrder + 1, pipeline })
    .returning()
    .get();
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const stage = db.select().from(pipelineStages).where(eq(pipelineStages.id, id)).get();
  if (!stage) return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
  const pipeline = stage.pipeline as Pipeline;
  const types = CONTACT_TYPES[pipeline] ?? ["lead"];

  // Reordenar: swap de "order" con la vecina DEL MISMO pipeline.
  if (body.direction === "up" || body.direction === "down") {
    const all = list(pipeline);
    const idx = all.findIndex((s) => s.id === id);
    const swapWith = body.direction === "up" ? all[idx - 1] : all[idx + 1];
    if (!swapWith) return NextResponse.json(list(pipeline)); // ya está en el borde
    db.transaction((tx) => {
      tx.update(pipelineStages).set({ order: swapWith.order }).where(eq(pipelineStages.id, stage.id)).run();
      tx.update(pipelineStages).set({ order: stage.order }).where(eq(pipelineStages.id, swapWith.id)).run();
    });
    return NextResponse.json(list(pipeline));
  }

  const patch: { name?: string; color?: string } = {};
  const newName = body.name !== undefined ? cleanName(body.name) : undefined;
  if (body.name !== undefined) {
    if (!newName) return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
    if (newName !== stage.name && list(pipeline).some((s) => s.name === newName)) {
      return NextResponse.json({ error: "Ya existe una etapa con ese nombre en este pipeline" }, { status: 409 });
    }
    patch.name = newName;
  }
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) patch.color = body.color;
  if (!Object.keys(patch).length) return NextResponse.json(stage);

  const renamed = patch.name && patch.name !== stage.name;
  db.transaction((tx) => {
    tx.update(pipelineStages).set(patch).where(eq(pipelineStages.id, id)).run();
    if (renamed) {
      // Propagación scopeada al tipo de contacto del pipeline.
      tx.update(contacts)
        .set({ stage: patch.name! })
        .where(and(eq(contacts.stage, stage.name), inArray(contacts.contactType, types)))
        .run();
      tx.run(sql`
        UPDATE tasks SET step_name = ${patch.name!}
        WHERE step_name = ${stage.name}
          AND contact_id IN (SELECT id FROM contacts WHERE contact_type IN (${sql.join(
            types.map((t) => sql`${t}`),
            sql`, `
          )}))
      `);
    }
  });
  return NextResponse.json({ ...stage, ...patch, propagated: renamed ? true : undefined });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const stage = db.select().from(pipelineStages).where(eq(pipelineStages.id, id)).get();
  if (!stage) return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
  const types = CONTACT_TYPES[stage.pipeline as Pipeline] ?? ["lead"];

  const inUse =
    db
      .select({ c: sql<number>`COUNT(*)` })
      .from(contacts)
      .where(and(eq(contacts.stage, stage.name), inArray(contacts.contactType, types)))
      .get()?.c ?? 0;
  if (inUse > 0) {
    return NextResponse.json(
      { error: `Hay ${inUse} contacto(s) en "${stage.name}". Movelos a otra etapa antes de borrarla.` },
      { status: 409 }
    );
  }
  db.transaction((tx) => {
    tx.delete(pipelineStages).where(eq(pipelineStages.id, id)).run();
    // Resecuenciar el pipeline afectado (0..n-1).
    const rest = tx
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.pipeline, stage.pipeline))
      .orderBy(asc(pipelineStages.order))
      .all();
    rest.forEach((s, i) => {
      if (s.order !== i) tx.update(pipelineStages).set({ order: i }).where(eq(pipelineStages.id, s.id)).run();
    });
  });
  return NextResponse.json({ ok: true });
}
