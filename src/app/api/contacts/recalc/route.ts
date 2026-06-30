import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMessages, dbExists } from "@/lib/whatsapp";
import { checkDisqualifier, DISQ_LABEL } from "@/lib/disqualify";

// POST /api/contacts/recalc
// T1: recorre los contactos, corre los descalificadores sobre su conversacion de
// WhatsApp y archiva los que no son leads (ej. Laura, conversacion personal).
export async function POST() {
  if (!dbExists()) {
    return NextResponse.json({ error: "WhatsApp no conectado" }, { status: 503 });
  }
  const all = db.select().from(contacts).all();
  const now = new Date();
  const archived: { name: string; reason: string }[] = [];

  for (const c of all) {
    if (c.archived) continue;
    const jid = c.whatsappJid || (c.phone ? `${c.phone.replace(/\D/g, "")}@s.whatsapp.net` : null);
    if (!jid) continue;
    let msgs;
    try {
      msgs = getMessages({ chatJid: jid, limit: 300 });
    } catch {
      continue;
    }
    if (msgs.length === 0) continue;
    // c.name activa la protección por token de empresa: un contacto calificado
    // ("Juan Pérez ACME") no se archiva por menciones personales incidentales.
    const reason = checkDisqualifier(msgs.map((m) => ({ content: m.content, isFromMe: m.isFromMe })), c.name);
    if (reason) {
      db.update(contacts)
        .set({ archived: true, disqualifyReason: DISQ_LABEL[reason] || reason, updatedAt: now })
        .where(eq(contacts.id, c.id))
        .run();
      archived.push({ name: c.name, reason: DISQ_LABEL[reason] || reason });
    }
  }

  return NextResponse.json({ archived, count: archived.length });
}
