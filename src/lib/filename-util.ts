/**
 * Helpers compartidos para nombres de archivo de descargas. Standalone (CERO
 * imports de @/db u otro server-only) a propósito: los usan tanto endpoints de
 * servidor (pdf/route.ts) como componentes cliente. Si arrastraran better-sqlite3
 * romperían el bundle del browser.
 */

/** Une las partes con " - ", quita tildes y caracteres inválidos, y agrega la
 *  extensión. Cae al fallback si queda vacío. */
export function sanitizeFileName(parts: string[], fallback: string, ext: string): string {
  const safe = parts
    .join(" - ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes (combining diacriticals)
    .replace(/[/\\:*?"<>|]/g, "") // caracteres inválidos en nombres de archivo
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || fallback}.${ext}`;
}

/** Fecha YYYY-MM-DD (para que ordene bien en Finder/Explorer). Cae a hoy si la
 *  fecha es inválida. */
export function fileDateStamp(createdAt?: Date | number | null): string {
  const d = createdAt ? new Date(createdAt) : new Date();
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}
