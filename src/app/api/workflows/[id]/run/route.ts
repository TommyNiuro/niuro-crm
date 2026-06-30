import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/db";
import { runWorkflow, loadWorkflow, loadRecord } from "@/lib/workflows/engine";

// Disparo manual de un workflow (b4-engine). Corre los steps en serie y devuelve
// el resultado del run (status + logs + context final). El body opcional se
// inyecta como context inicial (ej. {record:{...}} para probar un record_event).
// Si trae recordId (y el workflow tiene objectName en trigger_config), carga ese
// registro real y lo inyecta como `record`/`recordId` (simula el record_event).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = rawDb.prepare(`SELECT * FROM workflows WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: "workflow no encontrado" }, { status: 404 });

  let ctx: Record<string, unknown> = {};
  try {
    const body = await request.json();
    if (body && typeof body === "object") ctx = body as Record<string, unknown>;
  } catch {
    // body vacío: context vacío, válido para triggerType 'manual'
  }

  const recordId = typeof ctx.recordId === "string" ? ctx.recordId : undefined;
  if (recordId && !ctx.record) {
    let objectName: string | undefined;
    try { objectName = JSON.parse((row.trigger_config as string) || "{}").objectName; } catch { /* config vacío */ }
    if (objectName) {
      try {
        const record = loadRecord(objectName, recordId);
        if (!record) return NextResponse.json({ error: `registro ${recordId} no existe en ${objectName}` }, { status: 404 });
        ctx = { ...ctx, record, objectName };
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
      }
    }
  }

  const result = await runWorkflow(loadWorkflow(row), ctx);
  return NextResponse.json(result);
}
