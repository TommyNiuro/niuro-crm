import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, activities, leadCandidates, tasks, stepTransitions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getMessages, dbExists } from "@/lib/whatsapp";
import { scoreLead } from "@/lib/score-lead";
import { getRubricConfig } from "@/lib/score-lead-server";
import { STAGE_CFG } from "@/lib/crm-ui";

function mediaLabel(mediaType: string | null): string {
  const labels: Record<string, string> = {
    image: "[imagen]", video: "[video]", audio: "[nota de voz]",
    document: "[documento]", sticker: "[sticker]",
  };
  return mediaType ? labels[mediaType] || `[${mediaType}]` : "";
}

export async function POST(request: NextRequest) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  const {
    name, email, phone, chatJid, notes,
    company, stage, valueCents, role, seniority, headcount, urgency,
    nextAction, followUpDate, jobDescription, salesIntel,
  } = body as {
    name?: string; email?: string | null; phone?: string; chatJid?: string; notes?: string;
    company?: string | null; stage?: string | null;
    valueCents?: number | null; role?: string | null;
    seniority?: string | null; headcount?: number | null;
    urgency?: string | null; nextAction?: string | null;
    followUpDate?: string | null; jobDescription?: string | null;
    salesIntel?: Record<string, unknown> | null;
  };

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  // Idempotencia (auditoría 2026-06-09): un doble submit o retry del cliente no
  // debe duplicar el contacto. El índice único parcial en whatsapp_jid es el
  // respaldo a nivel DB.
  if (chatJid) {
    const existing = db.select().from(contacts).where(eq(contacts.whatsappJid, chatJid)).get();
    if (existing) {
      return NextResponse.json(
        { contact: existing, alreadyExists: true },
        { status: 200 }
      );
    }
  }
  // Mismo telefono con otro jid (lid vs jid, o importado sin WhatsApp): tambien
  // es el mismo contacto. Sin esto se duplica el directorio.
  if (phone?.trim()) {
    const existingByPhone = db.select().from(contacts).where(eq(contacts.phone, phone.trim())).get();
    if (existingByPhone) {
      return NextResponse.json({ contact: existingByPhone, alreadyExists: true }, { status: 200 });
    }
  }

  // 1) Trae los mensajes recientes (para scoring + para guardar la conversación como actividad).
  const messages =
    chatJid && dbExists()
      ? getMessages({ chatJid, limit: 60 }).filter(
          (m) => (m.content && m.content.trim()) || m.mediaType
        )
      : [];

  const lastMsg = messages[messages.length - 1];
  const lastMsgDate = lastMsg?.timestamp ? new Date(lastMsg.timestamp) : null;

  // 2) Corre la rúbrica. Si el chat tiene un candidate cacheado con breakdown,
  //    se podría reusar; pero como aquí ya tenemos los mensajes a mano y la
  //    rúbrica es barata, corremos fresh para que el breakdown del contacto
  //    coincida con el momento de guardarlo.
  const sl = scoreLead(
    messages.map((m) => ({ content: m.content, isFromMe: m.isFromMe, timestamp: m.timestamp, mediaType: m.mediaType })),
    name.trim(),
    { rubric: getRubricConfig() }
  );

  const now = new Date();
  const validStage = stage && STAGE_CFG[stage] ? stage : null;
  // probability por etapa: fuente única en STAGE_CFG (antes había un mapa inline aquí)
  const stageProbability = STAGE_CFG[validStage || "Prospecto"]?.probability ?? 5;
  let contact;
  try {
    // Combinar metadata extraida en las notas para no perder info que no encaja en columnas
    const metaLines: string[] = [];
    if (company) metaLines.push(`Empresa: ${company}`);
    if (role) metaLines.push(`Rol: ${role}${seniority ? ` (${seniority})` : ""}`);
    if (headcount && headcount > 1) metaLines.push(`Headcount: ${headcount}`);
    if (urgency) metaLines.push(`Urgencia: ${urgency}`);
    const fullNotes = [notes?.trim(), metaLines.length ? metaLines.join(" · ") : null]
      .filter(Boolean)
      .join("\n");

    // Transacción (auditoría 2026-06-09): contacto + tarea + transición + actividad
    // + aprobación del candidate son una unidad — o entra todo o no entra nada.
    contact = db.transaction((tx) => {
      const created = tx
        .insert(contacts)
        .values({
          name: name.trim(),
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          company: company?.trim() || null,
          jobDescription: jobDescription?.trim() || null,
          salesIntel: salesIntel && typeof salesIntel === "object" && Object.keys(salesIntel).length > 0
            ? JSON.stringify({ ...salesIntel, updatedAt: now.toISOString() })
            : null,
          source: "whatsapp",
          temperature: sl.temperature,
          score: sl.score,
          stage: validStage || "Prospecto",
          probability: stageProbability,
          valueCents: typeof valueCents === "number" && valueCents > 0 ? valueCents : 0,
          whatsappJid: chatJid || null,
          notes: fullNotes || null,
          scoreBreakdown: JSON.stringify({
            breakdown: sl.breakdown,
            signals: sl.signals,
            base: sl.base,
            reason: sl.reason,
            mode: sl.mode,
            updatedAt: now.toISOString(),
          }),
          lastInteractionAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      // Si el stage es distinto de Prospecto, crear tarea del playbook + step_transition
      if (validStage && validStage !== "Prospecto") {
        const cfg = STAGE_CFG[validStage];
        if (cfg) {
          const due = new Date(now.getTime() + cfg.dueInDays * 86400000);
          tx.insert(tasks)
            .values({
              contactId: created.id,
              title: cfg.task,
              stepName: validStage,
              dueAt: due,
              status: "open",
              createdAt: now,
            })
            .run();
          tx.update(contacts)
            .set({ nextAction: cfg.task, nextStepDue: due, updatedAt: now })
            .where(eq(contacts.id, created.id))
            .run();
        }
      } else if (nextAction?.trim()) {
        const due = followUpDate ? new Date(followUpDate) : new Date(now.getTime() + 2 * 86400000);
        tx.update(contacts)
          .set({ nextAction: nextAction.trim(), nextStepDue: due, updatedAt: now })
          .where(eq(contacts.id, created.id))
          .run();
        tx.insert(tasks)
          .values({
            contactId: created.id,
            title: nextAction.trim(),
            stepName: validStage || "Prospecto",
            dueAt: due,
            status: "open",
            createdAt: now,
          })
          .run();
      }
      if (validStage) {
        tx.insert(stepTransitions)
          .values({ contactId: created.id, fromStep: null, toStep: validStage, occurredAt: now })
          .run();
      }

      // Extracto de la conversación como actividad
      if (messages.length > 0) {
        const digest = messages
          .slice(-8)
          .map((m) => `${m.isFromMe ? "Yo" : "Lead"}: ${m.content?.trim() || mediaLabel(m.mediaType)}`)
          .join("\n");
        tx.insert(activities).values({
          type: "note",
          description: `Conversacion de WhatsApp (${messages.length} mensajes):\n${digest}`,
          contactId: created.id,
          dealId: null,
          scheduledAt: null,
          completedAt: lastMsgDate && !isNaN(lastMsgDate.getTime()) ? lastMsgDate : now,
          createdAt: lastMsgDate && !isNaN(lastMsgDate.getTime()) ? lastMsgDate : now,
        }).run();
      }

      // Si había un lead_candidate pendiente para este chat, márcalo aprobado.
      if (chatJid) {
        const cand = tx
          .select()
          .from(leadCandidates)
          .where(and(eq(leadCandidates.chatJid, chatJid), eq(leadCandidates.status, "pending")))
          .get();
        if (cand) {
          tx.update(leadCandidates)
            .set({ status: "approved", contactId: created.id, updatedAt: now })
            .where(eq(leadCandidates.id, cand.id))
            .run();
        }
      }

      return created;
    });
  } catch (error) {
    console.error("[save-lead] Error al crear contacto:", error);
    return NextResponse.json(
      { error: `Error al crear contacto: ${error instanceof Error ? error.message : "desconocido"}` },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      contact,
      classification: {
        temperature: sl.temperature,
        score: sl.score,
        breakdown: sl.breakdown,
        reason: sl.reason,
        nextAction: sl.recommendation === "save"
          ? "Responder hoy: oportunidad activa."
          : sl.recommendation === "review"
          ? "Dar seguimiento esta semana."
          : "Nutrir; señal débil o antigua.",
        mode: sl.mode,
      },
    },
    { status: 201 }
  );
}
