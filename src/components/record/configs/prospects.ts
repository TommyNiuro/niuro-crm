import type { RecordConfig, RecordRow } from "../types";
import { Sparkles, UserSearch, ArrowRightCircle, X } from "lucide-react";
import { toast } from "sonner";

/** Config de Prospección para el record-view. La unidad es la EMPRESA que está
 *  contratando talento tech (alimentada por scan-prospects.ts a diario).
 *  Acciones: enriquecer con Apollo, generar mensajes IA, pasar al pipeline. */

const act = (id: string, action: string) =>
  fetch(`/api/prospects/${id}/${action}`, { method: "POST" }).then(async (r) => {
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || "No se pudo completar la acción");
    }
  });

const discard = (id: string) =>
  fetch(`/api/prospects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "discarded" }),
  }).then((r) => {
    if (!r.ok) throw new Error("No se pudo descartar");
  });

const STATUS_OPTIONS = [
  { value: "new", label: "Nueva", color: "#3B5FE5" },
  { value: "enriched", label: "Enriquecida", color: "#06b6d4" },
  { value: "contacted", label: "Contactada", color: "#D4940A" },
  { value: "conversation", label: "En conversación", color: "#16A34A" },
  { value: "discarded", label: "Descartada", color: "#64748b" },
];

const URGENCY_OPTIONS = [
  { value: "alta", label: "Alta", color: "#DC2626" },
  { value: "media", label: "Media", color: "#D4940A" },
  { value: "baja", label: "Baja", color: "#64748b" },
];

export const prospectsConfig: RecordConfig = {
  object: "prospects",
  title: "Prospección",
  singular: "prospecto",
  listEndpoint: "/api/prospects",
  updateEndpoint: (id) => `/api/prospects/${id}`,
  updateMethod: "PUT",
  deleteEndpoint: (id) => `/api/prospects/${id}`,
  searchKeys: ["company", "roles", "stack", "contactName"],
  hasAvatar: false,
  subtitleKey: "contactName",
  boardGroupKey: "status",
  boardGroups: STATUS_OPTIONS,
  columns: [
    { key: "company", label: "Empresa", type: "text", primary: true, width: 200 },
    { key: "score", label: "Score", type: "score", width: 110, sortable: true },
    { key: "urgency", label: "Urgencia", type: "status", options: URGENCY_OPTIONS, width: 110, editable: true },
    { key: "status", label: "Estado", type: "status", options: STATUS_OPTIONS, width: 140, editable: true },
    { key: "jobCount", label: "Vacantes", type: "number", width: 90, sortable: true },
    { key: "daysOpen", label: "Días abierta", type: "number", width: 110, sortable: true },
    { key: "isOpen", label: "Sigue abierta", type: "boolean", width: 110 },
    { key: "roles", label: "Buscando", type: "tags", width: 240 },
    { key: "stack", label: "Stack", type: "tags", width: 200 },
    { key: "contactName", label: "Contacto", type: "text", width: 160, editable: true },
    { key: "contactTitle", label: "Cargo", type: "text", width: 160, editable: true },
    { key: "contactEmail", label: "Email", type: "email", width: 200, editable: true },
    { key: "contactPhone", label: "Teléfono", type: "text", width: 140, editable: true },
    { key: "contactLinkedin", label: "LinkedIn", type: "link", width: 160, editable: true },
    { key: "sources", label: "Fuentes", type: "tags", width: 140 },
    { key: "url", label: "Aviso", type: "link", width: 160 },
    { key: "countries", label: "Países", type: "tags", detailOnly: true },
    { key: "seniority", label: "Seniority", type: "text", detailOnly: true },
    { key: "msgConnect", label: "Mensaje de conexión", type: "longtext", detailOnly: true, editable: true },
    { key: "msgPitch", label: "Mensaje de oferta", type: "longtext", detailOnly: true, editable: true },
    { key: "lastSeenAt", label: "Visto por última vez", type: "date", detailOnly: true },
    { key: "createdAt", label: "Detectada", type: "date", width: 120, sortable: true },
  ],
  rowActions: [
    {
      label: "Enriquecer (Apollo)",
      icon: UserSearch,
      onClick: (row: RecordRow) =>
        act(row.id, "enrich")
          .then(() => toast.success(`Contacto encontrado en ${row.company as string}`))
          .catch((e) => {
            toast.error(e instanceof Error ? e.message : "Apollo falló");
            throw e;
          }),
      show: (row) => row.status !== "discarded",
    },
    {
      label: "Generar mensajes IA",
      icon: Sparkles,
      onClick: (row: RecordRow) =>
        act(row.id, "messages")
          .then(() => toast.success("Mensajes generados: abrí el detalle para verlos"))
          .catch((e) => {
            toast.error(e instanceof Error ? e.message : "La IA falló");
            throw e;
          }),
      show: (row) => row.status !== "discarded",
    },
    {
      label: "Pasar al Pipeline",
      icon: ArrowRightCircle,
      onClick: (row: RecordRow) =>
        act(row.id, "convert").then(() => toast.success(`${row.company as string} ahora es lead del pipeline`)),
      show: (row) => row.status !== "discarded" && !row.knownContactId,
    },
    {
      label: "Descartar",
      icon: X,
      onClick: (row: RecordRow) => discard(row.id),
      show: (row) => row.status !== "discarded",
    },
  ],
  defaultFilters: [{ id: "no-discarded", key: "status", op: "isNot", value: "discarded" }],
};
