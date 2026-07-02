import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getQr } from "@/lib/bridge-manager";
import { invalidateChatCache } from "@/lib/whatsapp";

// Estado del pairing para la UI. Cuando pasa a "connected" por primera vez,
// dispara el sync inicial del historial al crm.db (el lock de sync-wa evita
// corridas solapadas si esto se llamara dos veces).
let syncKicked = false;

export async function GET() {
  const state = await getQr();
  if (!state) {
    return NextResponse.json({ status: "offline" });
  }

  if (state.status === "connected" && !syncKicked) {
    syncKicked = true;
    try {
      // Sync full en background: puede tardar (miles de mensajes). La UI sigue
      // andando; el inbox se va poblando. stdio ignore + detached + unref.
      const child = spawn("npx", ["tsx", path.join("scripts", "sync-wa.ts")], {
        cwd: process.cwd(),
        env: process.env,
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    } catch {
      syncKicked = false; // permitir reintento en el próximo poll
    }
    invalidateChatCache();
  }

  return NextResponse.json(state);
}
