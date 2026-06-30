import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { contacts, activities } from "@/db/schema"
import { eq, like } from "drizzle-orm"
import { listTranscripts, getTranscript } from "@/lib/granola"

export async function GET() {
  const transcripts = await listTranscripts()
  return NextResponse.json(transcripts)
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { transcriptIds?: string[] }
  const ids = body.transcriptIds ?? []
  if (!ids.length) return NextResponse.json({ imported: 0, skipped: 0 })

  let imported = 0
  let skipped = 0

  for (const id of ids) {
    const transcript = await getTranscript(id)
    if (!transcript) { skipped++; continue }

    let contactId: string | null = null

    for (const participant of transcript.participants) {
      if (!participant?.trim()) continue
      const p = participant.trim()

      // Matching conservador (auditoría 2026-06-09): el like(email,'%') anterior
      // matcheaba CUALQUIER contacto con email y vinculaba transcripts a
      // contactos arbitrarios. Email exacto si lo hay; si no, nombre completo.
      const matches = p.includes("@")
        ? db.select({ id: contacts.id })
            .from(contacts)
            .where(eq(contacts.email, p.toLowerCase()))
            .limit(1)
            .all()
        : db.select({ id: contacts.id })
            .from(contacts)
            .where(like(contacts.name, `%${p}%`))
            .limit(1)
            .all()

      if (matches.length) {
        contactId = matches[0].id
        break
      }
    }

    if (!contactId) { skipped++; continue }

    const description = transcript.content
      ? transcript.content.slice(0, 500)
      : `Reunión: ${transcript.title} (${transcript.date})`

    db.insert(activities).values({
      type: "note",
      description: `[Granola] ${transcript.title} — ${transcript.date}\n${description}`,
      contactId,
    }).run()

    imported++
  }

  return NextResponse.json({ imported, skipped })
}
