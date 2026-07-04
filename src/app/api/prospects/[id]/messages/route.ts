import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { prospects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runClaude, DEFAULT_MODEL } from "@/lib/claude-subprocess";
import { operator } from "@/lib/operator";
import { serializeProspect } from "@/lib/prospect-serialize";

// POST /api/prospects/[id]/messages → genera con IA los dos mensajes de
// outreach: 1) conexión (sin vender) y 2) oferta de staffing. Se guardan en el
// prospecto y son editables desde el panel de detalle.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.select().from(prospects).where(eq(prospects.id, id)).get();
  if (!row) return NextResponse.json({ error: "Prospecto no encontrado" }, { status: 404 });

  const roles = JSON.parse(row.roles || "[]") as string[];
  const stack = JSON.parse(row.stack || "[]") as string[];
  const target = row.contactName
    ? `${row.contactName}${row.contactTitle ? ` (${row.contactTitle})` : ""}`
    : "el decisor de contratación tech (no sabemos aún el nombre)";

  const prompt = `Sos ${operator.name} de ${operator.company} (${operator.pitch}).
Empresa objetivo: ${row.company}. Está buscando: ${roles.join("; ") || "ingenieros de software"}.
Stack: ${stack.join(", ") || "desconocido"}. La vacante más vieja lleva ${row.daysOpen} días abierta y tienen ${row.jobCount} vacante(s) abiertas.
Destinatario: ${target}.

Escribí DOS mensajes cortos en español, tono profesional cercano (LinkedIn/email), sin guión largo:

1. CONEXION: primer contacto SIN vender. Referencia concreta a su búsqueda real (rol/stack), un comentario genuino que muestre que entendés su desafío de contratación, y una pregunta liviana que abra conversación. Máximo 400 caracteres.

2. OFERTA: mensaje de seguimiento ofreciendo el staffing de Niuro: ingenieros senior de LATAM pre-vetted que se integran en días. Mencioná que puede correr en paralelo a su búsqueda actual, referenciá los ${row.daysOpen} días que lleva abierta la vacante si son más de 20 (es su dolor). Cierre con propuesta de llamada corta. Máximo 700 caracteres.

Respondé SOLO con JSON válido: {"connect": "...", "pitch": "..."}`;

  try {
    const raw = await runClaude(prompt, { model: DEFAULT_MODEL, timeoutMs: 90_000 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("La IA no devolvió JSON");
    const parsed = JSON.parse(jsonMatch[0]) as { connect?: string; pitch?: string };
    if (!parsed.connect || !parsed.pitch) throw new Error("JSON incompleto de la IA");

    const updated = db
      .update(prospects)
      .set({ msgConnect: parsed.connect, msgPitch: parsed.pitch, updatedAt: new Date() })
      .where(eq(prospects.id, id))
      .returning()
      .get();
    return NextResponse.json(serializeProspect(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error generando mensajes";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
