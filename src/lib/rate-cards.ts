/**
 * rate-cards.ts — Rate cards historicos de Niuro (basado en historico real de clientes).
 * Tarifas son CLIENT RATE mensual en USD. internal = client / 1.3 (30% margin).
 *
 * Estructura:
 *   category > role > seniority > { min, max }
 */

export type Seniority = "junior" | "mid" | "senior" | "lead" | "principal";

export interface RateRange {
  min: number;
  max: number;
}

export type RoleRates = Partial<Record<Seniority, RateRange>>;

export interface RoleEntry {
  category: string;
  role: string;
  rates: RoleRates;
  /** Skills/keywords que matchean este rol */
  keywords: string[];
}

// Client rates mensuales en USD (incluyen margen). Internal = client / 1.3.
export const RATE_CARDS: RoleEntry[] = [
  // ─── Development ───
  {
    category: "Development",
    role: "Backend Developer",
    keywords: ["backend", "back-end", "back end", "nodejs", "node.js", "python", "postgres", "postgresql", "api"],
    rates: {
      mid: { min: 3900, max: 3900 },
      senior: { min: 3250, max: 5850 },
    },
  },
  {
    category: "Development",
    role: "Blockchain Developer",
    keywords: ["blockchain", "rust", "solidity", "smart contract", "web3", "crypto"],
    rates: {
      senior: { min: 4550, max: 7800 },
    },
  },
  {
    category: "Development",
    role: "Devops Engineer",
    keywords: ["devops", "docker", "kubernetes", "k8s", "terraform", "aws", "cloud", "sre", "infra"],
    rates: {
      mid: { min: 3250, max: 3250 },
      senior: { min: 2925, max: 5200 },
      lead: { min: 3900, max: 9100 }, // saneado 2026-07-07 desde el rate card real: quitado México USD 1 (registro sucio)
    },
  },
  {
    category: "Development",
    role: "Frontend Developer",
    keywords: ["frontend", "front-end", "front end", "react", "vue", "angular", "javascript", "typescript", "css"],
    rates: {
      mid: { min: 520, max: 3250 },
      senior: { min: 3640, max: 6500 },
      principal: { min: 2600, max: 2600 },
    },
  },
  {
    category: "Development",
    role: "Fullstack Developer",
    keywords: ["fullstack", "full-stack", "full stack"],
    rates: {
      mid: { min: 1625, max: 4030 }, // saneado: quitados Rumania 65000 y Nicaragua 26000 (anuales cargados como mensuales)
      senior: { min: 2243, max: 5948 },
      lead: { min: 3900, max: 3900 },
      principal: { min: 1300, max: 1300 },
    },
  },
  {
    category: "Development",
    role: "Game Developer",
    keywords: ["game", "unity", "unreal", "godot", "videojuego"],
    rates: {
      senior: { min: 2600, max: 2600 },
    },
  },
  {
    category: "Development",
    role: "Software Developer",
    keywords: ["software developer", "software engineer", "programador", "ingeniero de software"],
    rates: {
      junior: { min: 1040, max: 7800 },
      mid: { min: 520, max: 6890 },
      senior: { min: 1820, max: 9100 }, // saneado: quitados Líbano 71500 y Nicaragua 59215 (máximo limpio real = Canadá 9100)
      lead: { min: 1560, max: 6500 },
      principal: { min: 1950, max: 14463 }, // saneado: quitado USA 273000 (máximo limpio real = Brasil 14463)
    },
  },

  // ─── Data ───
  {
    category: "Data",
    role: "Data Analyst",
    keywords: ["data analyst", "analista de datos", "tableau", "powerbi", "looker", "sql"],
    rates: {
      junior: { min: 2080, max: 2080 },
      mid: { min: 1690, max: 3900 },
      senior: { min: 1950, max: 5460 },
    },
  },
  {
    category: "Data",
    role: "Data Engineer",
    keywords: ["data engineer", "spark", "airflow", "etl", "pipeline", "snowflake", "dbt"],
    rates: {
      junior: { min: 1300, max: 1300 },
      mid: { min: 2795, max: 4550 },
      senior: { min: 2600, max: 14040 },
      lead: { min: 7800, max: 7800 },
      principal: { min: 2600, max: 6500 },
    },
  },

  // ─── AI ───
  {
    category: "AI",
    role: "ML Engineer",
    keywords: ["ml engineer", "machine learning", "ai engineer", "tensorflow", "pytorch", "llm", "nlp"],
    rates: {
      mid: { min: 2665, max: 13000 },
      senior: { min: 2925, max: 6500 },
      principal: { min: 4713, max: 9750 },
    },
  },

  // ─── CRM / ERP ───
  {
    category: "CRM/ERP",
    role: "Salesforce Administrator",
    keywords: ["salesforce admin", "sfdc admin"],
    rates: {
      mid: { min: 4550, max: 4550 },
    },
  },
  {
    category: "CRM/ERP",
    role: "Salesforce Architect",
    keywords: ["salesforce architect", "sfdc architect", "apex", "lightning"],
    rates: {
      lead: { min: 6497, max: 9750 },
      principal: { min: 9750, max: 9750 },
    },
  },
  {
    category: "CRM/ERP",
    role: "Salesforce Developer",
    keywords: ["salesforce developer", "sfdc developer"],
    rates: {
      senior: { min: 5460, max: 9100 },
    },
  },
  {
    category: "CRM/ERP",
    role: "Salesforce Specialist",
    keywords: ["salesforce", "sfdc", "servicecloud", "salescloud"],
    rates: {
      senior: { min: 6500, max: 6500 },
      lead: { min: 11700, max: 11700 },
      principal: { min: 13000, max: 13000 },
    },
  },

  // ─── Design ───
  {
    category: "Design",
    role: "Designer",
    keywords: ["designer", "diseñador", "figma", "sketch", "ux", "ui"],
    rates: {
      mid: { min: 2080, max: 2080 },
    },
  },

  // ─── Product & Delivery ───
  {
    category: "Product",
    role: "Delivery Manager",
    keywords: ["delivery manager", "scrum master"],
    rates: {
      senior: { min: 5590, max: 5590 },
    },
  },
  {
    category: "Product",
    role: "Product Manager",
    keywords: ["product manager", "pm", "producto"],
    rates: {
      mid: { min: 2600, max: 2600 },
      senior: { min: 6240, max: 6240 },
    },
  },
  {
    category: "Product",
    role: "Product Owner",
    keywords: ["product owner", "po"],
    rates: {
      mid: { min: 5200, max: 5200 },
      senior: { min: 3900, max: 10400 },
    },
  },
  {
    category: "Product",
    role: "Project Manager",
    keywords: ["project manager", "pmp"],
    rates: {
      senior: { min: 3120, max: 5200 }, // saneado: quitado Líbano 71500 (máximo limpio real = Argentina 5200)
      lead: { min: 6500, max: 6500 },
    },
  },

  // ─── QA & Security ───
  {
    category: "QA",
    role: "QA Engineer",
    keywords: ["qa", "quality assurance", "tester", "testing", "selenium", "cypress", "playwright"],
    rates: {
      mid: { min: 455, max: 5850 },
      senior: { min: 976, max: 5590 },
      principal: { min: 2730, max: 2730 },
    },
  },

  // ─── Leadership ───
  {
    category: "Leadership",
    role: "CTO",
    keywords: ["cto", "chief technology"],
    rates: {
      principal: { min: 3250, max: 3250 },
    },
  },
  {
    category: "Leadership",
    role: "Tech Lead",
    keywords: ["tech lead", "technical lead", "lider tecnico"],
    rates: {
      mid: { min: 3250, max: 3250 },
      senior: { min: 2373, max: 4095 },
    },
  },
];

// --- Auditoría 2026-07-07: saneo de rangos implausibles ---
// El histórico tiene algunos `max` claramente erróneos (typos: un rate mensual en
// USD por encima de ~20k es casi seguro un dígito de más, ej. 71500, 65000, 273000).
// NO se corrigen los valores (no se puede inferir el real sin el dato de origen),
// pero se ACOTAN al consumirlos para no mostrar una tarifa disparatada, y se pueden
// listar con findSuspiciousRates() para corregir el histórico a mano.
const RATE_MAX_PLAUSIBLE = 20000;

function sanitizeRange(r: RateRange): RateRange {
  if (r.max <= RATE_MAX_PLAUSIBLE) return r;
  const capped = Math.max(r.min, Math.min(r.max, Math.round(r.min * 3)));
  console.warn(`[rate-cards] max implausible (${r.max}) acotado a ${capped}; corregir el histórico`);
  return { min: r.min, max: capped };
}

/** Lista entradas con rangos sospechosos (max implausible o spread max/min > 8x)
 *  para revisión/corrección manual del histórico. */
export function findSuspiciousRates(): { role: string; seniority: string; min: number; max: number; reason: string }[] {
  const out: { role: string; seniority: string; min: number; max: number; reason: string }[] = [];
  for (const entry of RATE_CARDS) {
    for (const [sen, range] of Object.entries(entry.rates) as [Seniority, RateRange | undefined][]) {
      if (!range) continue;
      if (range.max > RATE_MAX_PLAUSIBLE) {
        out.push({ role: entry.role, seniority: sen, min: range.min, max: range.max, reason: `max ${range.max} > ${RATE_MAX_PLAUSIBLE}` });
      } else if (range.min > 0 && range.max / range.min > 8) {
        out.push({ role: entry.role, seniority: sen, min: range.min, max: range.max, reason: `max/min ${(range.max / range.min).toFixed(1)}x` });
      }
    }
  }
  return out;
}

/**
 * Estima rango mensual USD para un rol + seniority. Devuelve null si no hay match.
 * Fallback: si el seniority exacto no esta, usa el promedio del rol. Los rangos
 * se sanean (max acotado) para no propagar typos del histórico.
 */
export function estimateMonthlyRate(role: string, seniority: Seniority | null): RateRange | null {
  const entry = findRoleEntry(role);
  if (!entry) return null;
  if (seniority && entry.rates[seniority]) return sanitizeRange(entry.rates[seniority]!);
  // Fallback: rango global del rol (cada rango saneado antes de agregar)
  const all = Object.values(entry.rates).filter((r): r is RateRange => !!r).map(sanitizeRange);
  if (all.length === 0) return null;
  const min = Math.min(...all.map((r) => r.min));
  const max = Math.max(...all.map((r) => r.max));
  return { min, max };
}

/** Encuentra el role entry mas relevante por nombre o keyword. */
export function findRoleEntry(roleQuery: string): RoleEntry | null {
  const q = roleQuery.toLowerCase().trim();
  if (!q) return null;
  // 1. Match exacto al role name
  let entry = RATE_CARDS.find((r) => r.role.toLowerCase() === q);
  if (entry) return entry;
  // 2. Match por keyword exacto
  entry = RATE_CARDS.find((r) => r.keywords.some((k) => q.includes(k.toLowerCase())));
  if (entry) return entry;
  // 3. Match parcial al role name
  entry = RATE_CARDS.find((r) => q.includes(r.role.toLowerCase()) || r.role.toLowerCase().includes(q));
  return entry || null;
}

/** Lista de roles para autocomplete en UI. */
export function listRoles(): { role: string; category: string }[] {
  return RATE_CARDS.map((r) => ({ role: r.role, category: r.category }));
}
