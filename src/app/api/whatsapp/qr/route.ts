import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs";
import { getQr } from "@/lib/bridge-manager";
import { invalidateChatCache } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// La .app corre desde el bundle (sin scripts/) y con PATH GUI mínimo (sin npx/nvm).
// Resolvemos npx absoluto (versión más nueva de nvm, con fallbacks) y el dir del repo
// donde vive scripts/sync-wa.ts, igual que los wrappers launchd. El sync corre en un
// proceso aparte a propósito: better-sqlite3 es síncrono y correrlo in-process
// bloquearía el event loop del server durante el sync completo.
function resolveNpxBin(): string {
  const cands: string[] = [];
  if (process.env.CRM_NPX) cands.push(process.env.CRM_NPX);
  try {
    const base = path.join(os.homedir(), ".nvm", "versions", "node");
    for (const v of fs.readdirSync(base).sort().reverse()) cands.push(path.join(base, v, "bin", "npx"));
  } catch {
    // sin nvm: se cae a los fallbacks
  }
  cands.push("/opt/homebrew/bin/npx", "/usr/local/bin/npx");
  return cands.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || "npx";
}

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
      const npx = resolveNpxBin();
      const repoDir = process.env.CRM_REPO_DIR || path.join(os.homedir(), "niuro", "niuro-crm-oss");
      const child = spawn(npx, ["tsx", "scripts/sync-wa.ts"], {
        cwd: repoDir, // donde vive scripts/ (la .app no lo trae en su bundle)
        env: { ...process.env, PATH: `${path.dirname(npx)}:${process.env.PATH || ""}` },
        detached: true,
        stdio: "ignore",
      });
      // spawn falla async (evento 'error'), no por throw: sin este handler un fallo
      // quedaba sin capturar y syncKicked permanecía true para siempre (nunca
      // reintentaba). El sync periódico por launchd es la red de seguridad igual.
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
