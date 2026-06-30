import { STAGES } from "@/lib/crm-ui";
import type { RecordConfig, SelectOption } from "../types";

const STAGE_OPTIONS: SelectOption[] = STAGES.map((s) => ({ value: s, label: s }));

const TEMP_OPTIONS: SelectOption[] = [
  { value: "hot", label: "Caliente" },
  { value: "warm", label: "Tibio" },
  { value: "cold", label: "Frio" },
];

/** Config del objeto Contactos (Directorio) para el sistema record-view. */
export const contactsConfig: RecordConfig = {
  object: "contacts",
  title: "Directorio",
  singular: "contacto",
  listEndpoint: "/api/contacts",
  updateEndpoint: (id) => `/api/contacts/${id}`,
  updateMethod: "PUT",
  deleteEndpoint: (id) => `/api/contacts/${id}`,
  mergeEndpoint: "/api/contacts/merge",
  hasActivity: true,
  hasNotes: true,
  hasTasks: true,
  hasFiles: true,
  detailHref: (id) => `/contacts/${id}`,
  searchKeys: ["name", "company", "email"],
  archivable: true,
  softDelete: true,
  boardGroupKey: "stage",
  boardGroups: STAGE_OPTIONS,
  calendarDateKey: "nextStepDue",
  // Capa relacional: el GET /api/contacts/[id] devuelve deals y proposals.
  relatedSections: [
    {
      label: "Deals",
      dataKey: "deals",
      titleKey: "title",
      subtitleKey: "value",
      href: (it) => `/deals/${it.id}`,
    },
    {
      label: "Propuestas",
      dataKey: "proposals",
      titleKey: "clientName",
      subtitleKey: "role",
      href: (it) => `/proposals/${it.id}`,
    },
  ],
  columns: [
    { key: "name", label: "Contacto", type: "text", primary: true, width: 240 },
    { key: "score", label: "Score", type: "score", editable: true, width: 90 },
    { key: "stage", label: "Etapa", type: "stage", editable: true, options: STAGE_OPTIONS, width: 140 },
    { key: "temperature", label: "Temp", type: "temperature", editable: true, options: TEMP_OPTIONS, width: 120 },
    { key: "company", label: "Empresa", type: "text", editable: true, width: 180 },
    { key: "nextAction", label: "Proximo paso", type: "text", editable: true, width: 220 },
    { key: "email", label: "Email", type: "email", editable: true, width: 200 },
    { key: "country", label: "Pais", type: "text", editable: true, width: 90 },
    { key: "lastInteractionAt", label: "Ultima interaccion", type: "date", width: 150 },
    { key: "archived", label: "Archivado", type: "boolean", editable: true, detailOnly: true },
  ],
};
