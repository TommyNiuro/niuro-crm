const HUBSPOT_API = "https://api.hubapi.com"

function headers() {
  const key = process.env.HUBSPOT_API_KEY
  if (!key) throw new Error("HUBSPOT_API_KEY no configurado")
  return { "Authorization": "Bearer " + key, "Content-Type": "application/json" }
}

export interface HubSpotContact {
  id: string
  email: string | null
  name: string | null
  phone: string | null
  company: string | null
  updatedAt: string | null
}

function parseContact(raw: Record<string, unknown>): HubSpotContact {
  const props = (raw.properties ?? {}) as Record<string, string | null>
  const first = props.firstname ?? ""
  const last = props.lastname ?? ""
  const name = [first, last].filter(Boolean).join(" ") || null
  return {
    id: raw.id as string,
    email: props.email ?? null,
    name,
    phone: props.phone ?? null,
    company: props.company ?? null,
    updatedAt: props.hs_lastmodifieddate ?? null,
  }
}

export async function searchContactByEmail(email: string): Promise<HubSpotContact | null> {
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email", "firstname", "lastname", "phone", "company", "hs_lastmodifieddate"],
      limit: 1,
    }),
  })
  if (!res.ok) throw new Error(`HubSpot search error ${res.status}`)
  const data = (await res.json()) as { results: Record<string, unknown>[] }
  if (!data.results?.length) return null
  return parseContact(data.results[0])
}

export async function listContacts(after?: string): Promise<{ contacts: HubSpotContact[]; nextAfter?: string }> {
  const params = new URLSearchParams({
    limit: "100",
    properties: "email,firstname,lastname,phone,company,hs_lastmodifieddate",
  })
  if (after) params.set("after", after)
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts?${params}`, {
    headers: headers(),
  })
  if (!res.ok) throw new Error(`HubSpot list error ${res.status}`)
  const data = (await res.json()) as {
    results: Record<string, unknown>[]
    paging?: { next?: { after?: string } }
  }
  const contacts = (data.results ?? []).map(parseContact)
  const nextAfter = data.paging?.next?.after
  return { contacts, nextAfter }
}

export async function listAllContacts(): Promise<HubSpotContact[]> {
  const all: HubSpotContact[] = []
  let after: string | undefined
  for (let page = 0; page < 100; page++) {
    const { contacts, nextAfter } = await listContacts(after)
    all.push(...contacts)
    if (!nextAfter) break
    after = nextAfter
  }
  return all
}

export async function createContact(data: {
  email?: string | null
  name?: string | null
  phone?: string | null
  company?: string | null
}): Promise<HubSpotContact> {
  const nameParts = (data.name ?? "").trim().split(/\s+/)
  const firstname = nameParts[0] ?? ""
  const lastname = nameParts.slice(1).join(" ")
  const properties: Record<string, string> = {}
  if (data.email) properties.email = data.email
  if (firstname) properties.firstname = firstname
  if (lastname) properties.lastname = lastname
  if (data.phone) properties.phone = data.phone
  if (data.company) properties.company = data.company
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ properties }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HubSpot create error ${res.status}: ${err}`)
  }
  const raw = (await res.json()) as Record<string, unknown>
  return parseContact(raw)
}

export async function updateContact(id: string, data: Record<string, string>): Promise<void> {
  const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ properties: data }),
  })
  if (!res.ok) throw new Error(`HubSpot update error ${res.status}`)
}
