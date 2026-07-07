/**
 * src/lib/proposal-filename.ts · Nombre de archivo estandarizado de descargas.
 *
 * Modulo standalone (CERO imports de @/db u otro server-only) a proposito:
 * lo usan tanto endpoints de servidor (pdf/route.ts) como componentes cliente
 * (ProposalHtmlView.tsx). Si viviera en src/lib/proposals.ts (que importa
 * @/db), un componente "use client" que lo importara arrastraria better-
 * sqlite3 al bundle del browser y rompería el build.
 *
 * Formato: "{Puesto} - {Cliente} - {Staffing|Sprint} - Niuro - {fecha}.ext".
 * Puesto solo aplica a staff-aug (proposals.role); sprint no tiene un cargo,
 * asi que se omite ese segmento. Fecha = createdAt (cuando se armo la
 * propuesta), formato YYYY-MM-DD para que ordene bien en Finder/Explorer.
 */
export function buildProposalFileName(
  opts: { role?: string | null; mode: string; clientName: string; createdAt?: Date | number | null },
  ext: string,
): string {
  const parts: string[] = [];
  if (opts.role && opts.role.trim()) parts.push(opts.role.trim());
  parts.push(opts.clientName.trim() || "Cliente");
  parts.push(opts.mode === "sprint" ? "Sprint" : "Staffing");
  parts.push("Niuro");
  const d = opts.createdAt ? new Date(opts.createdAt) : new Date();
  parts.push(isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10));

  const safe = parts
    .join(" - ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .replace(/[/\\:*?"<>|]/g, "") // caracteres invalidos en nombres de archivo
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "Propuesta - Niuro"}.${ext}`;
}
