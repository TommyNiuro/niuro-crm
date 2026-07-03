import { MessageCircle } from "lucide-react";
import type { RecordConfig, SelectOption } from "../types";

const STATUS_OPTIONS: SelectOption[] = [
  { value: "new", label: "Nueva", color: "#2f54eb" },
  { value: "contacted", label: "Contactada", color: "#0a8a5f" },
  { value: "discarded", label: "Descartada", color: "#8a8a8a" },
];

const SOURCE_OPTIONS: SelectOption[] = [
  { value: "whatsapp", label: "WhatsApp", color: "#1a9e4b" },
  { value: "getonboard", label: "GetOnBoard", color: "#0e7490" },
];

const URGENCY_OPTIONS: SelectOption[] = [
  { value: "alta", label: "Alta", color: "#d4351c" },
  { value: "media", label: "Media", color: "#b54708" },
  { value: "baja", label: "Baja", color: "#8a8a8a" },
];

/** Radar de grupos (group_opportunities). Solo el estado es editable (PATCH /api/opportunities/[id]).
 *  Kanban por estado (Nueva/Contactada/Descartada). La respuesta IA, summary y excerpt van en el
 *  panel de detalle como longtext (con copiar). */
export const opportunitiesConfig: RecordConfig = {
  object: "opportunities",
  title: "Radar de grupos",
  singular: "oportunidad",
  listEndpoint: "/api/opportunities",
  updateEndpoint: (id) => `/api/opportunities/${id}`,
  updateMethod: "PATCH",
  hasTimeline: true,
  searchKeys: ["role", "company", "sender", "groupName", "stack", "summary"],
  hasAvatar: false,
  subtitleKey: "company",
  // Responder: deep-link a /whatsapp con el chat, el mensaje original y la respuesta
  // sugerida como draft. Solo para fuente whatsapp con chatJid (getonboard no tiene chat).
  // El radar son chats de GRUPO (@g.us): el composer del grupo no precarga el draft (no se
  // spamea al grupo). Por eso pasamos ?msg=<messageId>: el inbox resalta ese mensaje y muestra
  // "Hablarle directo", que lleva el draft al 1-a-1 con el autor. Sin ?msg el draft se pierde.
  rowActions: [
    {
      label: "Responder",
      icon: MessageCircle,
      href: (row) => {
        const jid = row.chatJid;
        if (row.source !== "whatsapp" || typeof jid !== "string" || !jid) return null;
        const msg = typeof row.messageId === "string" ? row.messageId : "";
        const draft = typeof row.suggestedReply === "string" ? row.suggestedReply : "";
        return `/whatsapp?chat=${encodeURIComponent(jid)}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}${draft ? `&draft=${encodeURIComponent(draft)}` : ""}`;
      },
    },
  ],
  // Los filtros por estado los pone la página (pestañas Nuevas/Contactadas/
  // Descartadas); acá solo la forma de la tabla. Triage: las columnas visibles
  // son las que deciden (rol, score, empresa, fuente, stack, antigüedad); el
  // resto vive en el panel de detalle (Fase 5 auditoría 2026-07-02).
  boardGroupKey: "status",
  boardGroups: STATUS_OPTIONS,
  cardFields: ["company", "score"],
  columns: [
    { key: "role", label: "Rol / Oportunidad", type: "text", primary: true, width: 280 },
    { key: "score", label: "Score", type: "number", width: 80 },
    { key: "company", label: "Empresa", type: "text", width: 160 },
    { key: "source", label: "Fuente", type: "status", options: SOURCE_OPTIONS, width: 120 },
    { key: "seniority", label: "Seniority", type: "text", width: 110 },
    { key: "stack", label: "Stack", type: "text", width: 180 },
    { key: "messageAt", label: "Detectado", type: "date", width: 130 },
    { key: "status", label: "Estado", type: "status", editable: true, options: STATUS_OPTIONS, detailOnly: true },
    { key: "urgency", label: "Urgencia", type: "status", options: URGENCY_OPTIONS, detailOnly: true },
    { key: "groupName", label: "Grupo / Fuente", type: "text", detailOnly: true },
    { key: "summary", label: "Resumen IA", type: "longtext", detailOnly: true },
    { key: "suggestedReply", label: "Respuesta sugerida (IA)", type: "longtext", detailOnly: true },
    { key: "excerpt", label: "Mensaje original", type: "longtext", detailOnly: true },
    { key: "url", label: "Aviso", type: "link", detailOnly: true },
  ],
};
