import type { RecordConfig } from "../types";

/** Config del objeto Empresas / Organizaciones para el sistema record-view. */
export const companiesConfig: RecordConfig = {
  object: "companies",
  title: "Empresas",
  singular: "empresa",
  listEndpoint: "/api/companies",
  updateEndpoint: (id) => `/api/companies/${id}`,
  updateMethod: "PUT",
  deleteEndpoint: (id) => `/api/companies/${id}`,
  hasNotes: true,
  hasFiles: true,
  hasTimeline: true,
  searchKeys: ["name", "domain", "industry", "country"],
  archivable: true,
  softDelete: true,
  subtitleKey: "domain",
  // El GET /api/companies/[id] devuelve contactos y deals derivados por nombre.
  relatedSections: [
    {
      label: "Contactos",
      dataKey: "contacts",
      titleKey: "name",
      subtitleKey: "stage",
      href: (it) => `/contacts/${it.id}`,
    },
    {
      label: "Deals",
      dataKey: "deals",
      titleKey: "title",
      subtitleKey: "value",
      href: (it) => `/deals/${it.id}`,
    },
  ],
  columns: [
    { key: "name", label: "Empresa", type: "text", primary: true, width: 240 },
    { key: "contactsCount", label: "Contactos", type: "number", width: 110 },
    { key: "industry", label: "Industria", type: "text", editable: true, width: 160 },
    { key: "size", label: "Tamano", type: "text", editable: true, width: 120 },
    { key: "country", label: "Pais", type: "text", editable: true, width: 90 },
    { key: "domain", label: "Web", type: "link", editable: true, width: 180 },
    { key: "linkedin", label: "LinkedIn", type: "link", editable: true, width: 160 },
    { key: "archived", label: "Archivado", type: "boolean", editable: true, detailOnly: true },
  ],
};
