/* Grid 2x2 de cards con objetivos del servicio (seccion 1 del template). */
import type { ProposalRenderData } from "../render-types";
import { SectionTitle } from "./SectionTitle";
import { SectionIcons } from "../icons";
import { CardGrid } from "./CardGrid";
import {
  defaultObjectiveCardsStaff,
  defaultObjectiveCardsSprint,
} from "../defaults";

type Props = { proposal: ProposalRenderData };

export function ObjectivesSection({ proposal }: Props) {
  const cards =
    proposal.cards?.objective && proposal.cards.objective.length > 0
      ? proposal.cards.objective
      : proposal.mode === "sprint"
        ? defaultObjectiveCardsSprint()
        : defaultObjectiveCardsStaff(proposal.client?.name);

  return (
    <>
      <SectionTitle icon={SectionIcons.objective}>
        1. Objetivo y enfoque del servicio
      </SectionTitle>
      <CardGrid cards={cards} iconSet="objective" />
    </>
  );
}
