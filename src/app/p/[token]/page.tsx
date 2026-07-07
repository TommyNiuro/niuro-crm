/**
 * src/app/p/[token]/page.tsx · Pagina publica de share de una propuesta.
 *
 * Sin sesion de CRM (ver PUBLIC_PREFIXES en middleware.ts): es el link que se
 * manda a un cliente externo por mail o WhatsApp. Consume el endpoint publico
 * GET /api/public/proposals/[token], que devuelve solo los campos seguros
 * (nunca transcript/notas/contactId/etc).
 *
 * Mismo patron que /proposals/[id]/print (capa fija a pantalla completa que
 * tapa el chrome del CRM del layout raiz), pero con scroll normal (no A4) y un
 * header minimo con el logo de Niuro.
 */
"use client";

import { use, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { ProposalRenderer } from "@/components/proposals/ProposalRenderer";
import { toRenderData, type ProposalRenderData, type ProposalRowLike } from "@/components/proposals";

type RouteParams = { token: string };

export default function ProposalSharePage({ params }: { params: Promise<RouteParams> }) {
  const { token } = use(params);
  const [proposal, setProposal] = useState<ProposalRenderData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/proposals/${token}`, { cache: "no-store" });
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = (await res.json()) as ProposalRowLike;
        if (!cancelled) setProposal(toRenderData(data));
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div
      className="niuro-proposal"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflow: "auto",
        background: "#F5F0E8",
        color: "#050F41",
      }}
    >
      {notFound ? (
        <div style={{ padding: 48, textAlign: "center", fontFamily: "sans-serif", color: "#6B7280" }}>
          Este link ya no esta disponible.
        </div>
      ) : proposal ? (
        <div style={{ padding: "32px 16px" }}>
          <ProposalRenderer proposal={proposal} />
        </div>
      ) : (
        <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#3B5FE5" }} />
        </div>
      )}
    </div>
  );
}
