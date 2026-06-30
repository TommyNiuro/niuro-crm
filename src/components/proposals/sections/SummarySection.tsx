/* Blue-box: executive summary + context-box embebido + badges + highlight.
 *
 * El summary y el contextParagraph vienen como HTML sanitizado upstream, por
 * eso usamos dangerouslySetInnerHTML. Si el campo esta vacio, mostramos el
 * highlight de Pending sin romper el layout.
 */
import type { ProposalRenderData } from "../render-types";
import { PENDING_LABEL, fmtAmount } from "../utils";
import { sanitizeInlineHtml } from "../format";
import { ContextSection } from "./ContextSection";

type Props = { proposal: ProposalRenderData };

function pendingHTML() {
  return `<span class="pending">${PENDING_LABEL}</span>`;
}

function highlightForStaff(proposal: ProposalRenderData): string {
  const pricing = proposal.pricing ?? { currency: "CLP" };
  const currency = pricing.currency ?? "CLP";
  const min = pricing.monthlyMin;
  const max = pricing.monthlyMax;
  if (!min) return PENDING_LABEL;
  const isRange = max && max !== min && max > min;
  const minStr = fmtAmount(min, currency);
  const range = isRange ? ` a ${fmtAmount(max, currency)}` : "";
  return `Inversion ${isRange ? "estimada" : "mensual"}: ${minStr}${range} / mes + IVA`;
}

function highlightForSprint(proposal: ProposalRenderData): string {
  const pricing = proposal.pricing ?? { currency: "USD" };
  const total = pricing.total;
  if (!total) return PENDING_LABEL;
  const deliverables = proposal.deliverablesShort ?? "Entregables del sprint incluidos";
  return `Inversion total: ${fmtAmount(total, pricing.currency ?? "USD")} + IVA. ${deliverables}. Precio cerrado, sin sorpresas.`;
}

function defaultStaffBadges(proposal: ProposalRenderData) {
  const { client, role } = proposal;
  return [
    { icon: "◈", text: client?.industry ?? "Industria pendiente" },
    { icon: "+", text: "Staff Augmentation" },
    { icon: "<>", text: role ?? "Rol pendiente" },
    { icon: "•", text: client?.country ?? "Pais pendiente" },
    { icon: "◷", text: "Full-time dedicado" },
    { icon: "ϟ", text: "Shortlist 6-10 dias" },
  ];
}

function defaultSprintBadges(proposal: ProposalRenderData) {
  const { client, duration } = proposal;
  return [
    { icon: "✚", text: client?.industry ?? "Industria pendiente" },
    { icon: "ϟ", text: "Project Sprint" },
    { icon: "<>", text: "Full Stack" },
    { icon: "◧", text: "B2C + B2B" },
    { icon: "◯", text: client?.country ?? "Pais pendiente" },
    { icon: "◴", text: duration ?? "Duracion pendiente" },
  ];
}

export function SummarySection({ proposal }: Props) {
  const { mode, date, summary, context } = proposal;
  const headerLabel =
    mode === "sprint" ? "Project Sprint (Consultoria)" : "Staff Augmentation";

  const summaryHTML = summary && summary.trim() ? sanitizeInlineHtml(summary) : pendingHTML();

  const badges =
    proposal.badges && proposal.badges.length > 0
      ? proposal.badges
      : mode === "sprint"
        ? defaultSprintBadges(proposal)
        : defaultStaffBadges(proposal);

  const highlightInvest =
    mode === "sprint" ? highlightForSprint(proposal) : highlightForStaff(proposal);

  return (
    <div className="blue-box">
      <div className="blue-box-header">
        <span>{headerLabel}</span>
        <span>{date ?? PENDING_LABEL}</span>
      </div>
      <div
        className="summary-text"
        dangerouslySetInnerHTML={{ __html: summaryHTML }}
      />
      <ContextSection context={context} mode={mode} />
      <div className="badges">
        {badges.map((b, i) => (
          <div key={i} className="badge">
            <span className="ico">{b.icon}</span> {b.text}
          </div>
        ))}
      </div>
      <div className="highlight-text">{highlightInvest}</div>
    </div>
  );
}
