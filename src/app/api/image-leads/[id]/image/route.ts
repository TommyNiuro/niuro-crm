import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { imageLeads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readFile } from "fs/promises";
import path from "path";
import { uploadsDir } from "@/lib/paths";

const UPLOADS_DIR = uploadsDir();

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

// GET /api/image-leads/[id]/image → sirve el archivo subido.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(imageLeads).where(eq(imageLeads.id, id)).get();
  if (!row) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  // Defensa contra path traversal: el archivo DEBE vivir dentro de uploads.
  const resolved = path.resolve(row.imagePath);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
    return NextResponse.json({ error: "Ruta invalida" }, { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(resolved);
  } catch {
    return NextResponse.json({ error: "Imagen no disponible" }, { status: 404 });
  }

  const ext = path.extname(resolved).slice(1).toLowerCase();
  const contentType = MIME_BY_EXT[ext] || "application/octet-stream";

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
