"use client";

import { useEffect, useState } from "react";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";

// Pipeline de clientes (contact_type='client'): el ciclo post-venta. Etapas en
// la DB (pipeline='clientes', editables en Ajustes). Un contacto se convierte
// en cliente editándolo (tipo de contacto) o vía API.
type Stage = { id: string; name: string; color: string; order: number };

const EMPTY_HINT: Record<string, string> = {
  Onboarding: "Cuando ganes un negocio, convertí el contacto en cliente y arranca acá.",
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

  const names = stages.map((s) => s.name);
  const cfg = Object.fromEntries(
    stages.map((s, i) => [
      s.name,
      {
        text: s.color,
        bg: "rgba(148,163,184,0.12)",
        order: i,
        task: `Avanzar en ${s.name}`,
        sla: "",
        dueInDays: 2,
        probability: 10,
      },
    ])
  );

  return (
    <PipelineBoard
      stages={names}
      stageCfg={cfg}
      emptyHints={EMPTY_HINT}
      title="Clientes"
      subtitle="El ciclo post-venta: onboarding, expansión y retención"
      typeFilter="client"
      showMoney
    />
  );
}
