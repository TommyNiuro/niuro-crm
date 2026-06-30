"use client";

import { RecordIndex } from "@/components/record/RecordIndex";
import { opportunitiesConfig } from "@/components/record/configs/opportunities";

// Radar de grupos como record-view estilo Twenty: tabla + kanban por estado
// (Nueva/Contactada/Descartada, drag para triagear) + panel de detalle con la
// respuesta sugerida por IA (copiar), resumen y mensaje original. El estado se
// guarda vía PATCH /api/opportunities/[id]. (Filtro por fuente: vuelve con el
// sistema de filtros; por ahora la fuente es columna + búsqueda.)
export default function RadarPage() {
  return <RecordIndex config={opportunitiesConfig} />;
}
