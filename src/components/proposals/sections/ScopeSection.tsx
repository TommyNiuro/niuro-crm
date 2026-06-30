/* Grid 2x3 de cards con alcance del servicio (seccion 2 del template). */
import type { ProposalRenderData } from "../render-types";
import { SectionTitle } from "./SectionTitle";
import { SectionIcons } from "../icons";
import { CardGrid } from "./CardGrid";
import { defaultScopeCardsStaff, defaultScopeCardsSprint } from "../defaults";

type Props = { proposal: ProposalRenderData };

export function ScopeSection({ proposal }: Props) {
  const cards =
    proposal.cards?.scope && proposal.cards.scope.length > 0
      ? proposal.cards.scope
      : proposal.mode === "sprint"
        ? defaultScopeCardsSprint()
        : defaultScopeCardsStaff();

  const title =
    proposal.mode === "sprint"
      ? "2. Alcance del sprint"
      : "2. Alcance del servicio (30 / 60 / 90 dias)";

  return (
    <>
      <SectionTitle icon={SectionIcons.scope}>{title}</SectionTitle>
      <CardGrid cards={cards} iconSet="scope" />
    </>
  );
}
