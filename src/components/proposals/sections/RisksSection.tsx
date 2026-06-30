/* Grid 2x2 de "special cards" coral (.special-card).
 * El body inicia con "Mitigacion:" en font-bold text-navy aunque la prop no
 * traiga el prefijo. Si ya viene, lo dejamos.
 */
import type { ProposalRenderData, Risk } from "../render-types";
import { SectionTitle } from "./SectionTitle";
import { SectionIcons, iconFor } from "../icons";
import { defaultRisksStaff, defaultRisksSprint } from "../defaults";
import { countWords } from "../utils";
import { sanitizeInlineHtml } from "../format";

type Props = { proposal: ProposalRenderData };

function ensureMitigation(body: string): string {
  const trimmed = body.trim();
  if (!trimmed)
    return '<strong class="mitigation">Mitigacion:</strong> Pendiente por confirmar.';
  /* Detectar si ya viene con "Mitigacion:" (case insensitive). */
  if (/^<strong[^>]*>\s*mitig/i.test(trimmed) || /^mitigaci[oó]n\s*:/i.test(trimmed)) {
    /* Convertir "Mitigacion:" plain a strong, idempotente. */
    return trimmed.replace(
      /^mitigaci[oó]n\s*:/i,
      '<strong class="mitigation">Mitigacion:</strong>',
    );
  }
  return `<strong class="mitigation">Mitigacion:</strong> ${trimmed}`;
}

export function RisksSection({ proposal }: Props) {
  /* Mostrar los riesgos reales de la IA aunque no sean exactamente 4 (antes
   * un gate `=== 4` los descartaba enteros y pintaba boilerplate). Consistente
   * con el resto de secciones, que usan `length > 0`. El grid 2x2 tolera N. */
  const risks: Risk[] =
    proposal.risks && proposal.risks.length > 0
      ? proposal.risks
      : proposal.mode === "sprint"
        ? defaultRisksSprint()
        : defaultRisksStaff();

  return (
    <>
      <SectionTitle icon={SectionIcons.risks}>Riesgos y mitigacion</SectionTitle>
      <div className="grid-2">
        {risks.map((r, i) => {
          const body = ensureMitigation(sanitizeInlineHtml(r.body));
          /* Quita HTML para contar palabras visibles */
          const wc = countWords(body.replace(/<[^>]*>/g, " "));
          const warn = wc > 32 ? "1" : undefined;
          return (
            <div key={i} className="special-card">
              <div className="card-header">
                <div className="card-icon">{iconFor("risks", i)}</div>
                <h3 dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(r.title) }} />
              </div>
              <p
                data-wc-warn={warn}
                data-wc={wc}
                dangerouslySetInnerHTML={{ __html: body }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
