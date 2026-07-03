/**
 * Sistema de "record view" estilo Twenty: cualquier tabla de la DB se muestra
 * como tabla densa con edición inline + kanban + panel de detalle, manejado por
 * una config declarativa por objeto. Esto evita reescribir cada pantalla a mano.
 */
import type React from "react";

export type FieldType =
  | "text"
  | "number"
  | "currency" // se guarda en centavos (valueCents)
  | "amount" // moneda en unidades enteras (deals.value)
  | "score" // 0-100 con punto de temperatura
  | "select" // dropdown de opciones (source, channel...)
  | "status" // chip de color desde options (value -> label+color); para etapas FK / estados
  | "stage" // pill de etapa del pipeline Niuro por nombre (STAGE_CFG)
  | "temperature" // hot/warm/cold
  | "date" // solo lectura, formateado
  | "tags" // JSON array de strings
  | "longtext" // texto largo: bloque con copiar (display) / textarea (edit)
  | "link" // URL clickeable
  | "email" // email con mailto:
  | "relation" // registro vinculado (FK): chip clickeable que navega a su detalle; editable = picker de búsqueda
  | "boolean" // sí/no (ej. archivado)
  | "rating" // 0-5 estrellas
  | "multi_select" // varias opciones de col.options -> chips (JSON array de values)
  | "links" // lista de URLs (JSON array de strings)
  | "address" // {street,city,region,zip,country} (JSON object)
  | "full_name"; // {first,last} (JSON object)
  // morph_relation: NO implementado. Relación polimórfica (target variable por fila):
  // complejo (resolver tipo+id+label por fila, picker multi-objeto) y de bajo valor
  // para 1 operador. Agregar si aparece un caso real.

/** Config de un campo 'relation': de dónde sacar el label y a dónde navega. */
export interface RelationConfig {
  /** key del registro actual que guarda el id vinculado (FK). default = col.key */
  idKey?: string;
  /** key del registro actual que guarda el label legible (ej. contactName). */
  labelKey?: string;
  /** href al detalle del registro vinculado, a partir del id. */
  href: (id: string) => string;
  /** endpoint de búsqueda para el picker (editable). Devuelve [{id,label}]. */
  searchEndpoint?: string;
  /** mapea una fila del searchEndpoint a una opción {id,label}. */
  searchMap?: (raw: Record<string, unknown>) => { id: string; label: string };
}

/** Sección "Relacionados" del panel de detalle: lista registros vinculados via FK. */
export interface RelatedSection {
  /** título de la sección (ej. "Deals", "Propuestas"). */
  label: string;
  /** key dentro del GET de detalle que contiene el array de registros relacionados. */
  dataKey: string;
  /** key del item a mostrar como título. */
  titleKey: string;
  /** key opcional del item a mostrar como subtítulo. */
  subtitleKey?: string;
  /** href al detalle de cada item. */
  href: (item: RecordRow) => string;
}

export interface SelectOption {
  value: string;
  label: string;
  /** color opcional (hex o var()) para chips */
  color?: string;
}

export interface ColumnDef {
  key: string;
  label: string;
  type: FieldType;
  /** ancho de columna en px (tabla) */
  width?: number;
  editable?: boolean;
  /** opciones para select/stage/temperature */
  options?: SelectOption[];
  /** columna título sticky (avatar + nombre) */
  primary?: boolean;
  sortable?: boolean;
  /** solo en el panel de detalle, no en la tabla (campos largos: notas, reply IA) */
  detailOnly?: boolean;
  /** config del campo 'relation' (FK clickeable + picker). */
  relationConfig?: RelationConfig;
}

export type RecordRow = Record<string, unknown> & { id: string };

export interface RecordConfig {
  object: string; // "contacts"
  title: string; // "Directorio"
  singular: string; // "contacto"
  listEndpoint: string; // "/api/contacts"
  /** método y url para actualizar un registro (edición inline / drag) */
  updateEndpoint: (id: string) => string;
  updateMethod?: "PUT" | "PATCH";
  /** url para borrar un registro (DELETE). Solo si se define se muestra "Borrar" en bulk. */
  deleteEndpoint?: (id: string) => string;
  /** endpoint de fusión de duplicados (POST {survivorId, loserId, fields}). Si se
   *  define, seleccionar EXACTAMENTE 2 filas habilita "Fusionar" en la barra. */
  mergeEndpoint?: string;
  columns: ColumnDef[];
  /** key de un campo fecha: si está, habilita la vista Calendario (registros ubicados
   *  en el día de ese campo). El color de la tarjeta sale de boardGroupKey si aplica. */
  calendarDateKey?: string;
  /** campo por el que se agrupa el kanban (debe ser type stage/select/status) */
  boardGroupKey?: string;
  boardGroups?: SelectOption[];
  /** opciones/grupos dinámicos: endpoint que devuelve filas a mapear con boardGroupsMap.
   *  Inyecta las opciones tanto en boardGroups como en la columna boardGroupKey. */
  boardGroupsEndpoint?: string;
  boardGroupsMap?: (raw: Record<string, unknown>) => SelectOption;
  /** ¿el primary es una persona (avatar con iniciales)? default true */
  hasAvatar?: boolean;
  /** campo usado como subtítulo bajo el título primary (ej. company, contactName) */
  subtitleKey?: string;
  /** keys de columnas a mostrar en el pie de la card del kanban */
  cardFields?: string[];
  /** ¿el GET de detalle (listEndpoint/[id]) devuelve activities para el timeline? default false */
  hasActivity?: boolean;
  /** ¿mostrar el tab "Actividad" leyendo el timeline de auditoría genérico
   *  (GET /api/timeline?objectName&recordId)? Vale para cualquier objeto cuyos
   *  PUT/DELETE llamen logActivity(). default false. */
  hasTimeline?: boolean;
  /** tabs extra en el panel de detalle, contra /api/notes, /api/tasks, /api/attachments
   *  con targetType = object y targetId = row.id. tasks usa contactId (solo contacts). */
  hasNotes?: boolean;
  hasTasks?: boolean;
  hasFiles?: boolean;
  /** href a la ficha completa (página dedicada), si existe */
  detailHref?: (id: string) => string;
  searchKeys: string[];
  /** secciones "Relacionados" del panel de detalle (deals de un contacto, etc.).
   *  Leen del GET de detalle (listEndpoint/[id]); requiere que ese GET las devuelva. */
  relatedSections?: RelatedSection[];
  /** muestra un toggle "Archivados" que agrega ?includeArchived=1 al listEndpoint
   *  (el backend filtra archived=false por defecto). */
  archivable?: boolean;
  /** habilita la papelera (soft delete): toggle "Papelera" que agrega ?deleted=1
   *  al listEndpoint y, en esa vista, acciones de fila Restaurar / Borrar
   *  definitivo. Requiere deleteEndpoint (el DELETE soft-deletea; ?hard=1 purga) y
   *  que el PUT acepte { deletedAt: null } para restaurar. */
  softDelete?: boolean;
  /** acciones de fila: botón en la tabla y en el panel de detalle. href navega
   *  (ej. deep-link a /whatsapp); devuelve null para ocultar la acción en esa fila. */
  rowActions?: RowAction[];
  /** filtros activos al abrir la vista (el usuario puede quitarlos desde la barra).
   *  Ej: ocultar descartadas por defecto en el Radar. */
  defaultFilters?: import("./filters").Filter[];
}

export interface RowAction {
  label: string;
  /** ícono opcional de lucide-react (componente) */
  icon?: React.ComponentType<{ className?: string }>;
  /** destino de navegación; null/undefined => no se muestra para esa fila.
   *  Si se define onClick, href se ignora y la acción es un botón (mutación). */
  href?: (row: RecordRow) => string | null;
  /** acción de mutación (POST/PATCH). RecordIndex recarga la lista al resolver. */
  onClick?: (row: RecordRow) => Promise<unknown>;
  /** si devuelve false, la acción no se muestra para esa fila. */
  show?: (row: RecordRow) => boolean;
}
