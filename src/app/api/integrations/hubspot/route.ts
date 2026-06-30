import { NextResponse } from "next/server"
import { db } from "@/db"
import { contacts, integrations } from "@/db/schema"
import { eq } from "drizzle-orm"
import { listAllContacts, createContact, updateContact, searchContactByEmail } from "@/lib/hubspot"

export async function POST() {
  if (!process.env.HUBSPOT_API_KEY) {
    return NextResponse.json({ error: "HUBSPOT_API_KEY no configurado en .env.local" }, { status: 400 })
  }

  try {
    const hsContacts = await listAllContacts()
    const crmContacts = db.select().from(contacts).where(eq(contacts.archived, false)).all()

    const crmByEmail = new Map(
      crmContacts.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c])
    )
    const hsByEmail = new Map(
      hsContacts.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c])
    )

    let created = 0
    let updated = 0

    for (const hs of hsContacts) {
      if (!hs.email) continue
      const key = hs.email.toLowerCase()
      const crm = crmByEmail.get(key)
      if (!crm) {
        db.insert(contacts).values({
          name: hs.name ?? hs.email,
          email: hs.email,
          phone: hs.phone ?? undefined,
          company: hs.company ?? undefined,
          source: "hubspot",
        }).run()
        created++
      } else {
        const crmUpdated = crm.updatedAt?.getTime() ?? 0
        const hsUpdated = hs.updatedAt ? new Date(hs.updatedAt).getTime() : 0
        if (hsUpdated > crmUpdated) {
          db.update(contacts)
            .set({
              name: hs.name ?? crm.name,
              phone: hs.phone ?? crm.phone ?? undefined,
              company: hs.company ?? crm.company ?? undefined,
              updatedAt: new Date(),
            })
            .where(eq(contacts.id, crm.id))
            .run()
          updated++
        }
      }
    }

    for (const crm of crmContacts) {
      if (!crm.email) continue
      const key = crm.email.toLowerCase()
      if (hsByEmail.has(key)) {
        const hs = hsByEmail.get(key)!
        const crmUpdated = crm.updatedAt?.getTime() ?? 0
        const hsUpdated = hs.updatedAt ? new Date(hs.updatedAt).getTime() : 0
        if (crmUpdated > hsUpdated) {
          const nameParts = crm.name.trim().split(/\s+/)
          await updateContact(hs.id, {
            firstname: nameParts[0] ?? "",
            lastname: nameParts.slice(1).join(" "),
            ...(crm.phone ? { phone: crm.phone } : {}),
            ...(crm.company ? { company: crm.company } : {}),
          })
          updated++
        }
      } else {
        const existing = await searchContactByEmail(crm.email).catch(() => null)
        if (!existing) {
          await createContact({
            email: crm.email,
            name: crm.name,
            phone: crm.phone,
            company: crm.company,
          })
          created++
        }
      }
    }

    const now = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago", hour12: false })
    db.update(integrations)
      .set({ connected: true, lastSync: now, leads: hsContacts.length })
      .where(eq(integrations.id, "hubspot"))
      .run()

    return NextResponse.json({ ok: true, created, updated, hubspot: hsContacts.length, crm: crmContacts.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
