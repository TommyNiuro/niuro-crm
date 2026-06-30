import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  const object = rawDb
    .prepare(`SELECT * FROM object_metadata WHERE name = ?`)
    .get(name);

  // Objetos no registrados en object_metadata (pantallas aún sin sembrar, ej.
  // leads/image-leads) igual pueden tener field_metadata custom: devolvemos 200
  // con sus campos (o vacío) para que el record-view no spamee 404 en consola.
  const fields = rawDb
    .prepare(`SELECT * FROM field_metadata WHERE object_name = ? ORDER BY position, created_at`)
    .all(name);

  return NextResponse.json({ ...(object ?? { name }), fields });
}
