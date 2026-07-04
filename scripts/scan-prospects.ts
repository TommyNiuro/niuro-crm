/**
 * scan-prospects.ts — Prospección: radar de EMPRESAS contratando talento tech.
 *
 * A diferencia del Radar externo (group_opportunities, unidad = aviso), acá la
 * unidad es la empresa: se agrupan los avisos abiertos de varias bolsas por
 * companyKey y se hace upsert en `prospects`. Las APIs devuelven avisos
 * VIGENTES, así que job_count = vacantes abiertas hoy y days_open = hace
 * cuánto no llenan la más vieja (señal de dolor de contratación).
 *
 * Fuentes (todas API pública, sin key): GetOnBoard, RemoteOK, Remotive, Jobicy.
 * Corre 1 vez al día vía launchd (com.niuro.prospect-radar).
 *
 * Una fuente caída no corta el scan: se loguea y se sigue con las demás.
 */
import { execFileSync } from "child_process";
import { openDb } from "../src/lib/db-open";
import { dbPath } from "../src/lib/paths";
import { operator } from "../src/lib/operator";
import { callLinkedinTool, linkedinSessionExists } from "../src/lib/linkedin-mcp";
import { runClaude, FAST_MODEL } from "../src/lib/claude-subprocess";
import {
  companyKey,
  computeUrgency,
  isLatamRelevant,
  scoreProspect,
  type RawJob,
} from "../src/lib/prospect-score";

const CRM_DB = dbPath();

// ---------- fetchers por fuente (todas devuelven RawJob[]) ----------

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "niuro-crm-prospect-radar" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return (await res.json()) as T;
}

async function fetchGetOnBoard(): Promise<RawJob[]> {
  type GobJob = {
    id: string;
    attributes: {
      title: string;
      remote: boolean;
      countries: string[] | null;
      min_salary: number | null;
      max_salary: number | null;
      published_at: number;
      tags?: { data?: { id: string; attributes?: { name?: string } }[] };
      seniority: { data: { attributes?: { name: string } } };
      company: { data: { attributes?: { name: string } } };
    };
    links: { public_url: string };
  };
  const jobs: RawJob[] = [];
  for (let page = 1; page <= 4; page++) {
    const url = `https://www.getonbrd.com/api/v0/categories/programming/jobs?per_page=25&page=${page}&expand=${encodeURIComponent('["company","seniority","tags"]')}`;
    const body = await getJson<{ data: GobJob[] }>(url);
    const batch = body.data || [];
    if (batch.length === 0) break;
    for (const j of batch) {
      const a = j.attributes;
      const company = a.company?.data?.attributes?.name;
      if (!company) continue;
      jobs.push({
        source: "getonboard",
        company,
        title: a.title,
        tags: (a.tags?.data || []).map((t) => t.attributes?.name || "").filter(Boolean),
        url: j.links.public_url,
        publishedAt: a.published_at,
        location: a.remote ? "Remote LATAM" : "",
        countries: a.countries || [],
        remote: !!a.remote,
        minSalary: a.min_salary,
        maxSalary: a.max_salary,
        seniority: a.seniority?.data?.attributes?.name || null,
      });
    }
  }
  return jobs;
}

async function fetchRemoteOK(): Promise<RawJob[]> {
  type RokJob = {
    company?: string;
    position?: string;
    tags?: string[];
    url?: string;
    date?: string;
    location?: string;
    salary_min?: number;
    salary_max?: number;
  };
  const body = await getJson<RokJob[]>("https://remoteok.com/api");
  return body
    .filter((j) => j.company && j.position)
    .map((j) => ({
      source: "remoteok",
      company: j.company!,
      title: j.position!,
      tags: j.tags || [],
      url: j.url || "",
      publishedAt: j.date ? Math.floor(Date.parse(j.date) / 1000) : 0,
      location: j.location || "",
      countries: [],
      remote: true,
      minSalary: j.salary_min || null,
      maxSalary: j.salary_max || null,
      seniority: null,
    }));
}

async function fetchRemotive(): Promise<RawJob[]> {
  type RemJob = {
    company_name: string;
    title: string;
    tags: string[];
    url: string;
    publication_date: string;
    candidate_required_location: string;
  };
  const body = await getJson<{ jobs: RemJob[] }>(
    "https://remotive.com/api/remote-jobs?category=software-dev&limit=100"
  );
  return (body.jobs || []).map((j) => ({
    source: "remotive",
    company: j.company_name,
    title: j.title,
    tags: j.tags || [],
    url: j.url,
    publishedAt: Math.floor(Date.parse(j.publication_date) / 1000) || 0,
    location: j.candidate_required_location || "",
    countries: [],
    remote: true,
    minSalary: null,
    maxSalary: null,
    seniority: null,
  }));
}

async function fetchJobicy(): Promise<RawJob[]> {
  type JobicyJob = {
    companyName: string;
    jobTitle: string;
    url: string;
    pubDate: string;
    jobGeo: string;
    jobLevel: string;
    annualSalaryMin?: number;
    annualSalaryMax?: number;
    jobIndustry?: string[];
  };
  const body = await getJson<{ jobs: JobicyJob[] }>(
    "https://jobicy.com/api/v2/remote-jobs?count=50&industry=dev"
  );
  return (body.jobs || []).map((j) => ({
    source: "jobicy",
    company: j.companyName,
    title: j.jobTitle,
    tags: j.jobIndustry || [],
    url: j.url,
    publishedAt: Math.floor(Date.parse(j.pubDate) / 1000) || 0,
    location: j.jobGeo || "",
    countries: [],
    remote: true,
    minSalary: j.annualSalaryMin || null,
    maxSalary: j.annualSalaryMax || null,
    seniority: j.jobLevel || null,
  }));
}

/**
 * LinkedIn vía MCP (linkedin-mcp-server): scrapea la búsqueda de empleos con
 * la sesión guardada en ~/.linkedin-mcp (setup una vez con
 * `uvx mcp-server-linkedin@latest --import-from-browser`). El resultado es
 * texto crudo de la página, así que lo estructura una llamada barata a haiku
 * (mismo patrón que task-intel). Se limita a UNA búsqueda por corrida para
 * mantener bajo el riesgo de la cuenta (el scraping viola TOS de LinkedIn).
 */
async function fetchLinkedIn(): Promise<RawJob[]> {
  if (!linkedinSessionExists()) {
    console.log("[prospect] linkedin: sin sesión (~/.linkedin-mcp), salteado");
    return [];
  }
  const result = (await callLinkedinTool("search_jobs", {
    keywords: "software engineer",
    location: "Latin America",
    max_pages: 2,
    date_posted: "past_week",
    sort_by: "date",
  })) as { content?: { type: string; text?: string }[]; structuredContent?: { sections?: Record<string, string>; url?: string } };

  // FastMCP devuelve el dict como structuredContent y/o texto en content.
  const sections = result?.structuredContent?.sections;
  const raw = sections
    ? Object.values(sections).join("\n")
    : (result?.content || []).map((c) => c.text || "").join("\n");
  const searchUrl = result?.structuredContent?.url || "https://www.linkedin.com/jobs/search/";
  if (!raw.trim()) return [];

  const prompt = `Texto crudo de una búsqueda de empleos de LinkedIn (software, Latinoamérica, última semana).
Extraé los avisos como JSON. Respondé SOLO un array JSON válido, sin markdown:
[{"company": "...", "title": "...", "location": "..."}]
Ignorá todo lo que no sea un aviso de empleo (menús, filtros, promos).

TEXTO:
${raw.slice(0, 30000)}`;

  const answer = await runClaude(prompt, { model: FAST_MODEL, timeoutMs: 90_000 });
  const match = answer.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("haiku no devolvió JSON para linkedin");
  const jobs = JSON.parse(match[0]) as { company?: string; title?: string; location?: string }[];

  // publishedAt aproximado: la búsqueda filtra a la última semana, usamos ~3
  // días. El days_open de empresas solo-LinkedIn queda como cota inferior.
  const approxPublished = Math.floor(Date.now() / 1000) - 3 * 86400;
  return jobs
    .filter((j) => j.company && j.title)
    .map((j) => ({
      source: "linkedin",
      company: j.company!,
      title: j.title!,
      tags: [],
      url: searchUrl,
      publishedAt: approxPublished,
      location: j.location || "Latin America",
      countries: [],
      remote: /remote|remoto/i.test(j.location || ""),
      minSalary: null,
      maxSalary: null,
      seniority: null,
    }));
}

const FETCHERS: [string, () => Promise<RawJob[]>][] = [
  ["getonboard", fetchGetOnBoard],
  ["remoteok", fetchRemoteOK],
  ["remotive", fetchRemotive],
  ["jobicy", fetchJobicy],
  ["linkedin", fetchLinkedIn],
];

function notify(msg: string) {
  try {
    execFileSync("/usr/bin/osascript", ["-e",
      `display notification ${JSON.stringify(msg)} with title "Niuro CRM: Prospección"`]);
  } catch { /* sin sesión gráfica */ }
}

async function main() {
  const scanStart = Math.floor(Date.now() / 1000);
  const db = openDb(CRM_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 60000");

  // 1. Traer avisos de todas las fuentes (una caída no corta el resto).
  const all: RawJob[] = [];
  for (const [name, fetcher] of FETCHERS) {
    try {
      const jobs = await fetcher();
      console.log(`[prospect] ${name}: ${jobs.length} avisos`);
      all.push(...jobs);
    } catch (e) {
      console.error(`[prospect] fuente ${name} falló:`, e instanceof Error ? e.message : e);
    }
  }

  // 2. Filtrar contratables desde LATAM y agrupar por empresa.
  const relevant = all.filter(isLatamRelevant);
  console.log(`[prospect] ${all.length} avisos totales, ${relevant.length} relevantes LATAM`);

  const selfKey = companyKey(operator.company); // no prospectarse a sí mismo
  const byCompany = new Map<string, RawJob[]>();
  for (const j of relevant) {
    const key = companyKey(j.company);
    if (!key || key === selfKey) continue;
    (byCompany.get(key) ?? byCompany.set(key, []).get(key)!).push(j);
  }

  // 3. Empresas ya conocidas en el CRM (puerta tibia): match por companyKey.
  const knownByKey = new Map<string, string>();
  const contactRows = db.prepare(
    "SELECT id, company FROM contacts WHERE company IS NOT NULL AND company != ''"
  ).all() as { id: string; company: string }[];
  for (const c of contactRows) {
    const k = companyKey(c.company);
    if (k && !knownByKey.has(k)) knownByKey.set(k, c.id);
  }

  // 4. Upsert por empresa. Los datos de contacto/mensajes/status se preservan.
  const upsert = db.prepare(`
    INSERT INTO prospects (id, company, company_key, domain, sources, job_count,
      roles, jobs, stack, seniority, countries, remote, min_salary, max_salary,
      first_seen_at, last_seen_at, oldest_job_at, days_open, urgency, score,
      is_open, status, url, known_contact_id, created_at, updated_at)
    VALUES (lower(hex(randomblob(8))), @company, @key, NULL, @sources, @jobCount,
      @roles, @jobs, @stack, @seniority, @countries, @remote, @minSalary, @maxSalary,
      @now, @now, @oldestJobAt, @daysOpen, @urgency, @score,
      1, 'new', @url, @knownContactId, @now, @now)
    ON CONFLICT(company_key) DO UPDATE SET
      job_count = @jobCount,
      sources = @sources,
      roles = @roles,
      jobs = @jobs,
      stack = @stack,
      seniority = COALESCE(@seniority, seniority),
      countries = @countries,
      remote = @remote,
      min_salary = COALESCE(@minSalary, min_salary),
      max_salary = COALESCE(@maxSalary, max_salary),
      last_seen_at = @now,
      oldest_job_at = @oldestJobAt,
      days_open = @daysOpen,
      urgency = @urgency,
      score = @score,
      is_open = 1,
      url = @url,
      known_contact_id = COALESCE(known_contact_id, @knownContactId),
      updated_at = @now
  `);

  const tx = db.transaction(() => {
    for (const [key, jobs] of byCompany) {
      const oldest = Math.min(...jobs.map((j) => j.publishedAt).filter(Boolean));
      const daysOpen = oldest && isFinite(oldest)
        ? Math.max(0, Math.floor((scanStart - oldest) / 86400))
        : 0;
      const stack = [...new Set(jobs.flatMap((j) => j.tags))].slice(0, 12);
      const countries = [...new Set(jobs.flatMap((j) => j.countries))];
      const latamExplicit = jobs.some((j) =>
        isLatamRelevant({ ...j, remote: false }) // sin el atajo remoto: país/región LATAM explícito
      );
      const seniority = jobs.map((j) => j.seniority).find(Boolean) || null;
      const knownContactId = knownByKey.get(key) || null;
      const urgency = computeUrgency(jobs.length, daysOpen);
      const score = scoreProspect({
        jobCount: jobs.length,
        daysOpen,
        stack,
        seniority,
        latamExplicit,
        knownContact: !!knownContactId,
      });
      upsert.run({
        company: jobs[0].company,
        key,
        sources: JSON.stringify([...new Set(jobs.map((j) => j.source))]),
        jobCount: jobs.length,
        roles: JSON.stringify([...new Set(jobs.map((j) => j.title))].slice(0, 10)),
        jobs: JSON.stringify(
          jobs.slice(0, 12).map((j) => ({ title: j.title, url: j.url, source: j.source }))
        ),
        stack: JSON.stringify(stack),
        seniority,
        countries: JSON.stringify(countries),
        remote: jobs.some((j) => j.remote) ? 1 : 0,
        minSalary: jobs.map((j) => j.minSalary).find(Boolean) ?? null,
        maxSalary: jobs.map((j) => j.maxSalary).find(Boolean) ?? null,
        now: scanStart,
        oldestJobAt: isFinite(oldest) ? oldest : null,
        daysOpen,
        urgency,
        score,
        url: jobs[0].url,
        knownContactId,
      });
    }
    // Empresas que ya no publican en ninguna fuente: cerrar.
    db.prepare(
      "UPDATE prospects SET is_open = 0, updated_at = ? WHERE last_seen_at < ? AND is_open = 1"
    ).run(scanStart, scanStart);
  });
  tx();

  // Nuevas de verdad = creadas en este scan.
  const inserted = (db.prepare(
    "SELECT COUNT(*) AS n FROM prospects WHERE created_at = ?"
  ).get(scanStart) as { n: number }).n;

  const top = (db.prepare(`
    SELECT company, score FROM prospects
    WHERE status = 'new' AND is_open = 1
    ORDER BY score DESC LIMIT 3
  `).all() as { company: string; score: number }[])
    .map((r) => `${r.company} (${r.score})`)
    .join(", ");

  console.log(`[prospect] ${byCompany.size} empresas procesadas, ${inserted} nuevas`);
  if (inserted > 0) {
    notify(`${inserted} empresas nuevas prospectables. Top: ${top}`);
  }
}

main().catch((e) => {
  console.error("[prospect] scan falló:", e);
  process.exit(1);
});
