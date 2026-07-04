/**
 * Cliente mínimo de Apollo.io para Prospección: dado el nombre de una empresa,
 * encuentra al decisor de contratación tech (CTO, VP Eng, Head of Talent...) y
 * revela su email. La API key vive en crm_settings ('apollo_api_key', se pega
 * en la página de Prospección) y NUNCA viaja al cliente (solo server-side).
 *
 * Honestidad del dato: si Apollo no tiene a la persona o el plan no revela el
 * email/teléfono, se devuelve lo que haya (campos null), no se inventa.
 */
import { readSettings } from "@/lib/settings";

const API = "https://api.apollo.io/api/v1";

// Cargos que deciden contratación de ingenieros, en orden de preferencia.
const TARGET_TITLES = [
  "CTO",
  "Chief Technology Officer",
  "VP of Engineering",
  "VP Engineering",
  "Head of Engineering",
  "Director of Engineering",
  "Engineering Manager",
  "Head of Talent",
  "Talent Acquisition Manager",
  "Technical Recruiter",
];

export interface ApolloContact {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  organizationDomain: string | null;
}

export function apolloKey(): string | null {
  return readSettings(["apollo_api_key"]).apollo_api_key || process.env.APOLLO_API_KEY || null;
}

async function post<T>(path: string, key: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": key,
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apollo HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

type ApolloPerson = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  organization?: { primary_domain?: string | null };
  phone_numbers?: { sanitized_number?: string | null }[];
};

/** Busca el decisor tech en la empresa y revela su email (consume créditos). */
export async function findHiringContact(
  company: string,
  domain?: string | null
): Promise<ApolloContact | null> {
  const key = apolloKey();
  if (!key) throw new Error("Apollo no configurado: falta apollo_api_key en Ajustes");

  const search = await post<{ people: ApolloPerson[] }>("/mixed_people/search", key, {
    q_organization_name: company,
    ...(domain ? { q_organization_domains_list: [domain] } : {}),
    person_titles: TARGET_TITLES,
    per_page: 5,
  });
  const people = search.people || [];
  if (people.length === 0) return null;

  // Preferir el cargo más alto según el orden de TARGET_TITLES.
  const rank = (t: string | null) => {
    const i = TARGET_TITLES.findIndex((x) => t?.toLowerCase().includes(x.toLowerCase()));
    return i === -1 ? TARGET_TITLES.length : i;
  };
  const best = [...people].sort((a, b) => rank(a.title) - rank(b.title))[0];

  // people/match revela el email real (search devuelve emails enmascarados).
  let matched: ApolloPerson | null = null;
  try {
    const res = await post<{ person: ApolloPerson }>("/people/match", key, {
      id: best.id,
      reveal_personal_emails: false,
    });
    matched = res.person || null;
  } catch {
    // Sin créditos de reveal o plan sin acceso: devolvemos lo que dio search.
  }
  const p = matched || best;

  return {
    name: p.name,
    title: p.title,
    email: p.email && !p.email.includes("not_unlocked") ? p.email : null,
    phone: p.phone_numbers?.[0]?.sanitized_number || null,
    linkedin: p.linkedin_url,
    organizationDomain: p.organization?.primary_domain || null,
  };
}
