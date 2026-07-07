/**
 * scan-external-jobs.ts — Radar v2: oportunidades desde fuentes externas.
 *
 * Fuente: API pública de GetOnBoard (job board tech de LATAM). Cada empresa
 * publicando una vacante de software es un lead potencial de staff
 * augmentation para Niuro.
 *
 * Corre 1 vez al día vía launchd (com.niuro.external-radar). Sin IA: los
 * avisos ya vienen estructurados (rol, seniority, stack, salario), así que el
 * score es heurístico y el mensaje sugerido es un template en voz del operador
 * (para LinkedIn/email — estos leads no tienen WhatsApp).
 *
 * Dedupe: UNIQUE(message_id, chat_jid) con message_id = slug del aviso y
 * chat_jid = 'external:getonboard'.
 *
 * Forzar ventana más amplia: npx tsx scripts/scan-external-jobs.ts --since-days 14
 */
import { openDb } from "../src/lib/db-open";
import { execFileSync } from "child_process";
import { operator } from "../src/lib/operator";
import { dbPath } from "../src/lib/paths";

// Misma resolución que la app: CRM_DB_PATH > CRM_DATA_DIR/crm.db > cwd/data.
// Permite correr el scanner contra la DB de la .app instalada.
const CRM_DB = dbPath();
const API = "https://www.getonbrd.com/api/v0/categories/programming/jobs";
const MAX_PAGES = 4; // 25 avisos por página
const SOURCE = "getonboard";
const CHAT_JID = "external:getonboard";

const sinceIdx = process.argv.indexOf("--since-days");
const SINCE_DAYS = sinceIdx > -1 ? Math.max(1, Number(process.argv[sinceIdx + 1]) || 3) : 3;

// Stacks que Niuro cubre bien — suben el score.
const HOT_STACK_RE = /react|node|python|typescript|next\.?js|golang|\bgo\b|java\b|kotlin|swift|flutter|aws|devops|data engineer|machine learning|\bia\b|\bai\b|fullstack|full stack|backend|frontend/i;

export type Job = {
  id: string;
  attributes: {
    title: string;
    description: string;
    projects: string | null;
    remote: boolean;
    remote_modality: string | null;
    countries: string[] | null;
    min_salary: number | null;
    max_salary: number | null;
    published_at: number; // unix segundos
    lang: string;
    tags?: { data?: { id: string; attributes?: { name?: string } }[] } | string[];
    seniority: { data: { id: string | number; attributes?: { name: string } } };
    company: { data: { id: string; attributes?: { name: string; description?: string } } };
  };
  links: { public_url: string };
};

function stripHtml(html: string | null): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function tagNames(tags: Job["attributes"]["tags"]): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String);
  // Con expand=["tags"] cada tag trae attributes.name legible. Sin expand la API
  // devuelve solo IDs numéricos, que era lo que se guardaba como "stack"
  // (auditoría 2026-07-02).
  return (tags.data || []).map((t) => t.attributes?.name || String(t.id)).filter(Boolean);
}

function notify(msg: string) {
  try {
    execFileSync("/usr/bin/osascript", ["-e",
      `display notification ${JSON.stringify(msg)} with title "Niuro CRM: Radar externo"`]);
  } catch { /* sin sesión gráfica */ }
}

export function scoreJob(a: Job["attributes"], stack: string[]): number {
  let s = 40;
  const seniorityId = Number(a.seniority?.data?.id) || 0;
  if (seniorityId >= 4) s += 15;        // Senior/Expert: el perfil que Niuro provee
  else if (seniorityId === 3) s += 8;   // Semi Senior
  if (a.remote) s += 15;                // remoto total: encaja con talento distribuido
  else if (a.remote_modality === "hybrid") s += 4;
  if ((a.max_salary || 0) >= 3500 || (a.min_salary || 0) >= 3000) s += 10; // presupuesto real
  if (stack.some((t) => HOT_STACK_RE.test(t)) || HOT_STACK_RE.test(a.title)) s += 10;
  const ageDays = (Date.now() / 1000 - a.published_at) / 86400;
  if (ageDays <= 2) s += 10;            // recién publicado: están buscando AHORA
  else if (ageDays <= 7) s += 5;
  return Math.min(100, Math.max(0, Math.round(s)));
}

function suggestedReply(company: string, role: string): string {
  return (
    `Hola! Vi que en ${company} están buscando ${role}. ` +
    `Soy ${operator.name}, de ${operator.company} (${operator.pitch}). Tenemos ingenieros senior de LATAM pre-vetted, listos para integrarse a equipos de producto en días, no meses. ` +
    `Si el proceso de búsqueda se alarga o quieren reforzar el equipo en paralelo, me encantaría mostrarles 2-3 perfiles que calzan con esto. ¿Les hace sentido una llamada corta esta semana?`
  );
}

async function fetchPage(page: number): Promise<Job[]> {
  const url = `${API}?per_page=25&page=${page}&expand=${encodeURIComponent('["company","seniority","tags"]')}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GetOnBoard HTTP ${res.status}`);
  const body = (await res.json()) as { data: Job[] };
  return body.data || [];
}

async function main() {
  const db = openDb(CRM_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 60000");

  // Filas viejas con stack de IDs numéricos (bug del expand de tags faltante):
  // se re-resuelven contra los avisos que siguen listados. Si hay que sanear,
  // se leen todas las páginas aunque queden detrás del cutoff.
  const numericStacks = db.prepare(`
    SELECT id, message_id FROM group_opportunities
    WHERE source = ? AND stack IS NOT NULL AND stack NOT GLOB '*[a-zA-Z]*'
  `).all(SOURCE) as { id: string; message_id: string }[];

  const cutoff = Date.now() / 1000 - SINCE_DAYS * 86400;
  const jobs: Job[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await fetchPage(page);
    if (batch.length === 0) break;
    jobs.push(...batch);
    // Los avisos vienen ordenados por publicación: si la página ya quedó
    // completa detrás del cutoff, no hay nada más nuevo que buscar.
    if (batch.every((j) => j.attributes.published_at < cutoff) && numericStacks.length === 0) break;
  }

  const recent = jobs.filter((j) => j.attributes.published_at >= cutoff);
  console.log(`[radar-ext] ${jobs.length} avisos leídos, ${recent.length} de los últimos ${SINCE_DAYS} días`);

  const ins = db.prepare(`
    INSERT OR IGNORE INTO group_opportunities (id, message_id, chat_jid, group_name,
      sender, sender_phone, message_at, excerpt, role, stack, seniority, company,
      urgency, score, summary, suggested_reply, status, source, url, created_at, updated_at)
    VALUES (lower(hex(randomblob(8))), ?, ?, 'GetOnBoard', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?,
      unixepoch('now'), unixepoch('now'))
  `);

  // Cross-check: si la empresa ya existe como contacto, marcarlo en el summary
  // para no llegar en frío a alguien con quien ya hay relación.
  const findExisting = db.prepare(`
    SELECT name FROM contacts
    WHERE company IS NOT NULL AND lower(company) = lower(?) LIMIT 1
  `);

  let inserted = 0;
  for (const j of recent) {
    const a = j.attributes;
    const company = a.company?.data?.attributes?.name || a.company?.data?.id || "Empresa";
    const existing = company !== "Empresa"
      ? (findExisting.get(company) as { name: string } | undefined)
      : undefined;
    const seniority = a.seniority?.data?.attributes?.name || null;
    const stack = tagNames(a.tags);
    const score = scoreJob(a, stack);
    const salary = a.min_salary || a.max_salary
      ? ` Salario: ${[a.min_salary, a.max_salary].filter(Boolean).join("-")} USD/mes.`
      : "";
    const where = a.remote ? "remoto" : a.remote_modality === "hybrid" ? "híbrido" : "presencial";
    const summary = `${company} busca ${a.title} (${where}${a.countries?.length ? `, ${a.countries.join("/")}` : ""}).${salary}` +
      (existing ? ` ⚡ Ya está en tu CRM como "${existing.name}" — retomar esa relación en vez de llegar en frío.` : "");
    const excerpt = stripHtml(a.projects || a.description).slice(0, 500);
    const r = ins.run(
      j.id, CHAT_JID, company,
      new Date(a.published_at * 1000).toISOString(), excerpt,
      a.title, stack.slice(0, 6).join(", ") || null, seniority, company,
      a.remote ? "media" : "baja", score, summary,
      suggestedReply(company, a.title), SOURCE, j.links?.public_url || null,
    );
    inserted += r.changes;
  }

  if (numericStacks.length) {
    const bySlug = new Map(jobs.map((j) => [j.id, tagNames(j.attributes.tags).slice(0, 6).join(", ") || null]));
    const upd = db.prepare("UPDATE group_opportunities SET stack = ?, updated_at = unixepoch('now') WHERE id = ?");
    let healed = 0;
    for (const r of numericStacks) {
      const s = bySlug.get(r.message_id) ?? null;
      upd.run(s, r.id);
      if (s) healed++;
    }
    // ponytail: los avisos que ya no están listados quedan sin stack; mejor
    // hueco honesto que IDs sin sentido (el endpoint de tag individual da 404).
    console.log(`[radar-ext] stacks numéricos saneados: ${healed}/${numericStacks.length} (el resto queda vacío)`);
  }

  const pendingNew = (db.prepare("SELECT COUNT(*) AS c FROM group_opportunities WHERE status='new' AND source=?").get(SOURCE) as { c: number }).c;
  console.log(`[radar-ext] insertadas: ${inserted} (pendientes GetOnBoard: ${pendingNew})`);
  if (inserted > 0) {
    notify(`${inserted} empresa${inserted === 1 ? "" : "s"} publicando vacantes tech en GetOnBoard. Revisá el Radar.`);
  }
  db.close();
}

// ponytail: guardado porque este módulo es el único script importado por un test
// (src/lib/__tests__/scan-external-jobs.test.ts, solo para scoreJob/Job); el resto
// de scripts/*.ts corre siempre vía tsx directo y no necesita el guard.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("[radar-ext] error:", e); process.exit(1); });
}
