/**
 * src/lib/job-description-filename.ts · Nombre de archivo de descargas de JD.
 *
 * Standalone (CERO imports de @/db) a propósito: lo usan endpoints de servidor
 * (pdf/route.ts) y puede usarlo un componente cliente. Formato:
 * "{Rol} - {Empresa} - Descripcion de cargo - Niuro - {YYYY-MM-DD}.ext".
 */
import { sanitizeFileName, fileDateStamp } from "./filename-util";

export function buildJobDescriptionFileName(
  opts: { roleTitle?: string | null; clientName: string; createdAt?: Date | number | null },
  ext: string,
): string {
  const parts: string[] = [];
  if (opts.roleTitle && opts.roleTitle.trim()) parts.push(opts.roleTitle.trim());
  parts.push(opts.clientName.trim() || "Empresa");
  parts.push("Descripcion de cargo");
  parts.push("Niuro");
  parts.push(fileDateStamp(opts.createdAt));
  return sanitizeFileName(parts, "Descripcion de cargo - Niuro", ext);
}
