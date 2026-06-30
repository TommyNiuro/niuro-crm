import type { RecordConfig, SelectOption } from "../types";

/** Config del objeto Propuestas para el record-view.
 *  Tabla + kanban por status. El alta (Nueva propuesta) y el editor [id] viven
 *  fuera de este sistema y NO se tocan: el record-view solo lista y edita inline.
 *  'clientName' lo deriva el GET /api/proposals desde el JSON 'client'. */

// Estados de propuesta con su color de marca (espejo de STATUS_META en
// components/proposals/status.ts). Sirven de options del chip status y de
// grupos del kanban.
const STATUS_OPTIONS: SelectOption[] = [
  { value: "draft", label: "Borrador", color: "#6B7280" },
  { value: "sent", label: "Enviada", color: "#3B5FE5" },
  { value: "in-review", label: "En revision", color: "#D4940A" },
  { value: "negotiation", label: "Negociacion", color: "#B8870E" },
  { value: "signed", label: "Firmada", color: "#16A34A" },
  { value: "lost", label: "Perdida", color: "#DC2626" },
  { value: "archived", label: "Archivada", color: "#94989F" },
];

const MODE_OPTIONS: SelectOption[] = [
  { value: "staff-aug", label: "Staff Augmentation", color: "#D4940A" },
  { value: "sprint", label: "Project Sprint", color: "#3B5FE5" },
];

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: "high", label: "Alta", color: "#DC2626" },
  { value: "medium", label: "Media", color: "#D4940A" },
  { value: "low", label: "Baja", color: "#6B7280" },
];

export const proposalsConfig: RecordConfig = {
  object: "proposals",
  title: "Propuestas",
  singular: "propuesta",
  listEndpoint: "/api/proposals",
  updateEndpoint: (id) => `/api/proposals/${id}`,
  updateMethod: "PUT",
  detailHref: (id) => `/proposals/${id}`,
  searchKeys: ["clientName", "role", "duration"],
  hasAvatar: false,
  subtitleKey: "role",
  boardGroupKey: "status",
  boardGroups: STATUS_OPTIONS,
  cardFields: ["mode", "priority"],
  columns: [
    { key: "clientName", label: "Cliente", type: "text", primary: true, width: 240 },
    { key: "status", label: "Estado", type: "status", editable: true, options: STATUS_OPTIONS, width: 140 },
    { key: "mode", label: "Modo", type: "status", editable: true, options: MODE_OPTIONS, width: 170 },
    { key: "priority", label: "Prioridad", type: "status", editable: true, options: PRIORITY_OPTIONS, width: 120 },
    { key: "role", label: "Rol", type: "text", width: 180 },
    { key: "duration", label: "Duracion", type: "text", width: 130 },
    { key: "date", label: "Fecha", type: "text", width: 130 },
    { key: "createdAt", label: "Creada", type: "date", width: 130 },
  ],
};
