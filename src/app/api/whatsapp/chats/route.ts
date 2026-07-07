import { NextRequest, NextResponse } from "next/server";
import { loggedErrorDetail } from "@/lib/api-error";
import { listChats, dbExists } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!dbExists()) {
    return NextResponse.json(
      { error: "WhatsApp no esta conectado todavia (no se encontro la base de datos)." },
      { status: 503 }
    );
  }
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || undefined;
  const limit = Number(searchParams.get("limit")) || undefined;
  const includeArchived = searchParams.get("includeArchived") === "1";
  try {
    return NextResponse.json(listChats({ query, limit, includeArchived }));
  } catch (error) {
    return NextResponse.json(
      { error: `Error al leer chats: ${loggedErrorDetail(error)}` },
      { status: 500 }
    );
  }
}
