import { NextResponse } from "next/server";
import { getStatus } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getStatus());
  } catch (error) {
    return NextResponse.json(
      { error: `Error al leer estado: ${error instanceof Error ? error.message : "desconocido"}` },
      { status: 500 }
    );
  }
}
