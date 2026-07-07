/**
 * src/lib/job-description-filename.ts · Nombre de archivo de descargas de JD.
 *
 * Standalone (CERO imports de @/db) a propósito: lo usan endpoints de servidor
 * (pdf/route.ts) y puede usarlo un componente cliente. Formato:
 * "{Rol} - {Empresa} - Descripcion de cargo - Niuro - {YYYY-MM-DD}.ext".
 */
export function buildJobDescriptionFileName(
  opts: { roleTitle?: string | null; clientName: string; createdAt?: Date | number | null },
  ext: string,
): string {
  const parts: string[] = [];
  if (opts.roleTitle && opts.roleTitle.trim()) parts.push(opts.roleTitle.trim());
  parts.push(opts.clientName.trim() || "Empresa");
  parts.push("Descripcion de cargo");
  parts.push("Niuro");
  const d = opts.createdAt ? new Date(opts.createdAt) : new Date();
  parts.push(isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10));

  const safe = parts
    .join(" - ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "Descripcion de cargo - Niuro"}.${ext}`;
}
