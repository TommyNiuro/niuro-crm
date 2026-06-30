import { NextRequest, NextResponse } from "next/server";
import { resolveSenderPhone } from "@/lib/lid";

// GET /api/whatsapp/resolve-sender?sender=<id> → { phone: "569..." | null }
// Resuelve el autor de un mensaje de grupo (LID/formato viejo) a teléfono real.
export async function GET(req: NextRequest) {
  const sender = req.nextUrl.searchParams.get("sender");
  if (!sender) return NextResponse.json({ error: "sender requerido" }, { status: 400 });
  return NextResponse.json({ phone: resolveSenderPhone(sender) });
}
