"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RecordIndex } from "@/components/record/RecordIndex";
import { dealsConfig } from "@/components/record/configs/deals";
import { DealForm } from "@/components/deals/DealForm";

// Deals como record-view estilo Twenty: tabla (edición inline) + kanban por
// etapa (drag) + panel de detalle. Conserva el alta vía DealForm.
function DealsInner() {
  const params = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [reload, setReload] = useState(0);

  // El command-K abre el alta con ?new=1.
  useEffect(() => {
    if (params.get("new") === "1") setShowForm(true);
  }, [params]);

  return (
    <>
      <RecordIndex config={dealsConfig} onNew={() => setShowForm(true)} newLabel="Nuevo Deal" reloadSignal={reload} />
      <DealForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setReload((r) => r + 1);
        }}
      />
    </>
  );
}

// useSearchParams exige un boundary de Suspense para el prerender de producción.
export default function DealsPage() {
  return (
    <Suspense fallback={null}>
      <DealsInner />
    </Suspense>
  );
}
