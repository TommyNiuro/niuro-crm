import { Suspense } from "react";
import { ProposalBuilder } from "@/components/proposals/ProposalBuilder";

// ProposalBuilder usa useSearchParams (?id para modo edicion), que exige un
// limite de Suspense para poder prerenderizar esta ruta de forma estatica.
export default function NewProposalPage() {
  return (
    <Suspense fallback={null}>
      <ProposalBuilder />
    </Suspense>
  );
}
