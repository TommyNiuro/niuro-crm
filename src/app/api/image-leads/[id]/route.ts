import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { imageLeads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { unlink } from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

// DELETE /api/image-leads/[id] → borra la fila y el archivo de imagen del disco.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(imageLeads).where(eq(imageLeads.id, id)).get();
  if (!row) {
    return NextResponse.json({ error: "Captura no encontrada" }, { status: 404 });
  }

  // Borra el archivo solo si vive dentro de uploads (defensa path traversal).
  const resolved = path.resolve(row.imagePath);
  if (resolved.startsWith(UPLOADS_DIR + path.sep)) {
    await unlink(resolved).catch(() => {
      /* el archivo ya no existe — seguimos con el borrado de la fila */
    });
  }

  db.delete(imageLeads).where(eq(imageLeads.id, id)).run();
  return NextResponse.json({ ok: true });
}
