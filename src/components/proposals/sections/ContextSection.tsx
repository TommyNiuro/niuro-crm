/* Renderiza el contexto del cliente: paragraph (40-60 palabras) + dataPoints
 * (bullets con label en <strong>). El v3 lo tenia embebido como `.context-box`
 * dentro del `.blue-box`.
 */
import { PENDING_LABEL } from "../utils";
import { sanitizeInlineHtml } from "../format";
import type { ProposalRenderData } from "../render-types";

type Props = {
  context?: ProposalRenderData["context"];
  /** Mode para defaults cuando el LLM no lleno context.dataPoints. */
  mode?: ProposalRenderData["mode"];
};

function pendingHTML() {
  return `<span class="pending">${PENDING_LABEL}</span>`;
}

export function defaultDataPoints(mode: ProposalRenderData["mode"]): string[] {
  if (mode === "sprint") {
    return [
      "Empresa: " + PENDING_LABEL,
      "Contacto: " + PENDING_LABEL,
      "Stack tecnico: " + PENDING_LABEL,
      "Alcance: " + PENDING_LABEL,
    ];
  }
  return [
    "Industria y foco: " + PENDING_LABEL,
    "Stack y capacidades objetivo: " + PENDING_LABEL,
    "Retos principales: " + PENDING_LABEL,
    "Urgencia: " + PENDING_LABEL,
    "Stakeholders involucrados: " + PENDING_LABEL,
  ];
}

export function ContextSection({ context, mode = "staff-aug" }: Props) {
  const paragraph = context?.paragraph?.trim()
    ? sanitizeInlineHtml(context.paragraph)
    : pendingHTML();
  const dataPoints =
    context?.dataPoints && context.dataPoints.length > 0
      ? context.dataPoints
      : defaultDataPoints(mode);

  return (
    <div className="context-box">
      <div className="context-box-title">
        <span className="ico">i</span> Contexto del Cliente
      </div>
      <p dangerouslySetInnerHTML={{ __html: paragraph }} />
      <div className="data-title">Datos clave:</div>
      <ul>
        {dataPoints.map((d, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(d) }} />
        ))}
      </ul>
    </div>
  );
}
