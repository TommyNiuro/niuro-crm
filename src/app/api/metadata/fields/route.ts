import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/db";
import { isValidFieldType, FIELD_TYPES } from "@/lib/custom-fields";

// Crea un field custom: {objectName, name, label, type, options?}.
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const objectName = typeof body?.objectName === "string" ? body.objectName.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const label = typeof body?.label === "string" ? body.label : name;
  const type = body?.type;

  if (!objectName) {
    return NextResponse.json({ error: "objectName requerido" }, { status: 400 });
  }
  if (!/^[a-z][a-zA-Z0-9_]{0,49}$/.test(name)) {
    return NextResponse.json(
      { error: "name invalido: empieza con minuscula, solo letras/numeros/_" },
      { status: 400 }
    );
  }
  if (!isValidFieldType(type)) {
    return NextResponse.json(
      { error: `type invalido. Validos: ${FIELD_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // El objeto debe existir.
  const obj = rawDb.prepare(`SELECT name FROM object_metadata WHERE name = ?`).get(objectName);
  if (!obj) {
    return NextResponse.json({ error: "Objeto no encontrado" }, { status: 404 });
  }

  // options: array de {value,label,color?} serializado. Solo para select/status/stage/temperature.
  const options = body?.options !== undefined ? JSON.stringify(body.options) : null;

  // position al final (max+1).
  const posRow = rawDb
    .prepare(`SELECT COALESCE(MAX(position), -1) AS m FROM field_metadata WHERE object_name = ?`)
    .get(objectName) as { m: number };

  try {
    const id = crypto.randomUUID();
    rawDb
      .prepare(
        `INSERT INTO field_metadata (id, object_name, name, label, type, options, is_custom, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(id, objectName, name, label, type, options, posRow.m + 1, Math.floor(Date.now() / 1000));
    return NextResponse.json(
      { id, objectName, name, label, type, options: options ? JSON.parse(options) : null, isCustom: 1 },
      { status: 201 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    const dup = /UNIQUE|constraint/i.test(msg);
    return NextResponse.json(
      { error: dup ? "Ya existe un campo con ese name en el objeto" : `Error al crear campo: ${msg}` },
      { status: dup ? 409 : 500 }
    );
  }
}
