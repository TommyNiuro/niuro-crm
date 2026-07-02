import { NextResponse } from "next/server";
import { ensureBridge } from "@/lib/bridge-manager";

// Arranca el bridge de WhatsApp (idempotente). La UI llama a esto al tocar
// "Conectar" y después poll-ea /api/whatsapp/qr para mostrar el QR.
export async function POST() {
  const r = await ensureBridge();
  if (!r.running) {
    return NextResponse.json({ error: r.error ?? "No se pudo arrancar el bridge" }, { status: 500 });
  }
  return NextResponse.json({ running: true });
}
