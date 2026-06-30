"use client";

import { RecordIndex } from "@/components/record/RecordIndex";
import { contactsConfig } from "@/components/record/configs/contacts";

// Directorio como "record view" estilo Twenty: tabla densa con edición inline,
// kanban por etapa y panel de detalle con timeline. El backend (/api/contacts)
// no cambia. (Vista de archivados: pendiente, vuelve con el sistema de filtros.)
export default function DirectorioPage() {
  return <RecordIndex config={contactsConfig} />;
}
