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
    fetch("/api/pipeline/stages?pipeline=prospectos")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Stage[]) => setStages(Array.isArray(d) && d.length ? d : []))
      .catch(() => setStages([]));
  }, []);

  if (!stages) return null; // un frame, evita el flash de kanban vacío

  // Overrides del playbook para las etapas conocidas; las renombradas/creadas
  // derivan su estilo del color de la DB dentro del board.
  const cfg = Object.fromEntries(
    stages.filter((s) => STAGE_CFG[s.name]).map((s) => [s.name, STAGE_CFG[s.name]])
  );

  return (
    <PipelineBoard
      stages={stages}
      stageCfg={cfg}
      emptyHints={EMPTY_HINT}
      title="Pipeline de Ventas"
      subtitle="Arrastra los contactos entre etapas"
      typeFilter="lead"
      showMoney
    />
  );
}
