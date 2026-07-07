"use client";

/* Banner de viabilidad de mercado (análisis Frankenstein). INTERNO: se muestra
 * solo en el detalle del CRM, para Tomás. NUNCA va en el PDF del candidato (el
 * JobDescriptionRenderer no lo renderiza). Si hay un cruce de roles (warning),
 * Tomás puede aterrizar el perfil por el chat de ajustes. */
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { JobDescriptionViability } from "@/types";

export function JobDescriptionViabilityBanner({
  viability,
}: {
  viability: JobDescriptionViability | null | undefined;
}) {
  if (!viability || !viability.note?.trim()) return null;

  const warn = viability.status === "warning";
  return (
    <div
      className="rounded-xl border p-3 flex items-start gap-2.5 text-[12.5px] leading-relaxed"
      style={{
        background: warn ? "color-mix(in srgb, #D4940A 10%, transparent)" : "color-mix(in srgb, #16A34A 9%, transparent)",
        borderColor: warn ? "color-mix(in srgb, #D4940A 40%, transparent)" : "color-mix(in srgb, #16A34A 35%, transparent)",
      }}
    >
      {warn ? (
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#D4940A" }} />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#16A34A" }} />
      )}
      <div className="min-w-0">
        <div className="font-semibold" style={{ color: warn ? "#B8790A" : "#15803D" }}>
          {warn ? "Alerta de viabilidad de mercado" : "Perfil viable"}
        </div>
        <p className="text-muted-foreground mt-0.5 whitespace-pre-line">{viability.note}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          Análisis interno. No aparece en el PDF del candidato.
        </p>
      </div>
    </div>
  );
}
