"use client";

/**
 * Los tres pipelines del negocio, cada uno con su editor completo:
 *  - Prospectos: el funnel de venta (contactos tipo lead)
 *  - Clientes: el ciclo post-venta (contactos tipo client)
 *  - Ingenieros: el pool de talento (contactos tipo engineer)
 * Renombrar/reordenar/borrar propaga solo dentro del pipeline correspondiente.
 */
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StageEditor } from "@/components/settings/StageEditor";

const PIPELINES = [
  {
    key: "prospectos",
    title: "Prospectos (ventas)",
    description: "El funnel de venta. Es el kanban de Pipeline y el embudo del Inicio y Analítica.",
  },
  {
    key: "clientes",
    title: "Clientes",
    description: "El ciclo de vida post-venta: onboarding, expansión, riesgo. Kanban en la sección Clientes.",
  },
  {
    key: "ingenieros",
    title: "Ingenieros",
    description: "El pool de talento que vas contactando. Kanban en la sección Ingenieros.",
  },
];

export default function PipelinesSettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Pipelines</h2>
        <p className="text-sm text-muted-foreground">
          Tres pipelines, cada uno con sus etapas. Renombrar propaga a los contactos y tareas de ese
          pipeline; reordenar mueve las columnas de su kanban; borrar pide que la etapa esté vacía.
        </p>
      </div>
      {PIPELINES.map((p) => (
        <Card key={p.key}>
          <CardHeader>
            <CardTitle className="text-base">{p.title}</CardTitle>
            <CardDescription>{p.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <StageEditor pipeline={p.key} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
