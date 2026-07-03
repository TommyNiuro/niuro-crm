"use client";

import { useEffect, useState } from "react";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { STAGE_CFG } from "@/lib/crm-ui";

// Las etapas salen de la DB (editables en Ajustes). STAGE_CFG aporta la config
// visual/operativa de las conocidas; las renombradas/creadas usan defaults.
const EMPTY_HINT: Record<string, string> = {
  Prospecto:   "Aprueba leads calientes y van a entrar acá.",
  Discovery:   "Llega cuando hagas el primer contacto.",
  Propuesta:   "Llega cuando registres el dolor y el BANT.",
  Perfil:      "Llega cuando envíes una propuesta.",
  Entrevistas: "Llega cuando envíes los primeros perfiles.",
  Cierre:      "Llega cuando avances una entrevista.",
  Expansion:   "Cuentas ganadas para perseguir upsell.",
  Perdidos:    "Contactos descartados o que no avanzaron.",
};

type Stage = { id: string; name: string; color: string; order: number };

export default function PipelinePage() {
  const [stages, setStages] = useState<Stage[] | null>(null);

  useEffect(() => {
    fetch("/api/pipeline/stages")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Stage[]) => setStages(Array.isArray(d) && d.length ? d : []))
      .catch(() => setStages([]));
  }, []);

  if (!stages) return null; // un frame, evita el flash de kanban vacío

  const names = stages.map((s) => s.name);
  const cfg = Object.fromEntries(
    stages.map((s, i) => [
      s.name,
      STAGE_CFG[s.name] ?? {
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
      title="Pipeline de Ventas"
      subtitle="Arrastra los contactos entre etapas"
      typeFilter="lead"
      showMoney
    />
  );
}
