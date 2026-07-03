"use client";

import { useEffect, useState } from "react";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";

// Pipeline de clientes (contact_type='client'): el ciclo post-venta. Etapas en
// la DB (pipeline='clientes', editables en Ajustes). Un contacto se convierte
// en cliente editándolo (tipo de contacto) o vía API.
type Stage = { id: string; name: string; color: string; order: number };

const EMPTY_HINT: Record<string, string> = {
  Onboarding: "Al mover un lead a Cierre te ofrece convertirlo en cliente y arranca acá. También desde su ficha: 'Convertir en cliente'.",
  Activo: "Clientes con ingenieros colocados y facturando.",
  Expansion: "Clientes con señales de necesitar más gente.",
  "En riesgo": "Clientes con señales de churn: atenderlos antes de que se enfríen.",
};

export default function ClientsPage() {
  const [stages, setStages] = useState<Stage[] | null>(null);

  useEffect(() => {
    fetch("/api/pipeline/stages?pipeline=clientes")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Stage[]) => setStages(Array.isArray(d) ? d : []))
      .catch(() => setStages([]));
  }, []);

  if (!stages) return null;

  return (
    <PipelineBoard
      stages={stages}
      emptyHints={EMPTY_HINT}
      title="Clientes"
      subtitle="El ciclo post-venta: onboarding, expansión y retención"
      typeFilter="client"
      showMoney
      variant="client"
    />
  );
}
