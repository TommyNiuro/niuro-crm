/* ProposalRenderer: componente puro, sin estado, sin fetch.
 *
 * Port de propuestas-niuro/src/components/proposal/ProposalRenderer.tsx.
 * Recibe una propuesta YA parseada (objetos, no strings JSON) y la renderiza
 * visualmente identica a la plantilla v5. Pixel a pixel.
 *
 * Estructura del documento (page-break-after en cada .page):
 *   Page 1  -> Cover + Summary blue-box
 *   Page 2  -> Objectives + Scope
 *   Page 3  -> Governance + Roadmap
 *   Page 4  -> Team + Risks
 *   Page 5  -> Pricing/Condiciones + AboutNiuro (disclaimer)
 *
 * Doble wrapper:
 *   .niuro-proposal -> tokens de marca scopeados + fuentes (definidos en
 *                      globals.css por Fundaciones).
 *   .proposal-doc   -> estilos estructurales completos (importados de
 *                      ./proposal-template.css, scopeados bajo .proposal-doc).
 * Ambos coexisten sin pisar el tema dark/semantico del CRM.
 *
 * No requiere 'use client': solo renderiza props. Sirve para SSR y para el
 * print-to-PDF que hace el agente PDF.
 */
import type { ProposalRenderData } from "./render-types";

import "./proposal-template.css";

import { CoverSection } from "./sections/CoverSection";
import { SummarySection } from "./sections/SummarySection";
import { ObjectivesSection } from "./sections/ObjectivesSection";
import { ScopeSection } from "./sections/ScopeSection";
import { GovernanceSection } from "./sections/GovernanceSection";
import { RoadmapSection } from "./sections/RoadmapSection";
import { TeamSection } from "./sections/TeamSection";
import { RisksSection } from "./sections/RisksSection";
import { PricingSection } from "./sections/PricingSection";
import { AboutNiuroSection } from "./sections/AboutNiuroSection";

export type ProposalRendererProps = {
  proposal: ProposalRenderData;
};

export function ProposalRenderer({ proposal }: ProposalRendererProps) {
  return (
    <div className="niuro-proposal">
      <div className="proposal-doc">
        {/* Page 1: Cover + Executive summary */}
        <div className="page">
          <CoverSection proposal={proposal} />
          <SummarySection proposal={proposal} />
        </div>

        {/* Page 2: Objectives + Scope */}
        <div className="page">
          <ObjectivesSection proposal={proposal} />
          <ScopeSection proposal={proposal} />
        </div>

        {/* Page 3: Governance + Roadmap */}
        <div className="page">
          <GovernanceSection proposal={proposal} />
          <RoadmapSection proposal={proposal} />
        </div>

        {/* Page 4: Team + Risks */}
        <div className="page">
          <TeamSection proposal={proposal} />
          <RisksSection proposal={proposal} />
        </div>

        {/* Page 5: Pricing/Condiciones + AboutNiuro disclaimer */}
        <div className="page">
          <PricingSection proposal={proposal} />
          <AboutNiuroSection proposal={proposal} />
        </div>
      </div>
    </div>
  );
}
