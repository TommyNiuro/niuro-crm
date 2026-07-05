/**
 * Lógica pura de Prospección: normalización de empresa, urgencia, score y
 * relevancia LATAM. Sin IA ni DB: el scanner (scripts/scan-prospects.ts) y los
 * tests la comparten.
 */

// Stacks que Niuro cubre bien, mismo criterio que scan-external-jobs.ts.
export const HOT_STACK_RE =
  /react|node|python|typescript|next\.?js|golang|\bgo\b|java\b|kotlin|swift|flutter|aws|devops|data engineer|machine learning|\bia\b|\bai\b|fullstack|full stack|backend|frontend/i;

const LATAM_COUNTRIES_RE =
  /argentina|bolivia|brasil|brazil|chile|colombia|costa rica|cuba|ecuador|el salvador|guatemala|honduras|m[eé]xico|mexico|nicaragua|panam[aá]|paraguay|per[uú]|peru|rep[uú]blica dominicana|dominican|uruguay|venezuela/i;

const LATAM_HINT_RE =
  /latam|latin america|am[eé]rica latina|south america|americas|worldwide|anywhere|global/i;

/** Un aviso ya mapeado desde cualquier fuente al formato común del scanner. */
export interface RawJob {
  source: string;
  company: string;
  title: string;
  tags: string[];
  url: string;
  publishedAt: number; // unix segundos
  location: string; // texto libre de la fuente ("Remote", "LATAM", "Chile"...)
  countries: string[];
  remote: boolean;
  minSalary: number | null;
  maxSalary: number | null;
  seniority: string | null;
}

/** Clave de dedup por empresa: minúsculas, sin sufijos legales ni símbolos. */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|ltda|s\.?a\.?|s\.?a\.?s\.?|spa|corp|co|gmbh|srl)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Distancia de edición clásica (DP), para el dedup difuso de abajo. */
export function levenshtein(a: string, b: string): number {
  const dp: number[] = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Dedup difuso: companyKey normaliza sufijos/símbolos, pero variantes como
 *  "bctecnologia" vs "bctecnologiachile" o un typo de una letra siguen
 *  quedando como empresas distintas. Si `key` está a distancia de edición
 *  chica de alguna de `existingKeys`, devuelve esa existente (fusiona);
 *  si no, devuelve `key` tal cual. Umbral conservador (1-2 según largo) para
 *  no fusionar empresas genuinamente distintas por casualidad. */
export function resolveCompanyKey(key: string, existingKeys: string[]): string {
  if (existingKeys.includes(key)) return key;
  const threshold = key.length <= 6 ? 1 : 2;
  for (const ex of existingKeys) {
    if (Math.abs(key.length - ex.length) > threshold) continue;
    if (levenshtein(key, ex) <= threshold) return ex;
  }
  return key;
}

/** ¿El aviso es contratable desde LATAM? País LATAM explícito, o remoto
 *  con ubicación amplia (worldwide/latam/americas). */
export function isLatamRelevant(job: RawJob): boolean {
  const text = [job.location, ...job.countries].join(" ");
  if (LATAM_COUNTRIES_RE.test(text)) return true;
  // Región LATAM explícita (ej. "Latin America" en LinkedIn): vale aunque no
  // esté marcado remoto. Las señales amplias (worldwide/anywhere) sí lo exigen.
  if (/latam|latin america|am[eé]rica latina/i.test(text)) return true;
  return job.remote && LATAM_HINT_RE.test(text);
}

/** Urgencia de la empresa: cuántas vacantes tiene y hace cuánto no llena la
 *  más vieja. Re-publicación prolongada = está sufriendo para contratar. */
export function computeUrgency(jobCount: number, daysOpen: number): "baja" | "media" | "alta" {
  if (jobCount >= 3 || daysOpen >= 30) return "alta";
  if (jobCount === 2 || daysOpen >= 14) return "media";
  return "baja";
}

export interface ScoreBreakdown {
  base: number;
  jobCount: number;
  daysOpen: number;
  stack: number;
  seniority: number;
  latam: number;
  knownContact: number;
  total: number;
}

/** Score 0-100 de la empresa como prospecto de staffing, con desglose por
 *  factor (se persiste para explicarlo en la UI, ver tooltip del score). */
export function scoreProspect(p: {
  jobCount: number;
  daysOpen: number;
  stack: string[];
  seniority: string | null;
  latamExplicit: boolean;
  knownContact: boolean;
}): ScoreBreakdown {
  const base = 30;
  const jobCount = Math.min(p.jobCount * 8, 24); // más vacantes = más dolor
  const daysOpen = Math.min(Math.floor(p.daysOpen / 7) * 4, 16); // semanas sin llenar
  const stack = p.stack.some((t) => HOT_STACK_RE.test(t)) ? 15 : 0; // stack que Niuro provee
  const seniority = p.seniority && /senior|expert|lead|staff/i.test(p.seniority) ? 8 : 0;
  const latam = p.latamExplicit ? 10 : 0; // contrata en LATAM explícitamente
  const knownContact = p.knownContact ? 7 : 0; // ya la conocemos: puerta tibia
  const total = Math.max(0, Math.min(100, base + jobCount + daysOpen + stack + seniority + latam + knownContact));
  return { base, jobCount, daysOpen, stack, seniority, latam, knownContact, total };
}
