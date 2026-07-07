"use client";

/* Panel de checklist de completitud. NO bloquea nada (enviar/exportar siempre
 * disponible): es una guia visual. Calculo 100% cliente (funcion pura), sin
 * fetch propio. */
import { Check, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildProposalChecklist } from "@/lib/proposals-checklist";
import type { SerializedProposal } from "@/lib/proposals";

type Props = {
  proposal: SerializedProposal;
};

export function ProposalChecklistPanel({ proposal }: Props) {
  const items = buildProposalChecklist(proposal);

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
      <div className="text-[12.5px] font-semibold mb-1">Checklist</div>
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-2 text-[12.5px]">
          {item.done ? (
            <Check className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
          ) : item.severity === "info" ? (
            <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle
              className={cn(
                "h-3.5 w-3.5 shrink-0 mt-0.5",
                item.severity === "error" ? "text-destructive" : "text-amber-500",
              )}
            />
          )}
          <span className={cn(item.done ? "text-muted-foreground line-through" : "text-foreground")}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
