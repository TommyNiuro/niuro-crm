import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, leadCandidates } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Mapa de enlaces WhatsApp ↔ CRM: para cada chat, indica si ya es un contacto
 * y/o un candidato pendiente. Lo usan el inbox y la lista de leads para mostrar
 * el estado y enlazar al registro del CRM. Liviano (toda la tabla en una llamada).
 */
export async function GET() {
  const cs = db
    .select({
      id: contacts.id,
      name: contacts.name,
      temperature: contacts.temperature,
      whatsappJid: contacts.whatsappJid,
      phone: contacts.phone,
    })
    .from(contacts)
    .all();

  const pendingCands = db
    .select({
      chatJid: leadCandidates.chatJid,
      score: leadCandidates.score,
      temperature: leadCandidates.temperature,
    })
    .from(leadCandidates)
    .where(eq(leadCandidates.status, "pending"))
    .all();

  return NextResponse.json({
    contacts: cs,
    pendingChatJids: pendingCands.map((c) => c.chatJid),
    pending: pendingCands, // {chatJid, score, temperature}
  });
}
