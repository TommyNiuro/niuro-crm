import { homedir } from "os"
import { readFile } from "fs/promises"
import { join } from "path"

const GRANOLA_DIR = join(homedir(), "Library", "Application Support", "Granola")
const GRANOLA_API = "https://api.granola.ai/v1"
const GRANOLA_VERSION = "7.303.0"
const GRANOLA_PLATFORM = "darwin"

export interface GranolaTranscript {
  id: string
  title: string
  date: string
  participants: string[]
  content: string
}

interface StoredTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  obtained_at: number
}

async function getAccessToken(): Promise<string | null> {
  try {
    const raw = await readFile(join(GRANOLA_DIR, "supabase.json"), "utf8")
    const stored = JSON.parse(raw) as { workos_tokens?: string }
    if (!stored.workos_tokens) return null
    const tokens = JSON.parse(stored.workos_tokens) as StoredTokens
    const expiresAt = tokens.obtained_at + tokens.expires_in * 1000
    if (Date.now() < expiresAt - 60_000) return tokens.access_token
    const refreshed = await refreshToken(tokens.refresh_token)
    return refreshed
  } catch {
    return null
  }
}

async function refreshToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRANOLA_API}/refresh-access-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Version": GRANOLA_VERSION,
        "X-Granola-Platform": GRANOLA_PLATFORM,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { access_token?: string }
    return data.access_token ?? null
  } catch {
    return null
  }
}

function granolaHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Client-Version": GRANOLA_VERSION,
    "X-Granola-Platform": GRANOLA_PLATFORM,
  }
}

interface GranolaDoc {
  id: string
  title: string
  created_at: string
  updated_at: string
  deleted_at?: string | null
  google_calendar_event?: {
    attendees?: { email?: string; displayName?: string }[]
    start?: { dateTime?: string; date?: string }
  }
  notes_plain?: string
  notes?: { type?: string; content?: unknown[] }
}

function extractText(doc: GranolaDoc): string {
  if (doc.notes_plain && doc.notes_plain.trim()) return doc.notes_plain.trim()
  if (doc.notes?.content) {
    try {
      return JSON.stringify(doc.notes.content).slice(0, 2000)
    } catch {
      return ""
    }
  }
  return ""
}

function extractParticipants(doc: GranolaDoc): string[] {
  const attendees = doc.google_calendar_event?.attendees ?? []
  return attendees
    .map((a) => a.displayName ?? a.email ?? "")
    .filter(Boolean)
}

function docToTranscript(doc: GranolaDoc): GranolaTranscript {
  const event = doc.google_calendar_event
  const rawDate = event?.start?.dateTime ?? event?.start?.date ?? doc.created_at
  const date = rawDate ? rawDate.slice(0, 10) : doc.created_at.slice(0, 10)
  return {
    id: doc.id,
    title: doc.title || "Sin título",
    date,
    participants: extractParticipants(doc),
    content: extractText(doc),
  }
}

export async function listTranscripts(): Promise<GranolaTranscript[]> {
  const token = await getAccessToken()
  if (!token) return []
  try {
    const all: GranolaTranscript[] = []
    let lastId: string | undefined
    for (let page = 0; page < 20; page++) {
      const body: Record<string, unknown> = { limit: 50 }
      if (lastId) body.after = lastId
      const res = await fetch(`${GRANOLA_API}/get-documents`, {
        method: "POST",
        headers: granolaHeaders(token),
        body: JSON.stringify(body),
      })
      if (!res.ok) break
      const data = (await res.json()) as GranolaDoc[] | { documents?: GranolaDoc[] }
      const docs: GranolaDoc[] = Array.isArray(data)
        ? data
        : (data as { documents?: GranolaDoc[] }).documents ?? []
      if (!docs.length) break
      all.push(...docs.filter((d) => !d.deleted_at).map(docToTranscript))
      if (docs.length < 50) break
      lastId = docs[docs.length - 1].id
    }
    return all
  } catch {
    return []
  }
}

export async function getTranscript(id: string): Promise<GranolaTranscript | null> {
  const token = await getAccessToken()
  if (!token) return null
  try {
    const res = await fetch(`${GRANOLA_API}/get-document`, {
      method: "POST",
      headers: granolaHeaders(token),
      body: JSON.stringify({ document_id: id }),
    })
    if (!res.ok) return null
    const doc = (await res.json()) as GranolaDoc
    return docToTranscript(doc)
  } catch {
    return null
  }
}

