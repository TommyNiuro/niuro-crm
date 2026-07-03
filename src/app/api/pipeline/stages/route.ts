import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineStages, contacts, tasks } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";

// CRUD de etapas del pipeline desde Ajustes. Lo importante: los contactos y
// las tareas referencian la etapa POR NOMBRE, así que renombrar propaga a
// contacts.stage y tasks.step_name en la misma transacción. Borrar se bloquea
// si hay contactos en la etapa (mover primero, no perder gente del kanban).

const MAX_NAME = 40;

function list() {
  return db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).all();
}

function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, MAX_NAME);
  return s.length ? s : null;
}

export async function GET() {
  return NextResponse.json(list());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = cleanName(body?.name);
  if (!name) return NextResponse.json({ error: "Nombre requerido (máx 40)" }, { status: 400 });
  if (list().some((s) => s.name === name)) {
    return NextResponse.json({ error: "Ya existe una etapa con ese nombre" }, { status: 409 });
  }
  const color = typeof body?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : "#64748b";
  const maxOrder = db.select({ m: sql<number>`COALESCE(MAX("order"), -1)` }).from(pipelineStages).get()?.m ?? -1;
  const created = db
    .insert(pipelineStages)
    .values({ name, color, order: maxOrder + 1 })
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

  // Reordenar: swap de "order" con la vecina.
  if (body.direction === "up" || body.direction === "down") {
    const all = list();
    const idx = all.findIndex((s) => s.id === id);
    const swapWith = body.direction === "up" ? all[idx - 1] : all[idx + 1];
    if (!swapWith) return NextResponse.json(list()); // ya está en el borde
    db.transaction((tx) => {
      tx.update(pipelineStages).set({ order: swapWith.order }).where(eq(pipelineStages.id, stage.id)).run();
      tx.update(pipelineStages).set({ order: stage.order }).where(eq(pipelineStages.id, swapWith.id)).run();
    });
    return NextResponse.json(list());
  }

  const patch: { name?: string; color?: string } = {};
  const newName = body.name !== undefined ? cleanName(body.name) : undefined;
  if (body.name !== undefined) {
    if (!newName) return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
    if (newName !== stage.name && list().some((s) => s.name === newName)) {
      return NextResponse.json({ error: "Ya existe una etapa con ese nombre" }, { status: 409 });
    }
    patch.name = newName;
  }
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) patch.color = body.color;
  if (!Object.keys(patch).length) return NextResponse.json(stage);

  const renamed = patch.name && patch.name !== stage.name;
  db.transaction((tx) => {
    tx.update(pipelineStages).set(patch).where(eq(pipelineStages.id, id)).run();
    if (renamed) {
      // Propagación: la etapa vive por nombre en contactos y tareas.
      tx.update(contacts).set({ stage: patch.name! }).where(eq(contacts.stage, stage.name)).run();
      tx.update(tasks).set({ stepName: patch.name! }).where(eq(tasks.stepName, stage.name)).run();
    }
  });
  return NextResponse.json({ ...stage, ...patch, propagated: renamed ? true : undefined });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const stage = db.select().from(pipelineStages).where(eq(pipelineStages.id, id)).get();
  if (!stage) return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });

  const inUse = db.select({ c: sql<number>`COUNT(*)` }).from(contacts).where(eq(contacts.stage, stage.name)).get()?.c ?? 0;
  if (inUse > 0) {
    return NextResponse.json(
      { error: `Hay ${inUse} contacto(s) en "${stage.name}". Movelos a otra etapa antes de borrarla.` },
      { status: 409 }
    );
  }
  db.transaction((tx) => {
    tx.delete(pipelineStages).where(eq(pipelineStages.id, id)).run();
    // Resecuenciar para que "order" quede denso (0..n-1).
    const rest = tx.select().from(pipelineStages).orderBy(asc(pipelineStages.order)).all();
    rest.forEach((s, i) => {
      if (s.order !== i) tx.update(pipelineStages).set({ order: i }).where(eq(pipelineStages.id, s.id)).run();
    });
  });
  return NextResponse.json({ ok: true });
}
