import { NextResponse } from "next/server";
import { getStatus } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * Endpoint compacto para el watchdog. Devuelve 200 si todo OK, 503 si bridge caido.
 * El watchdog (scripts/watchdog-bridge.sh) lo consume cada 2 min.
 */
export async function GET() {
  try {
    const s = await getStatus();
    const healthy = s.bridgeUp && s.dbExists;
    return NextResponse.json(
      {
        ok: healthy,
        bridgeUp: s.bridgeUp,
        dbExists: s.dbExists,
        chatCount: s.chatCount,
        messageCount: s.messageCount,
        checkedAt: new Date().toISOString(),
      },
      { status: healthy ? 200 : 503 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 503 }
    );
  }
}
