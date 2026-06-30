/* Helpers de formateo para el modulo de propuestas.
 * Port de propuestas-niuro/src/lib/format.ts (formatCurrency, formatDateES).
 * Se mantienen dentro de components/proposals/ para no crear archivos nuevos
 * en src/lib (otros agentes tocan esa carpeta en la fase de integracion).
 */

const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Formatea un monto con su moneda. CLP sin decimales, USD/MXN/EUR con dos.
 * Null/undefined devuelve "Pendiente" para no romper la UI con propuestas sin
 * pricing (sin guion largo, regla de oro del proyecto).
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string = "USD",
): string {
  if (amount == null) return "Pendiente";
  const opts: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "CLP" ? 0 : 2,
    maximumFractionDigits: currency === "CLP" ? 0 : 2,
  };
  const locale = currency === "USD" ? "en-US" : "es-CL";
  try {
    return new Intl.NumberFormat(locale, opts).format(amount);
  } catch {
    return `${amount}`;
  }
}

/**
 * Formatea ISO date string (YYYY-MM-DD) a "DD de mes AAAA" en espanol.
 */
export function formatDateES(iso: string | null | undefined): string {
  if (!iso) return "Pendiente";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, year, month, day] = m;
  const name = MONTH_NAMES_ES[parseInt(month, 10) - 1];
  if (!name) return iso;
  return `${parseInt(day, 10)} de ${name} de ${year}`;
}

/* Tags de enfasis que la IA puede emitir. El prompt de generacion solo usa
 * <strong>, pero dejamos los hermanos por robustez. */
const SANITIZE_ALLOWED_TAGS = ["strong", "em", "b", "i", "u"];

/**
 * Sanitiza HTML inline generado por la IA antes de inyectarlo con
 * dangerouslySetInnerHTML. El contenido sale de un prompt alimentado por el
 * transcript del cliente, asi que un transcript malicioso podria intentar
 * inyeccion indirecta (meter <script>, <img onerror=...>, on*=, href/src
 * javascript:).
 *
 * Estrategia robusta (allowlist por ESCAPAR-y-RESTAURAR, no por strip):
 *   1. Se quitan comentarios y bloques peligrosos cerrados (script/style/...).
 *   2. Se ESCAPAN TODOS los '<' y '>' a entidad. Esto neutraliza CUALQUIER tag,
 *      incluso uno sin el '>' de cierre (`<img src=x onerror=...`) o anidado
 *      (`<scr<script>ipt>`): casos que un strip por patron dejaba pasar.
 *   3. Se RESTAURAN solo los tags de enfasis permitidos en forma bare (sin
 *      atributos): un `<strong onmouseover=x>` queda escapado (inerte), solo el
 *      `<strong>` limpio vuelve a ser markup. La IA emite tags bare, asi que el
 *      contenido legitimo no se ve afectado.
 * Defensa en el sink de render: cubre propuestas nuevas y las ya guardadas
 * (auditoria 2026-06-22).
 */
export function sanitizeInlineHtml(input: string | null | undefined): string {
  if (input == null) return "";
  let s = String(input);
  // 0. Normalizar entidades del input a sus caracteres reales ANTES de procesar
  //    (auditoria de seguridad 2026-06-23). Sin esto, un input ya escapado como
  //    `&lt;img onerror=x&gt;` no lo veian los pasos 1-3 y la estrategia
  //    escapar-y-restaurar quedaba fragil. Decodificando primero, el sanitizer
  //    SIEMPRE ve tags reales y el escape del paso 2 los neutraliza de forma
  //    uniforme. Orden seguro: '&lt;'/'&gt;' primero y '&amp;' AL FINAL, para no
  //    re-crear entidades ni habilitar doble-decodificacion (`&amp;lt;` queda
  //    como texto '&lt;', no como '<').
  s = s.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
  s = s.replace(/&amp;/gi, "&");
  // 1. Comentarios y bloques peligrosos CERRADOS (con su contenido).
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(
    /<(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi,
    "",
  );
  // 2. Escapar TODO angle bracket. No tocamos '&' para no doble-escapar entidades.
  s = s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 3. Restaurar solo los tags de enfasis permitidos en forma bare.
  for (const tag of SANITIZE_ALLOWED_TAGS) {
    s = s.replace(new RegExp(`&lt;${tag}\\s*&gt;`, "gi"), `<${tag}>`);
    s = s.replace(new RegExp(`&lt;/${tag}\\s*&gt;`, "gi"), `</${tag}>`);
  }
  s = s.replace(/&lt;br\s*\/?\s*&gt;/gi, "<br/>");
  return s;
}
