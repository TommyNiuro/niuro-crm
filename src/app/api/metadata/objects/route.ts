import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/db";

interface ObjectRow {
  id: string;
  name: string;
  label_singular: string | null;
  label_plural: string | null;
  icon: string | null;
  is_custom: number;
  is_active: number;
  created_at: number;
}

export async function GET() {
  const rows = rawDb
    .prepare(`SELECT * FROM object_metadata WHERE is_active = 1 ORDER BY is_custom, name`)
    .all() as ObjectRow[];
  return NextResponse.json(rows);
}

// Crea un objeto 100% custom (is_custom=1). name: slug unico [a-z0-9_].
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim().toLowerCase() : "";
  if (!/^[a-z][a-z0-9_]{1,49}$/.test(name)) {
    return NextResponse.json(
      { error: "name invalido: usa minusculas, numeros y _ (empieza con letra)" },
      { status: 400 }
    );
  }
  const labelSingular = typeof body?.labelSingular === "string" ? body.labelSingular : name;
  const labelPlural = typeof body?.labelPlural === "string" ? body.labelPlural : name;
  const icon = typeof body?.icon === "string" ? body.icon : null;

  try {
    const id = crypto.randomUUID();
    rawDb
      .prepare(
        `INSERT INTO object_metadata (id, name, label_singular, label_plural, icon, is_custom, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, 1, 1, ?)`
      )
      .run(id, name, labelSingular, labelPlural, icon, Math.floor(Date.now() / 1000));
    return NextResponse.json({ id, name, labelSingular, labelPlural, icon, isCustom: 1 }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    const dup = /UNIQUE|constraint/i.test(msg);
    return NextResponse.json(
      { error: dup ? "Ya existe un objeto con ese name" : `Error al crear objeto: ${msg}` },
      { status: dup ? 409 : 500 }
    );
  }
}
