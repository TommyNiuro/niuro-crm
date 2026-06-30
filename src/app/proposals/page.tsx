"use client";

import { useRouter } from "next/navigation";
import { RecordIndex } from "@/components/record/RecordIndex";
import { proposalsConfig } from "@/components/record/configs/proposals";
import type { RecordRow } from "@/components/record/types";

// Propuestas como record-view estilo Twenty: tabla (edicion inline) + kanban por
// status. El alta (Nueva propuesta) reusa el flujo existente en /proposals/new y
// el editor [id] no se toca. Mientras una propuesta se genera con IA
// (genStatus==='generating'), pollWhile re-fetchea la lista cada 3s.
export default function ProposalsPage() {
  const router = useRouter();
  return (
    <RecordIndex
      config={proposalsConfig}
      onNew={() => router.push("/proposals/new")}
      newLabel="Nueva propuesta"
      pollWhile={(row: RecordRow) => row.genStatus === "generating"}
    />
  );
}
