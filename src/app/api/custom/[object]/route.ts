import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/db";
import { mergeCustomFields, applyCustomFieldsFromBody } from "@/lib/custom-fields";

export const dynamic = "force-dynamic";

/**
 * CRUD genérico de registros de objetos 100% custom. Las filas viven en
 * custom_records (id, object_name, timestamps) y sus valores en custom_field_values
 * (EAV). Reusa mergeCustomFields/applyCustomFieldsFromBody como los built-ins.
 */

/** El slug debe ser un objeto custom activo: evita crear filas para built-ins. */
function isCustomObject(name: string): boolean {
  return !!rawDb
    .prepare(`SELECT 1 FROM object_metadata WHERE name = ? AND is_custom = 1 AND is_active = 1`)
    .get(name);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  if (!isCustomObject(object)) return NextResponse.json({ error: "Objeto no encontrado" }, { status: 404 });

  const rows = rawDb
    .prepare(`SELECT id, created_at, updated_at FROM custom_records WHERE object_name = ? ORDER BY created_at DESC`)
    .all(object) as { id: string }[];
  return NextResponse.json(mergeCustomFields(object, rows));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ object: string }> }) {
  const { object } = await params;
  if (!isCustomObject(object)) return NextResponse.json({ error: "Objeto no encontrado" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    // ponytail: body vacío => registro en blanco (el usuario lo completa inline)
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000); // timestamps en SEGUNDOS
  rawDb
    .prepare(`INSERT INTO custom_records (id, object_name, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .run(id, object, now, now);
  if (body && typeof body === "object") applyCustomFieldsFromBody(object, id, body);

  const [merged] = mergeCustomFields(object, [{ id, created_at: now, updated_at: now }]);
  return NextResponse.json(merged, { status: 201 });
}
