import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, activities, leadCandidates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { invalidateChatCache } from "@/lib/whatsapp";

// Marca un chat como INGENIERO: no es un lead de venta sino un ingeniero que
// contactamos para el pool. Lo saca del inbox de Conversaciones (candidate
// dismissed) y del pipeline de ventas (contact_type='engineer'), y lo mete en
// el pipeline de ingenieros arrancando en "Contactado".
export async function POST(request: NextRequest) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  const { chatJid, name, phone } = body as { chatJid?: string; name?: string; phone?: string };
  if (!chatJid) return NextResponse.json({ error: "chatJid es requerido" }, { status: 400 });

  const now = new Date();

  try {
    const result = db.transaction((tx) => {
      // Saca el chat del inbox de Conversaciones (listChats filtra dismissed).
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
            reason: "Marcado como ingeniero",
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
          .set({ contactType: "engineer", stage: "Contactado", archived: false, updatedAt: now })
          .where(eq(contacts.id, existing.id))
          .returning()
          .get();
        tx.insert(activities)
          .values({
            type: "note",
            description: "Marcado como ingeniero desde Conversaciones",
            contactId: existing.id,
            createdAt: now,
          })
          .run();
        return { contact: updated, action: "engineer-existing" as const };
      }

      const created = tx
        .insert(contacts)
        .values({
          name: name?.trim() || `+${chatJid.split("@")[0]}`,
          phone: phone?.trim() || `+${chatJid.split("@")[0]}`,
          source: "whatsapp",
          contactType: "engineer",
          temperature: (candidate?.temperature as "hot" | "warm" | "cold" | undefined) ?? "cold",
          score: candidate?.score ?? 0,
          stage: "Contactado",
          probability: 0,
          valueCents: 0,
          whatsappJid: chatJid,
          archived: false,
          lastInteractionAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      tx.insert(activities)
        .values({
          type: "note",
          description: "Marcado como ingeniero desde Conversaciones",
          contactId: created.id,
          createdAt: now,
        })
        .run();
      return { contact: created, action: "engineer-new" as const };
    });

    invalidateChatCache();
    return NextResponse.json(result, { status: result.action === "engineer-new" ? 201 : 200 });
  } catch (e) {
    console.error(`[save-engineer] error para ${chatJid}:`, e);
    return NextResponse.json(
      { error: `No se pudo marcar como ingeniero: ${e instanceof Error ? e.message : "desconocido"}` },
      { status: 500 }
    );
  }
}
