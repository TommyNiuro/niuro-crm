import { NextResponse } from "next/server";
import { rawDb } from "@/db";
import { runFullSync } from "@/lib/crm-sync";

// Tick de sync (Fase A, solo lectura) con otra instancia de Niuro CRM. Mismo
// patron que /api/workflows/tick: pensado para que lo dispare un scheduler
// externo (o el mismo poller que ya dispara workflows) cada N minutos. Si
// crm_sync_url no esta configurada, cada tabla falla rapido y sin romper nada
// (ver runFullSync/pullTable en @/lib/crm-sync).
export async function POST() {
  try {
    const results = await runFullSync(rawDb);
    return NextResponse.json(results);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
