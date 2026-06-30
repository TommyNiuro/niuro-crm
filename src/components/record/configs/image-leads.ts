import type { RecordConfig } from "../types";
import { Check, X } from "lucide-react";

/** Config de Importar capturas (image-leads) para el record-view. Read-only:
 *  la extraccion es de la IA, no se edita inline. Aprobar crea un contacto
 *  (POST /api/image-leads/[id]/approve), descartar marca dismissed
 *  (POST /api/image-leads/[id]/dismiss). El upload vive en la pagina (onNew). */

const imageLeadAction = (id: string, action: "approve" | "dismiss") =>
  fetch(`/api/image-leads/${id}/${action}`, { method: "POST" }).then((r) => {
    if (!r.ok) throw new Error("No se pudo completar la accion");
  });

export const imageLeadsConfig: RecordConfig = {
  object: "image-leads",
  title: "Importar capturas",
  singular: "captura",
  listEndpoint: "/api/image-leads",
  // No hay update inline (read-only); apunta al DELETE/approve por id como placeholder.
  updateEndpoint: (id) => `/api/image-leads/${id}`,
  updateMethod: "PATCH",
  searchKeys: ["company", "role", "summary"],
  hasAvatar: false,
  subtitleKey: "role",
  columns: [
    { key: "company", label: "Empresa", type: "text", primary: true, width: 220 },
    { key: "score", label: "Score", type: "score", width: 120 },
    { key: "role", label: "Rol", type: "text", width: 180 },
    { key: "stack", label: "Stack", type: "tags", width: 220 },
    { key: "seniority", label: "Seniority", type: "text", width: 130 },
    { key: "contactEmail", label: "Email", type: "email", width: 200 },
    { key: "contactUrl", label: "Web", type: "link", width: 180 },
    { key: "summary", label: "Resumen IA", type: "longtext", width: 320 },
    { key: "whatTheyDo", label: "Que hacen", type: "longtext", detailOnly: true },
    { key: "createdAt", label: "Subida", type: "date", width: 140 },
  ],
  rowActions: [
    { label: "Aprobar", icon: Check, onClick: (row) => imageLeadAction(row.id, "approve") },
    { label: "Descartar", icon: X, onClick: (row) => imageLeadAction(row.id, "dismiss") },
  ],
};
