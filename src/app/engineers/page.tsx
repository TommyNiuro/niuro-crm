"use client";

import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { ENGINEER_STAGES, ENGINEER_STAGE_CFG, ENGINEER_EMPTY_HINT } from "@/lib/crm-ui";

// Pipeline de ingenieros (contact_type='engineer'): separado del de ventas.
export default function EngineersPage() {
  return (
    <PipelineBoard
      stages={ENGINEER_STAGES}
      stageCfg={ENGINEER_STAGE_CFG}
      emptyHints={ENGINEER_EMPTY_HINT}
      title="Pipeline de Ingenieros"
      subtitle="Ingenieros que vas contactando para el pool"
      typeFilter="engineer"
      showMoney={false}
    />
  );
}
