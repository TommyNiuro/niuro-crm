import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leadCandidates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { invalidateChatCache } from "@/lib/whatsapp";

// Marca el chat como descartado en lead_candidates. Si no existe candidate
// pendiente, crea uno con status='dismissed' para que el scanner no lo
// vuelva a proponer y quede el registro de la decisión.
export async function POST(request: NextRequest) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON invalido" }, { status: 400 }); }

  const { chatJid, name, phone, reason } = body as {
    chatJid?: string; name?: string; phone?: string; reason?: string;
  };
  if (!chatJid) return NextResponse.json({ error: "chatJid es requerido" }, { status: 400 });

  const now = new Date();
  // Buscar CUALQUIER candidate del chat, no solo pending: chat_jid tiene índice
  // único, así que si ya existía uno (aprobado o descartado antes) el INSERT de
  // abajo tiraba SqliteError -> 500. Se actualiza el que haya.
  const existing = db
    .select()
    .from(leadCandidates)
    .where(eq(leadCandidates.chatJid, chatJid))
    .get();

  if (existing) {
    const updated = db
      .update(leadCandidates)
      .set({ status: "dismissed", reason: reason || existing.reason, updatedAt: now })
      .where(eq(leadCandidates.id, existing.id))
      .returning()
      .get();
    invalidateChatCache();
    return NextResponse.json({ candidate: updated, action: "dismissed-existing" });
  }

  const created = db
    .insert(leadCandidates)
    .values({
      name: name?.trim() || chatJid.split("@")[0],
      phone: phone || null,
      chatJid,
      score: 0,
      temperature: "cold",
      reason: reason || "Descartado desde Conversaciones",
      nextAction: null,
      source: "whatsapp",
      status: "dismissed",
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  invalidateChatCache();
  return NextResponse.json({ candidate: created, action: "dismissed-new" }, { status: 201 });
}

// Revertir archivado: borra el lead_candidate dismissed para que el chat reaparezca en el inbox.
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chatJid = searchParams.get("chatJid");
  if (!chatJid) return NextResponse.json({ error: "chatJid es requerido" }, { status: 400 });

  const existing = db
    .select()
    .from(leadCandidates)
    .where(and(eq(leadCandidates.chatJid, chatJid), eq(leadCandidates.status, "dismissed")))
    .get();
  if (!existing) return NextResponse.json({ error: "Chat no estaba archivado" }, { status: 404 });

  db.delete(leadCandidates).where(eq(leadCandidates.id, existing.id)).run();
  invalidateChatCache();
  return NextResponse.json({ ok: true, restored: chatJid });
}
