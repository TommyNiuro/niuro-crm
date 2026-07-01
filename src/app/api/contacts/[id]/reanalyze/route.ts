import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMessages, dbExists } from "@/lib/whatsapp";
import { scoreLead } from "@/lib/score-lead";
import { getRubricConfig } from "@/lib/score-lead-server";
import { extractLeadFromChat } from "@/lib/extract-lead";
import { logger } from "@/lib/logger";

/**
 * Re-analiza la conversación de WhatsApp de un contacto existente y refresca
 * el Brief de venta IA + los datos del deal (empresa, cargo, score, próximo paso).
 * Modo "Brief + datos": sobrescribe lo que la IA detecte.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const contact = db.select().from(contacts).where(eq(contacts.id, id)).get();
  if (!contact) {
    return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  }

  const phoneDigits = (contact.phone || "").replace(/\D/g, "");
  const chatJid = contact.whatsappJid || (phoneDigits ? `${phoneDigits}@s.whatsapp.net` : null);

  if (!chatJid || !dbExists()) {
    return NextResponse.json(
      { error: "Este contacto no tiene una conversación de WhatsApp vinculada." },
      { status: 400 }
    );
  }

  // 1) Extracción IA — llamada DIRECTA a la lib (auditoría 2026-06-09: antes
  // hacía fetch HTTP a sí mismo sin timeout, colgando el request hasta 180s).
  let extracted: Awaited<ReturnType<typeof extractLeadFromChat>> = null;
  try {
    extracted = await extractLeadFromChat(chatJid, contact.stage);
  } catch (err) {
    logger.error("contacts.reanalyze", "extractLeadFromChat error", {
      contactId: id,
      chatJid,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  if (!extracted || extracted.mode !== "ai") {
    return NextResponse.json(
      { error: "No se pudo analizar la conversación. Intenta de nuevo en unos segundos." },
      { status: 502 }
    );
  }

  // 2) Recalcula score con la rúbrica sobre los mensajes actuales.
  const msgs = getMessages({ chatJid, limit: 60 }).filter(
    (m) => (m.content && m.content.trim()) || m.mediaType
  );
  const sl = scoreLead(
    msgs.map((m) => ({ content: m.content, isFromMe: m.isFromMe, timestamp: m.timestamp, mediaType: m.mediaType })),
    contact.name,
    { rubric: getRubricConfig() }
  );

  const now = new Date();
  const e = extracted as {
    painPoints?: string[]; budgetSignal?: string | null; decisionMaker?: boolean | null;
    keyObjections?: string[]; openQuestions?: string[]; responseStrategy?: string | null;
    salesSignals?: { positive?: string[]; negative?: string[] };
    objectionHandling?: { objection: string; counterArg: string }[];
    competitor?: { name: string; positioning: string[] } | null;
    stageMismatch?: { declaredStage: string; realStage: string; reason: string } | null;
    stack?: string[]; seniority?: string | null; urgency?: string | null; headcount?: number;
    company?: string | null; jobDescription?: string | null; notes?: string | null; nextStep?: string | null;
  };

  // Protección del brief (auditoría 2026-06-09): extract-lead hace 2 llamadas IA
  // (basic + intel). Si la de intel falló, llega mode:"ai" con los campos del brief
  // vacíos — en ese caso NO sobrescribir un brief existente con la nada.
  const hasIntel = Boolean(
    (e.painPoints && e.painPoints.length) ||
    (e.keyObjections && e.keyObjections.length) ||
    (e.openQuestions && e.openQuestions.length) ||
    e.responseStrategy ||
    ((e.salesSignals?.positive?.length ?? 0) + (e.salesSignals?.negative?.length ?? 0) > 0) ||
    (e.objectionHandling && e.objectionHandling.length) ||
    e.competitor
  );

  const salesIntel = {
    painPoints: e.painPoints ?? [],
    budgetSignal: e.budgetSignal ?? null,
    decisionMaker: e.decisionMaker ?? null,
    keyObjections: e.keyObjections ?? [],
    openQuestions: e.openQuestions ?? [],
    responseStrategy: e.responseStrategy ?? null,
    salesSignals: e.salesSignals ?? { positive: [], negative: [] },
    objectionHandling: e.objectionHandling ?? [],
    competitor: e.competitor ?? null,
    stageMismatch: e.stageMismatch ?? null,
    stack: e.stack ?? [],
    seniority: e.seniority ?? null,
    urgency: e.urgency ?? null,
    headcount: e.headcount ?? 1,
    updatedAt: now.toISOString(),
  };

  // 3) Update "Brief + datos": sobrescribe brief, empresa, cargo, score, próximo paso.
  const updateData: Record<string, unknown> = {
    temperature: sl.temperature,
    score: sl.score,
    scoreBreakdown: JSON.stringify({
      breakdown: sl.breakdown,
      signals: sl.signals,
      base: sl.base,
      reason: sl.reason,
      mode: sl.mode,
      updatedAt: now.toISOString(),
    }),
    updatedAt: now,
  };
  // Solo refrescar el brief si la IA realmente trajo inteligencia de venta,
  // o si el contacto aún no tiene brief (primer análisis).
  if (hasIntel || !contact.salesIntel) {
    updateData.salesIntel = JSON.stringify(salesIntel);
  }
  if (e.company && e.company.trim()) updateData.company = e.company.trim();
  if (e.jobDescription && e.jobDescription.trim()) updateData.jobDescription = e.jobDescription.trim();
  if (e.notes && e.notes.trim()) updateData.notes = e.notes.trim();
  if (e.nextStep && e.nextStep.trim()) updateData.nextAction = e.nextStep.trim();

  const updated = db
    .update(contacts)
    .set(updateData)
    .where(eq(contacts.id, id))
    .returning()
    .get();

  return NextResponse.json({ ok: true, contact: updated, briefRefreshed: hasIntel || !contact.salesIntel });
}
