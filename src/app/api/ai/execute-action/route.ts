import { NextRequest, NextResponse } from "next/server";
import { executeAction, type ProposedAction } from "@/lib/ai/tools";

// POST /api/ai/execute-action -> ejecuta una accion propuesta YA confirmada por
// el usuario (propose_update / propose_create) contra la tabla real. La accion se
// re-valida contra el whitelist en executeAction: el cliente no es de fiar.
// Body: { action: {kind:"update"|"create", objectName, id?, fields} }
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const action = (body as { action?: unknown })?.action as ProposedAction | undefined;
  if (!action || (action.kind !== "update" && action.kind !== "create")) {
    return NextResponse.json({ error: "action invalida (kind debe ser update o create)" }, { status: 400 });
  }

  try {
    const result = executeAction(action);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 400 });
  }
}
