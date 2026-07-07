import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { imageLeads } from "@/db/schema";
import { runImageLeadAnalysis } from "@/lib/analyze-image-lead";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { uploadsDir } from "@/lib/paths";
import crypto from "crypto";

const UPLOADS_DIR = uploadsDir();
const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB por imagen

// mime → extensión segura. La imagen se guarda como <uuid>.<ext> (SIN espacios)
// porque la @mención del CLI claude corta el path en el primer whitespace.
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Se esperaba multipart/form-data" }, { status: 400 });
  }

  // Acepta tanto "files" (varias) como "file" (una).
  const files = [...formData.getAll("files"), ...formData.getAll("file")].filter(
    (f): f is File => f instanceof File
  );
  if (files.length === 0) {
    return NextResponse.json({ error: "No se subio ninguna imagen" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Máximo ${MAX_FILES} imágenes por subida` }, { status: 413 });
  }

  await mkdir(UPLOADS_DIR, { recursive: true, mode: 0o700 });

  const created: unknown[] = [];
  const ids: string[] = [];

  for (const file of files) {
    const mime = (file.type || "").toLowerCase();
    if (!mime.startsWith("image/")) {
      // Solo imagenes: ignoramos lo demas en lugar de fallar todo el batch.
      continue;
    }
    // Tope de tamaño antes de bufferizar en memoria (arrayBuffer carga el archivo
    // entero): evita agotar RAM/disco con un upload gigante.
    if (file.size > MAX_FILE_BYTES) {
      console.warn(`[image-leads/upload] imagen ignorada por tamaño (${file.size} bytes)`);
      continue;
    }
    const ext = EXT_BY_MIME[mime] || "png";
    const id = crypto.randomUUID();
    const filePath = path.join(UPLOADS_DIR, `${id}.${ext}`);

    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      // mode 0600: la captura puede contener datos de un prospecto.
      await writeFile(filePath, bytes, { mode: 0o600 });
    } catch (err) {
      console.error("[image-leads/upload] no se pudo guardar la imagen:", err);
      continue;
    }

    const now = new Date();
    const row = db
      .insert(imageLeads)
      .values({
        id,
        imagePath: filePath,
        status: "analyzing",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    created.push(row);
    ids.push(id);
  }

  if (created.length === 0) {
    return NextResponse.json({ error: "Los archivos no son imagenes validas" }, { status: 400 });
  }

  // Dispara el analisis IA en segundo plano (fire-and-forget): el server de
  // next start vive el tiempo suficiente. La UI hace polling de GET /api/image-leads
  // hasta que status pase de 'analyzing' a 'ready'.
  for (const id of ids) {
    runImageLeadAnalysis(id).catch((err) =>
      console.error(`[image-leads/upload] analisis ${id} fallo:`, err)
    );
  }

  return NextResponse.json({ leads: created, count: created.length }, { status: 201 });
}
