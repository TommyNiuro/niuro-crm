import { NextRequest, NextResponse } from "next/server";
import { runCopilot, type ChatMessage } from "@/lib/ai/copilot";

// POST /api/ai/chat -> corre el copiloto IA (tool-use sobre los datos del CRM).
// Body: { messages: [{role:"user"|"assistant", content}] }
// Respuesta: { answer, actions, toolTrace }
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: "messages requerido (array no vacio)" }, { status: 400 });
  }

  const messages: ChatMessage[] = [];
  for (const m of raw) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role === "user" || role === "assistant") && typeof content === "string") {
      messages.push({ role, content });
    }
  }
  if (messages.length === 0) {
    return NextResponse.json({ error: "ningun mensaje valido" }, { status: 400 });
  }

  // system opcional: lo usa "Probar agente" en Settings IA para correr el
  // copiloto con el rol/prompt de un ai_agent.
  const system = (body as { system?: unknown })?.system;
  const systemOverride = typeof system === "string" && system.trim() ? system : undefined;

  // tools opcional: restringe que herramientas puede usar el copiloto en esta
  // corrida (lo usa "Probar agente" para validar el subset configurado del agente).
  const toolsRaw = (body as { tools?: unknown })?.tools;
  const allowedTools = Array.isArray(toolsRaw) ? toolsRaw.filter((t): t is string => typeof t === "string") : undefined;

  try {
    const result = await runCopilot(messages, systemOverride, allowedTools);
    return NextResponse.json(result);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
