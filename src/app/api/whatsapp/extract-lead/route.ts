import { NextRequest, NextResponse } from "next/server";
import { dbExists } from "@/lib/whatsapp";
import { extractLeadFromChat } from "@/lib/extract-lead";

// La lógica de extracción vive en @/lib/extract-lead (auditoría 2026-06-09,
// Fase 3): reanalyze la llama directo en vez de hacer fetch a esta ruta.

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { chatJid, declaredStage } = body as { chatJid?: string; declaredStage?: string };
  if (!chatJid) return NextResponse.json({ error: "chatJid requerido" }, { status: 400 });
  if (!dbExists()) return NextResponse.json({ error: "Bridge DB no disponible" }, { status: 503 });

  const result = await extractLeadFromChat(chatJid, declaredStage);
  if (!result) {
    return NextResponse.json({ error: "Conversacion vacia" }, { status: 404 });
  }

  return NextResponse.json(result);
}
