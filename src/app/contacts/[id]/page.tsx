import { db } from "@/db";
import { contacts, deals, activities, tasks, pipelineStages } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ContactDetailClient } from "@/components/contacts/ContactDetail";
import { getMessages, dbExists } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const contact = db.select().from(contacts).where(eq(contacts.id, id)).get();
  if (!contact) notFound();

  // Tarea abierta del playbook (la que vence primero)
  const openTask = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.contactId, id), eq(tasks.status, "open")))
    .orderBy(desc(tasks.dueAt))
    .limit(1)
    .get() ?? null;

  // WhatsApp
  const phoneDigits = (contact.phone || "").replace(/\D/g, "");
  const waJid =
    contact.whatsappJid || (phoneDigits ? `${phoneDigits}@s.whatsapp.net` : null);
  let waMessages: Awaited<ReturnType<typeof getMessages>> = [];
  if (waJid && dbExists()) {
    try {
      waMessages = getMessages({ chatJid: waJid, limit: 12 });
    } catch {
      waMessages = [];
    }
  }

  const contactDeals = db
    .select({
      id: deals.id,
      title: deals.title,
      value: deals.value,
      stageId: deals.stageId,
      probability: deals.probability,
      createdAt: deals.createdAt,
      stageName: pipelineStages.name,
      stageColor: pipelineStages.color,
    })
    .from(deals)
    .leftJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(eq(deals.contactId, id))
    .all();

  const contactActivities = db
    .select()
    .from(activities)
    .where(eq(activities.contactId, id))
    .orderBy(desc(activities.createdAt))
    .all();

  return (
    <ContactDetailClient
      contact={contact as Parameters<typeof ContactDetailClient>[0]["contact"]}
      openTask={openTask}
      deals={contactDeals as Parameters<typeof ContactDetailClient>[0]["deals"]}
      activities={contactActivities as Parameters<typeof ContactDetailClient>[0]["activities"]}
      whatsapp={{
        jid: waJid,
        messages: waMessages.map((m) => ({
          id: m.id,
          content: m.content,
          mediaType: m.mediaType,
          isFromMe: m.isFromMe,
          timestamp: m.timestamp,
        })),
      }}
    />
  );
}
