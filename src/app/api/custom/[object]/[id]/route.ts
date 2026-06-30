import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/db";
import { mergeCustomFields, applyCustomFieldsFromBody } from "@/lib/custom-fields";

/** El registro debe existir y pertenecer al objeto. */
function ownsRecord(object: string, id: string): boolean {
  return !!rawDb
    .prepare(`SELECT 1 FROM custom_records WHERE id = ? AND object_name = ?`)
    .get(id, object);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ object: string; id: string }> }) {
  const { object, id } = await params;
  if (!ownsRecord(object, id)) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  applyCustomFieldsFromBody(object, id, body); // guarda cada campo custom; ignora el resto (ej. id)
  const now = Math.floor(Date.now() / 1000);
  rawDb.prepare(`UPDATE custom_records SET updated_at = ? WHERE id = ?`).run(now, id);

  const [merged] = mergeCustomFields(object, [{ id, updated_at: now }]);
  return NextResponse.json(merged);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ object: string; id: string }> }) {
  const { object, id } = await params;
  if (!ownsRecord(object, id)) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

  rawDb.prepare(`DELETE FROM custom_field_values WHERE object_name = ? AND record_id = ?`).run(object, id);
  rawDb.prepare(`DELETE FROM custom_records WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
