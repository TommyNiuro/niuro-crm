"use client";

/* Pestaña "Codigo HTML": trae el documento standalone (fuentes + CSS + markup
 * inline, ver src/lib/proposals-html.tsx) y lo muestra como texto. Mismo
 * string sirve para "Exportar HTML" (descarga como Blob, igual que Cotizador
 * Niuro). Fetch lazy: solo se pide cuando se abre la pestaña. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Copy, Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildProposalFileName } from "@/lib/proposal-filename";

type Props = {
  proposalId: string;
  role?: string | null;
  mode: string;
  clientName: string;
  createdAt?: number | null;
};

export function ProposalHtmlView({ proposalId, role, mode, clientName, createdAt }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/proposals/${proposalId}/html`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((json) => {
        if (!cancelled) setHtml(json.html || "");
      })
      .catch(() => {
        if (!cancelled) toast.error("No se pudo generar el HTML");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  const download = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = buildProposalFileName({ role, mode, clientName, createdAt }, "html");
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="h-full grid place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <button
          onClick={() => html && navigator.clipboard.writeText(html).then(() => toast.success("Copiado"))}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer")}
        >
          <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
        </button>
        <button
          onClick={download}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer")}
        >
          <Download className="h-3.5 w-3.5 mr-1" /> Descargar .html
        </button>
      </div>
      <pre className="flex-1 overflow-auto p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all bg-muted/30">
        {html}
      </pre>
    </div>
  );
}
