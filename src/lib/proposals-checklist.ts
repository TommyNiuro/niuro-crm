/**
 * src/lib/proposals-checklist.ts · Checklist de completitud pre-envio.
 *
 * Funcion pura (sin IO): recibe una propuesta serializada y devuelve una
 * lista de items con severidad. NO bloquea nada (el boton de enviar/exportar
 * siempre esta disponible): es una guia visual, igual que en Cotizador Niuro
 * y en el repo original propuestas-niuro (pre-send-checklist.ts).
 *
 * severity 'error' = falta algo que rompe la propuesta (ej. sin contenido
 * generado). 'warn' = falta algo recomendable (pricing, campos pendientes).
 * 'info' = dato opcional que podria completarse.
 */
import type { SerializedProposal } from "@/lib/proposals";

export interface ChecklistItem {
  id: string;
  label: string;
  severity: "error" | "warn" | "info";
  done: boolean;
}

const PENDING_MARKER = /pendiente por confirmar/i;

function hasPendingMarker(value: unknown): boolean {
  if (typeof value === "string") return PENDING_MARKER.test(value);
  if (Array.isArray(value)) return value.some(hasPendingMarker);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasPendingMarker);
  }
  return false;
}

function hasPricing(p: SerializedProposal): boolean {
  if (!p.pricing) return false;
  const pr = p.pricing as Record<string, unknown>;
  if (p.mode === "sprint") return typeof pr.total === "number" && pr.total > 0;
  return typeof pr.monthlyMin === "number" && pr.monthlyMin > 0;
}

export function buildProposalChecklist(p: SerializedProposal): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  items.push({
    id: "generated",
    label: "Contenido generado por la IA",
    severity: "error",
    done: !!p.generated && p.genStatus !== "generating" && p.genStatus !== "error",
  });

  items.push({
    id: "summary",
    label: "Resumen ejecutivo completo",
    severity: "warn",
    done: !!p.summary && p.summary.trim().length > 0,
  });

  items.push({
    id: "pricing",
    label: p.mode === "sprint" ? "Precio del sprint cargado" : "Inversion mensual cargada",
    severity: "warn",
    done: hasPricing(p),
  });

  items.push({
    id: "context",
    label: "Contexto del cliente completo",
    severity: "warn",
    done: !!p.context?.paragraph && p.context.paragraph.trim().length > 0,
  });

  items.push({
    id: "cards",
    label: "Objetivos, alcance y gobernanza sin secciones vacias",
    severity: "warn",
    done:
      (p.cards?.objective?.length ?? 0) > 0 &&
      (p.cards?.scope?.length ?? 0) > 0 &&
      (p.cards?.governance?.length ?? 0) > 0,
  });

  items.push({
    id: "roadmap",
    label: "Roadmap con tramos definidos",
    severity: "warn",
    done: (p.roadmap?.length ?? 0) > 0,
  });

  items.push({
    id: "team",
    label: "Equipo propuesto definido",
    severity: "warn",
    done: (p.team?.length ?? 0) > 0,
  });

  items.push({
    id: "no-pending",
    label: "Sin campos marcados como \"Pendiente por confirmar\"",
    severity: "warn",
    done: !hasPendingMarker({
      client: p.client,
      summary: p.summary,
      context: p.context,
      cards: p.cards,
      roadmap: p.roadmap,
      team: p.team,
      risks: p.risks,
    }),
  });

  items.push({
    id: "contact",
    label: "Contacto del CRM vinculado (opcional)",
    severity: "info",
    done: !!p.contactId,
  });

  return items;
}
