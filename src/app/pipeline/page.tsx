"use client";

import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { STAGES, STAGE_CFG } from "@/lib/crm-ui";

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

export default function PipelinePage() {
  return (
    <PipelineBoard
      stages={STAGES}
      stageCfg={STAGE_CFG}
      emptyHints={EMPTY_HINT}
      title="Pipeline de Ventas"
      subtitle="Arrastra los contactos entre etapas"
      typeFilter="lead"
      showMoney
    />
  );
}
