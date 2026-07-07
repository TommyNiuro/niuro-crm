import { NextRequest, NextResponse } from "next/server";
import { getMessages, dbExists } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!dbExists()) {
    return NextResponse.json(
      { error: "WhatsApp no esta conectado todavia." },
      { status: 503 }
    );
  }
  const { searchParams } = new URL(request.url);
  const chatJid = searchParams.get("chat_jid");
  const limit = Number(searchParams.get("limit")) || undefined;
  if (!chatJid) {
    return NextResponse.json({ error: "chat_jid es requerido" }, { status: 400 });
  }
  try {
    return NextResponse.json(getMessages({ chatJid, limit }));
  } catch (error) {
    return NextResponse.json(
      { error: `Error al leer mensajes: ${error instanceof Error ? error.message : "desconocido"}` },
      { status: 500 }
    );
  }
}
