/* Grid 2x2 cards forma de trabajo + gobernanza (seccion 3 del template). */
import type { ProposalRenderData } from "../render-types";
import { SectionTitle } from "./SectionTitle";
import { SectionIcons } from "../icons";
import { CardGrid } from "./CardGrid";
import {
  defaultGovernanceCardsStaff,
  defaultGovernanceCardsSprint,
} from "../defaults";

type Props = { proposal: ProposalRenderData };

export function GovernanceSection({ proposal }: Props) {
  const cards =
    proposal.cards?.governance && proposal.cards.governance.length > 0
      ? proposal.cards.governance
      : proposal.mode === "sprint"
        ? defaultGovernanceCardsSprint()
        : defaultGovernanceCardsStaff();

  const title =
    proposal.mode === "sprint"
      ? "3. Forma de trabajo y gobernanza"
      : "3. Forma de trabajo, gobernanza y reporting";

  return (
    <>
      <SectionTitle icon={SectionIcons.govern}>{title}</SectionTitle>
      <CardGrid cards={cards} iconSet="governance" />
    </>
  );
}
