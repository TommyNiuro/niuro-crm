import { NextResponse } from "next/server";
import { runScheduled } from "@/lib/workflows/dispatch";

// Tick de workflows 'scheduled' (b4-engine). Corre los que estén vencidos por
// intervalMinutes. Diseñado para que lo pinche un scheduler externo cada minuto.
//
// CÓMO CABLEARLO (no toco launchd):
//   Opción A (launchd): un .plist con StartInterval=60 que haga
//     curl -s -X POST http://127.0.0.1:3030/api/workflows/tick
//   Opción B (cron):  * * * * * curl -s -X POST http://127.0.0.1:3030/api/workflows/tick
//   Opción C (in-process, dev): un setInterval(60_000) en el arranque del server
//     que haga fetch a esta ruta. NO lo dejo activo por defecto para no acoplar
//     el motor al ciclo de vida de Next en dev.
export async function POST() {
  try {
    const result = await runScheduled();
    return NextResponse.json(result);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
