/**
 * extract-web-lead.ts — Evaluación IA de una captura de web como cliente potencial.
 *
 * Recibe la ruta absoluta de una imagen (captura de la web de una empresa/startup)
 * y usa VISIÓN (runClaudeVision → claude CLI con @mención, FAST_MODEL/haiku) para
 * decidir si es cliente potencial de Niuro (staff augmentation de devs senior) y
 * extraer los datos. La imagen es el único input — no hay conversación.
 *
 * El score 0-100 lo calcula la IA directo (a diferencia de score-lead.ts, que
 * puntúa conversaciones de WhatsApp con una rúbrica de 5 dimensiones: acá no hay
 * señales de intención/urgencia de una charla, sino la web de una empresa).
 */
import { runClaudeVision, FAST_MODEL } from "@/lib/claude-subprocess";
import { operator } from "@/lib/operator";

export interface WebLeadExtract {
  isLead: boolean;
  company: string | null;
  whatTheyDo: string | null;
  role: string | null;
  stack: string[];
  seniority: string | null;
  contactEmail: string | null;
  contactUrl: string | null;
  contactInfo: string | null;
  score: number; // 0-100
  summary: string | null;
  notes: string | null;
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asStringArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const PROMPT = `Sos ${operator.name}, de ${operator.company} (${operator.pitch}): staff augmentation de ingenieros de software SENIOR de LATAM. Colocás devs pre-vetteados en empresas (sobre todo startups/scaleups, muchas de EE.UU.) en ~48h. Competís contra recruiters, contratación in-house y plataformas tipo Ontop.

Te paso UNA captura de pantalla de la web (o landing/about/careers/perfil) de una empresa o startup. Tu trabajo: decidir si es CLIENTE POTENCIAL de ${operator.company} y extraer todo dato útil para contactarla.

CRITERIO de cliente potencial (a quién le sirve ${operator.company}):
- Empresas que construyen producto de software y por ende contratan o contratarán devs (startups, scaleups, SaaS, fintech, AI, marketplaces, agencias de software).
- Señales fuertes (suben el score): sección "Careers"/"We're hiring"/vacantes de ingeniería, equipo técnico o CTO visible, respaldo de fondos/Series A-B (presupuesto), stack moderno, crecimiento, fully-remote/LATAM-friendly.
- Señales débiles o NO-lead (bajan el score): negocio sin componente de software, empresa puramente local de servicios, ONG sin tech, página personal sin empresa, competidor directo (otra staffing/recruiting), empresa demasiado grande con su propio recruiting masivo.

Devolvé UN ÚNICO JSON (sin markdown, sin texto extra):
{
  "isLead": true|false,            // ¿vale la pena que ${operator.name} la contacte como prospecto?
  "company": "nombre de la empresa/startup tal como aparece. null si no se ve",
  "whatTheyDo": "1-2 frases: qué hace la empresa / su producto, leído de la captura",
  "role": "rol técnico que probablemente necesiten contratar (ej. 'Senior Backend Engineer', 'Full-Stack', 'ML Engineer'). Inferí del producto/stack/vacantes. null si no hay señal",
  "stack": ["tecnologías visibles o inferibles: lenguajes, frameworks, cloud, dominios (AI/ML, Data, Web3)"],
  "seniority": "junior|mid|senior|lead|principal — el seniority que Niuro encajaría. Default 'senior' (es el sweet spot de Niuro) salvo señal contraria. null si no hay nada",
  "contactEmail": "email de contacto VISIBLE en la captura (formato xxx@yyy.zz). null si no aparece. NO lo inventes",
  "contactUrl": "URL/dominio de la empresa visible (ej. velora.ai). null si no se ve. NO inventes",
  "contactInfo": "otro dato de contacto visible: teléfono, @handle de redes, LinkedIn. null si no hay",
  "score": 0-100,                  // qué tan buen cliente potencial es para Niuro (0=nada, 100=ideal). Sé honesto y calibrado
  "summary": "2-3 frases para ${operator.name}: por qué es (o no) cliente potencial y el ángulo de approach",
  "notes": "cualquier observación útil (etapa de la empresa, vacantes concretas, riesgos). null si no hay"
}

REGLAS:
- Basate SOLO en lo que se ve en la captura. No inventes emails, nombres ni datos.
- Si la captura no es la web de una empresa (ej. un meme, un chat, una factura), isLead=false, score 0 y explicá en summary qué viste.
- Si no podés leer bien la imagen, isLead=false, score 0 y decilo en summary.
- Sé proactivo extrayendo company/whatTheyDo/stack: es para ahorrarle trabajo a ${operator.name}.
Solo el JSON.`;

/**
 * Analiza la captura y devuelve la extracción IA. Devuelve null solo si la IA
 * falló por completo (timeout o respuesta no parseable) — el caller decide cómo
 * marcar la fila (status ready con summary de error).
 */
export async function extractWebLead(imagePath: string): Promise<WebLeadExtract | null> {
  try {
    const raw = await runClaudeVision(PROMPT, imagePath, {
      model: FAST_MODEL,
      // Visión vía subprocess: en pruebas Haiku tarda 7-15s. 90s deja margen de
      // sobra para colas del semáforo global (máx 2 claude concurrentes).
      timeoutMs: 90_000,
    });
    const p = parseJson(raw);
    if (!p) return null;

    const seniorityRaw = asString(p.seniority);
    const validSeniority = ["junior", "mid", "senior", "lead", "principal"];
    const rawEmail = asString(p.contactEmail);
    const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail.toLowerCase() : null;

    return {
      isLead: typeof p.isLead === "boolean" ? p.isLead : clampScore(p.score) >= 50,
      company: asString(p.company),
      whatTheyDo: asString(p.whatTheyDo),
      role: asString(p.role),
      stack: asStringArr(p.stack),
      seniority: seniorityRaw && validSeniority.includes(seniorityRaw.toLowerCase()) ? seniorityRaw.toLowerCase() : null,
      contactEmail: email,
      contactUrl: asString(p.contactUrl),
      contactInfo: asString(p.contactInfo),
      score: clampScore(p.score),
      summary: asString(p.summary),
      notes: asString(p.notes),
    };
  } catch (err) {
    console.error("[extract-web-lead] error:", err);
    return null;
  }
}
