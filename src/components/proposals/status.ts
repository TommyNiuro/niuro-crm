/* Meta de presentacion para estados y modos de propuesta.
 * Colores hex de marca Niuro (status semantico), usados como inline style en
 * badges del listado y la ficha, mismo patron que ImageLeadCard.
 */
import type { ProposalStatus, ProposalMode } from "@/types";

export const PROPOSAL_STATUSES: ProposalStatus[] = [
  "draft",
  "sent",
  "in-review",
  "negotiation",
  "signed",
  "lost",
  "archived",
];

interface StatusMeta {
  label: string;
  /** Color de acento (texto + fondo translucido). */
  color: string;
}

const STATUS_META: Record<ProposalStatus, StatusMeta> = {
  draft: { label: "Borrador", color: "#6B7280" },
  sent: { label: "Enviada", color: "#3B5FE5" },
  "in-review": { label: "En revision", color: "#D4940A" },
  negotiation: { label: "Negociacion", color: "#B8870E" },
  signed: { label: "Firmada", color: "#16A34A" },
  lost: { label: "Perdida", color: "#DC2626" },
  archived: { label: "Archivada", color: "#94989F" },
};

export function statusMeta(status: string | null | undefined): StatusMeta {
  if (status && status in STATUS_META) {
    return STATUS_META[status as ProposalStatus];
  }
  return STATUS_META.draft;
}

export function modeLabel(mode: string | null | undefined): string {
  return mode === "sprint" ? "Project Sprint" : "Staff Augmentation";
}

/** Color de acento del modo: gold para staff-aug, cobalt para sprint. */
export function modeColor(mode: string | null | undefined): string {
  return mode === "sprint" ? "#3B5FE5" : "#D4940A";
}

export function isSprint(mode: string | null | undefined): mode is "sprint" {
  return mode === "sprint";
}

export type { ProposalMode };
