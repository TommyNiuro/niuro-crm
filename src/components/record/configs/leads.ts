import type { RecordConfig } from "../types";
import { Check, X } from "lucide-react";

/** Config de Leads calientes (candidatos de WhatsApp pendientes) para el
 *  record-view. Read-only: ningun campo es editable. Las acciones aprobar /
 *  descartar pegan a PATCH /api/whatsapp/candidates/[id] con {action}. */

// updateEndpoint es obligatorio en el tipo pero no se usa: no hay columnas
// editable. Apunta al PATCH por id por si acaso.
const candidateAction = (id: string, action: "approve" | "dismiss") =>
  fetch(`/api/whatsapp/candidates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  }).then((r) => {
    if (!r.ok) throw new Error("No se pudo completar la accion");
  });

export const leadsConfig: RecordConfig = {
  object: "whatsapp-candidates",
  title: "Leads calientes",
  singular: "lead",
  listEndpoint: "/api/whatsapp/candidates?status=pending",
  updateEndpoint: (id) => `/api/whatsapp/candidates/${id}`,
  updateMethod: "PATCH",
  searchKeys: ["name", "phone", "reason"],
  hasAvatar: true,
  subtitleKey: "phone",
  columns: [
    { key: "name", label: "Nombre", type: "text", primary: true, width: 220 },
    { key: "score", label: "Score", type: "score", width: 120 },
    { key: "temperature", label: "Temperatura", type: "temperature", width: 130 },
    { key: "phone", label: "Telefono", type: "text", width: 150 },
    { key: "nextAction", label: "Proxima accion", type: "text", width: 200 },
    { key: "reason", label: "Motivo", type: "longtext", width: 280 },
    { key: "breakdown", label: "Desglose", type: "longtext", detailOnly: true },
    { key: "lastMessageAt", label: "Ultimo mensaje", type: "date", width: 150 },
  ],
  rowActions: [
    { label: "Aprobar", icon: Check, onClick: (row) => candidateAction(row.id, "approve") },
    { label: "Descartar", icon: X, onClick: (row) => candidateAction(row.id, "dismiss") },
  ],
};
