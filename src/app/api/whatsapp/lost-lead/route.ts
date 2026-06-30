import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, activities, leadCandidates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { invalidateChatCache } from "@/lib/whatsapp";

// Marca un chat como LEAD PERDIDO: hubo conversación comercial pero el contacto
// no quiso / no necesita. A diferencia de dismiss-chat (que oculta el chat del
// inbox), acá se crea (o actualiza) el CONTACTO con archived=true, que es lo
// que alimenta la columna "Perdidos" del pipeline — así queda la contabilidad
// de cuántos prospectos reales dijeron que no.
export async function POST(request: NextRequest) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  const { chatJid, name, phone, reason } = body as {
    chatJid?: string; name?: string; phone?: string; reason?: string;
  };
  if (!chatJid) return NextResponse.json({ error: "chatJid es requerido" }, { status: 400 });

  const now = new Date();
  const lostReason = reason?.trim() || "Lead perdido: no quiere / no necesita";

  try {
    const result = db.transaction((tx) => {
      // El candidate aporta score/temperatura y se marca dismissed: eso saca
      // el chat del historial de Conversaciones (listChats filtra dismissed),
      // igual que archivar. Si no hay candidate, se crea uno dismissed.
      const candidate = tx
        .select()
        .from(leadCandidates)
        .where(eq(leadCandidates.chatJid, chatJid))
        .get();
      if (candidate) {
        if (candidate.status !== "dismissed") {
          tx.update(leadCandidates)
            .set({ status: "dismissed", updatedAt: now })
            .where(eq(leadCandidates.id, candidate.id))
            .run();
        }
      } else {
        tx.insert(leadCandidates)
          .values({
            name: name?.trim() || chatJid.split("@")[0],
            phone: `+${chatJid.split("@")[0]}`,
            chatJid,
            score: 0,
            temperature: "cold",
            reason: lostReason,
            source: "whatsapp",
            status: "dismissed",
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      const existing = tx
        .select()
        .from(contacts)
        .where(eq(contacts.whatsappJid, chatJid))
        .get();

      if (existing) {
        const updated = tx
          .update(contacts)
          .set({ archived: true, disqualifyReason: lostReason, updatedAt: now })
          .where(eq(contacts.id, existing.id))
          .returning()
          .get();
        tx.insert(activities)
          .values({
            type: "note",
            description: `Marcado como lead perdido desde Conversaciones: ${lostReason}`,
            contactId: existing.id,
            createdAt: now,
          })
          .run();
        return { contact: updated, action: "lost-existing" as const };
      }

      const created = tx
        .insert(contacts)
        .values({
          name: name?.trim() || `+${chatJid.split("@")[0]}`,
          phone: phone?.trim() || `+${chatJid.split("@")[0]}`,
          source: "whatsapp",
          temperature: (candidate?.temperature as "hot" | "warm" | "cold" | undefined) ?? "cold",
          score: candidate?.score ?? 0,
          stage: "Prospecto",
          probability: 0,
          valueCents: 0,
          whatsappJid: chatJid,
          archived: true,
          disqualifyReason: lostReason,
          notes: candidate?.reason ? `Señal al momento de perderlo: ${candidate.reason}` : null,
          lastInteractionAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      tx.insert(activities)
        .values({
          type: "note",
          description: `Marcado como lead perdido desde Conversaciones: ${lostReason}`,
          contactId: created.id,
          createdAt: now,
        })
        .run();
      return { contact: created, action: "lost-new" as const };
    });

    invalidateChatCache();
    return NextResponse.json(result, { status: result.action === "lost-new" ? 201 : 200 });
  } catch (e) {
    console.error(`[lost-lead] error para ${chatJid}:`, e);
    return NextResponse.json(
      { error: `No se pudo marcar como perdido: ${e instanceof Error ? e.message : "desconocido"}` },
      { status: 500 }
    );
  }
}
