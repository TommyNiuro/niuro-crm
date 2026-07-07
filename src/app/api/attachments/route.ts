import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { readFile, writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import { uploadsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const UPLOADS_DIR = uploadsDir();
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

// Comprueba que una ruta guardada vive dentro de UPLOADS_DIR (anti path-traversal).
function insideUploads(p: string): boolean {
  const resolved = path.resolve(p);
  return resolved === UPLOADS_DIR || resolved.startsWith(UPLOADS_DIR + path.sep);
}

// GET /api/attachments?targetType=&targetId=  → lista adjuntos del registro.
// GET /api/attachments?id=                    → descarga el archivo.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const row = db.select().from(attachments).where(eq(attachments.id, id)).get();
    if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (!insideUploads(row.path)) {
      return NextResponse.json({ error: "Ruta invalida" }, { status: 400 });
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(path.resolve(row.path));
    } catch {
      return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        // El nombre original se sanea para no romper el header.
        "Content-Disposition": `attachment; filename="${row.name.replace(/["\r\n]/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");
  if (!targetType || !targetId) {
    return NextResponse.json({ error: "targetType y targetId son requeridos" }, { status: 400 });
  }
  const rows = db
    .select({
      id: attachments.id,
      name: attachments.name,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(and(eq(attachments.targetType, targetType), eq(attachments.targetId, targetId)))
    .orderBy(desc(attachments.createdAt))
    .all();
  return NextResponse.json(rows);
}

// POST /api/attachments  (multipart: file, targetType, targetId)
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Multipart invalido" }, { status: 400 });
  }
  const targetType = String(form.get("targetType") ?? "").trim();
  const targetId = String(form.get("targetId") ?? "").trim();
  const file = form.get("file");
  if (!targetType || !targetId) {
    return NextResponse.json({ error: "targetType y targetId son requeridos" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Archivo demasiado grande (max 25MB)" }, { status: 413 });
  }

  // El nombre que se guarda en disco lo generamos nosotros (uuid + extension): el
  // nombre del cliente NUNCA toca el filesystem, asi no hay path-traversal posible.
  const ext = path.extname(file.name).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
  const stored = path.join(UPLOADS_DIR, `att_${crypto.randomUUID()}${ext}`);
  try {
    await mkdir(UPLOADS_DIR, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(stored, buf);
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el archivo" }, { status: 500 });
  }

  // El nombre original (legible) se guarda solo en la DB para mostrar/descargar.
  const displayName = (file.name || "archivo").slice(0, 200);
  const row = db
    .insert(attachments)
    .values({ targetType, targetId, path: stored, name: displayName, createdAt: new Date() })
    .returning({ id: attachments.id, name: attachments.name, createdAt: attachments.createdAt })
    .get();
  return NextResponse.json(row, { status: 201 });
}

// DELETE /api/attachments?id=  → borra registro y archivo en disco.
export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const row = db.select().from(attachments).where(eq(attachments.id, id)).get();
  if (!row) return NextResponse.json({ ok: true });
  db.delete(attachments).where(eq(attachments.id, id)).run();
  if (insideUploads(row.path)) {
    await unlink(path.resolve(row.path)).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
