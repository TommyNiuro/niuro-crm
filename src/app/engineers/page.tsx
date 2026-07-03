"use client";

import { useEffect, useState } from "react";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { ENGINEER_STAGE_CFG, ENGINEER_EMPTY_HINT } from "@/lib/crm-ui";

// Pipeline de ingenieros (contact_type='engineer'). Las etapas salen de la DB
// (pipeline='ingenieros', editables en Ajustes); ENGINEER_STAGE_CFG aporta la
// config de las conocidas y las custom usan defaults.
type Stage = { id: string; name: string; color: string; order: number };

export default function EngineersPage() {
  const [stages, setStages] = useState<Stage[] | null>(null);

  useEffect(() => {
    fetch("/api/pipeline/stages?pipeline=ingenieros")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Stage[]) => setStages(Array.isArray(d) ? d : []))
      .catch(() => setStages([]));
  }, []);

  if (!stages) return null;

  // Overrides del playbook para las etapas conocidas; las custom derivan su
  // estilo del color de la DB dentro del board.
  const cfg = Object.fromEntries(
    stages.filter((s) => ENGINEER_STAGE_CFG[s.name]).map((s) => [s.name, ENGINEER_STAGE_CFG[s.name]])
  );

  return (
    <PipelineBoard
      stages={stages}
      stageCfg={cfg}
      emptyHints={ENGINEER_EMPTY_HINT}
      title="Pipeline de Ingenieros"
      subtitle="Ingenieros que vas contactando para el pool"
      typeFilter="engineer"
      showMoney={false}
    />
  );
}
