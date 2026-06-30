/**
 * src/app/proposals/[id]/print/page.tsx
 *
 * Pagina de impresion de una propuesta, pensada para A4 / PDF (Playwright
 * navega aca desde src/lib/proposals-pdf.ts). Renderiza SOLO el
 * <ProposalRenderer/> dentro de .niuro-proposal, sin sidebar ni chrome de app,
 * fondo blanco.
 *
 * El root layout (src/app/layout.tsx) envuelve todo con Sidebar + Header. No lo
 * tocamos: en su lugar, esta pagina se monta como una capa fija a pantalla
 * completa (position: fixed, inset 0, z-index alto, fondo blanco) que tapa el
 * chrome. Para el PDF solo importa lo que se ve, y lo unico visible queda la
 * propuesta.
 *
 * Es client component porque hace fetch de GET /api/proposals/[id] (endpoint a
 * cargo de otro agente) y porque ProposalRenderer puede requerir cliente.
 *
 * El import de ProposalRenderer apunta a @/components/proposals/ProposalRenderer
 * (lo crea el Agente C en paralelo). Si todavia no existe al escribir esto, el
 * import igual queda correcto y la fase de integracion lo valida.
 */
"use client";

import { use, useEffect, useState } from "react";

import { ProposalRenderer } from "@/components/proposals/ProposalRenderer";
import {
  toRenderData,
  type ProposalRenderData,
  type ProposalRowLike,
} from "@/components/proposals";

type RouteParams = { id: string };

/**
 * Algunos campos de la tabla proposals se guardan como JSON serializado en
 * columnas TEXT (client, pricing, context, cards, roadmap, team, risks). El
 * endpoint GET /api/proposals/[id] los devuelve ya parseados, pero toRenderData
 * (el normalizador compartido) tolera objeto o string y rellena defaults, asi
 * que delegamos en el para que ProposalRenderer reciba siempre el shape correcto.
 */
export default function ProposalPrintPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { id } = use(params);
  const [proposal, setProposal] = useState<ProposalRenderData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/proposals/${id}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError("No se pudo cargar la propuesta");
          return;
        }
        const data: unknown = await res.json();
        // El endpoint puede devolver { proposal } o la propuesta directa.
        const record =
          data && typeof data === "object" && "proposal" in data
            ? (data as { proposal: ProposalRowLike }).proposal
            : (data as ProposalRowLike);
        if (!cancelled) setProposal(toRenderData(record));
      } catch {
        if (!cancelled) setError("No se pudo cargar la propuesta");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div
      className="niuro-proposal"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflow: "auto",
        background: "#ffffff",
        color: "#050F41",
      }}
    >
      {error ? (
        <div style={{ padding: "24px", fontFamily: "sans-serif" }}>{error}</div>
      ) : proposal ? (
        <ProposalRenderer proposal={proposal} />
      ) : null}
    </div>
  );
}
