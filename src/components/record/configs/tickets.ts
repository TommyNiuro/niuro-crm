import type { RecordConfig, SelectOption } from "../types";

/** Config del objeto Tickets de soporte para el record-view.
 *  Tabla + kanban por status. El status es editable inline y por drag en el
 *  kanban (PATCH /api/tickets con {id,status}). El alta usa POST /api/tickets. */

const STATUS_OPTIONS: SelectOption[] = [
  { value: "open", label: "Abierto", color: "var(--destructive)" },
  { value: "pending", label: "Pendiente", color: "var(--warning)" },
  { value: "resolved", label: "Resuelto", color: "var(--primary)" },
];

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: "high", label: "Alta", color: "#DC2626" },
  { value: "medium", label: "Media", color: "#D4940A" },
  { value: "low", label: "Baja", color: "#6B7280" },
];

export const ticketsConfig: RecordConfig = {
  object: "tickets",
  title: "Tickets de Soporte",
  singular: "ticket",
  listEndpoint: "/api/tickets",
  // PATCH /api/tickets recibe {id, status} en el body (no /[id]); como updateEndpoint
  // ignora el id en la URL, el record-view manda {id, [key]:value} y el backend
  // solo acepta status — el único campo editable de la config.
  updateEndpoint: () => "/api/tickets",
  updateMethod: "PATCH",
  searchKeys: ["code", "subject"],
  hasAvatar: false,
  subtitleKey: "priority",
  boardGroupKey: "status",
  boardGroups: STATUS_OPTIONS,
  cardFields: ["priority", "sla"],
  columns: [
    { key: "subject", label: "Asunto", type: "text", primary: true, width: 320 },
    { key: "code", label: "Codigo", type: "text", width: 130 },
    { key: "status", label: "Estado", type: "status", editable: true, options: STATUS_OPTIONS, width: 140 },
    { key: "priority", label: "Prioridad", type: "status", options: PRIORITY_OPTIONS, width: 120 },
    { key: "sla", label: "SLA", type: "text", width: 120 },
    { key: "createdAt", label: "Creado", type: "date", width: 140 },
  ],
};
