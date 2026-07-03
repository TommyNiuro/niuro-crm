import { NextResponse } from "next/server";
import { generateTasksFromConversations } from "@/lib/task-intel";

// POST /api/tasks/ai-sync: lee las conversaciones del pipeline y genera
// tareas accionables (ver src/lib/task-intel.ts). On-demand desde el botón
// de la sección Tareas; una sola llamada IA por corrida.
export async function POST() {
  try {
    const result = await generateTasksFromConversations();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error generando tareas" },
      { status: 500 }
    );
  }
}
