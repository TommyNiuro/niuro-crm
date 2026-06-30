import type { RecordConfig, SelectOption } from "../types";

/** Config del objeto Deals para el record-view.
 *  Las etapas (stageId) son FK dinámico a pipeline_stages: se cargan de /api/pipeline. */
export const dealsConfig: RecordConfig = {
  object: "deals",
  title: "Deals",
  singular: "deal",
  listEndpoint: "/api/deals",
  updateEndpoint: (id) => `/api/deals/${id}`,
  updateMethod: "PUT",
  deleteEndpoint: (id) => `/api/deals/${id}`,
  softDelete: true,
  detailHref: (id) => `/deals/${id}`,
  hasNotes: true,
  hasFiles: true,
  hasTimeline: true,
  searchKeys: ["title", "contactName"],
  hasAvatar: false,
  subtitleKey: "contactName",
  calendarDateKey: "expectedClose",
  boardGroupKey: "stageId",
  boardGroupsEndpoint: "/api/pipeline",
  boardGroupsMap: (s): SelectOption => ({
    value: String(s.id),
    label: String(s.name ?? ""),
    color: (s.color as string) ?? undefined,
  }),
  cardFields: ["value", "probability"],
  // Capa relacional: el GET /api/deals/[id] devuelve contact y proposals.
  relatedSections: [
    {
      label: "Propuestas",
      dataKey: "proposals",
      titleKey: "clientName",
      subtitleKey: "role",
      href: (it) => `/proposals/${it.id}`,
    },
  ],
  columns: [
    { key: "title", label: "Deal", type: "text", primary: true, width: 240 },
    { key: "value", label: "Valor", type: "currency", editable: true, width: 120 },
    { key: "stageId", label: "Etapa", type: "status", editable: true, width: 150 },
    { key: "probability", label: "Prob %", type: "number", editable: true, width: 90 },
    // FK al contacto: chip clickeable (label = contactName que deriva el listEndpoint)
    // y picker editable que busca en /api/contacts.
    {
      key: "contactId",
      label: "Contacto",
      type: "relation",
      editable: true,
      width: 170,
      relationConfig: {
        labelKey: "contactName",
        href: (id) => `/contacts/${id}`,
        searchEndpoint: "/api/contacts",
        searchMap: (r) => ({ id: String(r.id), label: String(r.name ?? r.id) }),
      },
    },
    { key: "expectedClose", label: "Cierre estimado", type: "date", width: 150 },
  ],
};
