import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/whatsapp";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { recipient, message, confirm } = body as { recipient?: string; message?: string; confirm?: boolean };
  if (!recipient || !message || !message.trim()) {
    return NextResponse.json(
      { error: "recipient y message son requeridos" },
      { status: 400 }
    );
  }

  // confirm:true obligatorio (auditoría 2026-06-09): este endpoint envía
  // mensajes REALES de WhatsApp a clientes. Un POST accidental (retry, script,
  // tooling) sin la intención explícita del UI no debe disparar nada.
  if (confirm !== true) {
    return NextResponse.json(
      { error: "Falta confirm:true — este endpoint envía mensajes reales de WhatsApp" },
      { status: 428 }
    );
  }
  console.log(`[whatsapp/send] → ${recipient}: ${message.slice(0, 80)}`);

  const result = await sendMessage(recipient, message);

  if (result.success) {
    const now = new Date();
    const contact = db.select({ id: contacts.id }).from(contacts).where(eq(contacts.whatsappJid, recipient)).get();
    if (contact) {
      db.insert(activities).values({
        type: "note",
        description: `WhatsApp enviado: ${message.slice(0, 200)}`,
        contactId: contact.id,
        completedAt: now,
        createdAt: now,
      }).run();
      db.update(contacts).set({ lastInteractionAt: now, updatedAt: now }).where(eq(contacts.id, contact.id)).run();
    }
  }

  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
