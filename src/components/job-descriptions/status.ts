// Metadata de estados de una JD (label + color). draft|sent|archived.
import type { JobDescriptionStatus } from "@/types";

export const JOB_DESCRIPTION_STATUSES: JobDescriptionStatus[] = [
  "draft",
  "sent",
  "archived",
];

const META: Record<string, { label: string; color: string }> = {
  draft: { label: "Borrador", color: "#5B6478" },
  sent: { label: "Enviada", color: "#16A34A" },
  archived: { label: "Archivada", color: "#94989F" },
};

export function jdStatusMeta(status: string | null | undefined): {
  label: string;
  color: string;
} {
  return META[status ?? "draft"] ?? META.draft;
}
