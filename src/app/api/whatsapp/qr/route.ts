import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getQr } from "@/lib/bridge-manager";
import { invalidateChatCache } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

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
      // spawn falla async (evento 'error'), no por throw: sin este handler, un fallo
      // de PATH (la .app corre con PATH GUI mínimo, sin npx) quedaba sin capturar y
      // syncKicked permanecía true para siempre (nunca reintentaba). El sync periódico
      // por launchd es la red de seguridad.
      // TODO (auditoría): correr el sync in-process (refactor de sync-wa.ts a función
      // exportable) para no depender de npx/tsx en el PATH de la .app.
      child.on("error", (e) => {
        console.error("[whatsapp/qr] no se pudo lanzar el sync inicial:", e instanceof Error ? e.message : e);
        syncKicked = false; // permitir reintento en el próximo poll
      });
      child.unref();
    } catch {
      syncKicked = false; // permitir reintento en el próximo poll
    }
    invalidateChatCache();
  }

  return NextResponse.json(state);
}
