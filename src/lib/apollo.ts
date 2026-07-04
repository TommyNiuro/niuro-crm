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

type ApolloOrg = { name: string; primary_domain: string | null };

/** Resuelve el dominio de una empresa por nombre (mixed_companies/search).
 *  Buscar personas por dominio da mejores resultados que por nombre exacto:
 *  el nombre de la vacante rara vez coincide con la razón social indexada en
 *  Apollo (sufijos, abreviaturas). Devuelve null si no encuentra nada. */
export async function resolveDomain(company: string): Promise<string | null> {
  const key = apolloKey();
  if (!key) return null;
  try {
    const res = await post<{ organizations: ApolloOrg[] }>("/mixed_companies/search", key, {
      q_organization_name: company,
      per_page: 1,
    });
    return res.organizations?.[0]?.primary_domain || null;
  } catch {
    return null; // best-effort: si falla, se sigue con búsqueda por nombre
  }
}

/** Busca decisores tech en la empresa y revela los primeros 2 (consume
 *  créditos de people/match por cada reveal). Devuelve el principal +
 *  alternativos, rankeados por cargo. */
export async function findHiringContacts(
  company: string,
  domain?: string | null
): Promise<ApolloContact[]> {
  const key = apolloKey();
  if (!key) throw new Error("Apollo no configurado: falta apollo_api_key en Ajustes");

  // Resolver dominio primero si no lo tenemos: buscar por
  // q_organization_domains_list acierta mucho más que por nombre (empresas
  // chicas casi nunca están indexadas con el nombre exacto de la vacante).
  const resolvedDomain = domain || (await resolveDomain(company));

  // mixed_people/search quedó deprecado para API callers (HTTP 422, 2026-07):
  // el reemplazo oficial es mixed_people/api_search, mismos parámetros.
  const search = await post<{ people: ApolloPerson[] }>("/mixed_people/api_search", key, {
    ...(resolvedDomain
      ? { q_organization_domains_list: [resolvedDomain] }
      : { q_organization_name: company }),
    person_titles: TARGET_TITLES,
    per_page: 5,
  });
  const people = search.people || [];
  if (people.length === 0) return [];

  // Preferir el cargo más alto según el orden de TARGET_TITLES.
  const rank = (t: string | null) => {
    const i = TARGET_TITLES.findIndex((x) => t?.toLowerCase().includes(x.toLowerCase()));
    return i === -1 ? TARGET_TITLES.length : i;
  };
  const ranked = [...people].sort((a, b) => rank(a.title) - rank(b.title)).slice(0, 2);

  // people/match revela el email real (api_search devuelve datos enmascarados).
  const out: ApolloContact[] = [];
  for (const person of ranked) {
    let matched: ApolloPerson | null = null;
    try {
      const res = await post<{ person: ApolloPerson }>("/people/match", key, {
        id: person.id,
        reveal_personal_emails: false,
      });
      matched = res.person || null;
    } catch {
      // Sin créditos de reveal o plan sin acceso: usamos lo que dio search.
    }
    const p = matched || person;
    if (!p.name) continue; // sin reveal el nombre viene enmascarado: no sirve
    out.push({
      name: p.name,
      title: p.title,
      email: p.email && !p.email.includes("not_unlocked") ? p.email : null,
      phone: p.phone_numbers?.[0]?.sanitized_number || null,
      linkedin: p.linkedin_url,
      organizationDomain: p.organization?.primary_domain || null,
    });
  }
  return out;
}
