import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/db";
import { isValidFieldType, FIELD_TYPES } from "@/lib/custom-fields";

interface FieldRow {
  id: string;
  object_name: string;
  name: string;
  label: string | null;
  type: string;
  options: string | null;
  is_custom: number;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const existing = rawDb.prepare(`SELECT * FROM field_metadata WHERE id = ?`).get(id) as FieldRow | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Campo no encontrado" }, { status: 404 });
  }
  if (!existing.is_custom) {
    return NextResponse.json({ error: "No se puede editar un campo estandar" }, { status: 400 });
  }

  // Editable: label, type, options, position. NO name/object_name (romperia los
  // valores ya guardados en custom_field_values, keyed por field_id pero leidos por name).
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof body?.label === "string") { sets.push("label = ?"); vals.push(body.label); }
  if (body?.type !== undefined) {
    if (!isValidFieldType(body.type)) {
      return NextResponse.json({ error: `type invalido. Validos: ${FIELD_TYPES.join(", ")}` }, { status: 400 });
    }
    sets.push("type = ?"); vals.push(body.type);
  }
  if (body?.options !== undefined) { sets.push("options = ?"); vals.push(JSON.stringify(body.options)); }
  if (typeof body?.position === "number") { sets.push("position = ?"); vals.push(body.position); }

  if (!sets.length) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  vals.push(id);
  rawDb.prepare(`UPDATE field_metadata SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  const updated = rawDb.prepare(`SELECT * FROM field_metadata WHERE id = ?`).get(id);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = rawDb.prepare(`SELECT * FROM field_metadata WHERE id = ?`).get(id) as FieldRow | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Campo no encontrado" }, { status: 404 });
  }
  if (!existing.is_custom) {
    return NextResponse.json({ error: "No se puede borrar un campo estandar" }, { status: 400 });
  }

  rawDb.transaction(() => {
    rawDb.prepare(`DELETE FROM custom_field_values WHERE field_id = ?`).run(id);
    rawDb.prepare(`DELETE FROM field_metadata WHERE id = ?`).run(id);
  })();

  return NextResponse.json({ success: true });
}
