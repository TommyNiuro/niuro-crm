"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { RecordIndex } from "@/components/record/RecordIndex";
import { opportunitiesConfig } from "@/components/record/configs/opportunities";
import type { RecordRow } from "@/components/record/types";

// Radar de grupos como COLA DE TRIAGE (Fase 5 auditoría 2026-07-02). Antes:
// tabla única con las 262 filas mezcladas (descartadas con score alto flotaban
// arriba) y el estado editable como único mecanismo. Ahora: pestañas por
// estado con conteos (default Nuevas) y acciones rápidas por fila
// (Contactada / Descartar / Reactivar) además de Responder.

const TABS = [
  { key: "new", label: "Nuevas" },
  { key: "contacted", label: "Contactadas" },
  { key: "discarded", label: "Descartadas" },
  { key: "all", label: "Todas" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function OpportunitiesPage() {
  const [tab, setTab] = useState<TabKey>("new");
  const [counts, setCounts] = useState<Record<string, number>>({});

  const loadCounts = () =>
    fetch("/api/opportunities?counts=1")
      .then((r) => (r.ok ? r.json() : {}))
      .then((c: Record<string, number>) => setCounts(c && typeof c === "object" ? c : {}))
      .catch(() => {});

  useEffect(() => { loadCounts(); }, []);

  const config = useMemo(() => {
    const setStatus = (status: string) => async (row: RecordRow) => {
      const r = await fetch(`/api/opportunities/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("No se pudo actualizar el estado");
      loadCounts(); // los conteos de las pestañas también cambian
    };
    return {
      ...opportunitiesConfig,
      defaultFilters:
        tab === "all" ? [] : [{ id: "tab-status", key: "status", op: "is" as const, value: tab }],
      rowActions: [
        ...(opportunitiesConfig.rowActions ?? []),
        {
          label: "Contactada",
          icon: CheckCircle2,
          onClick: setStatus("contacted"),
          show: (row: RecordRow) => row.status === "new",
        },
        {
          label: "Descartar",
          icon: XCircle,
          onClick: setStatus("discarded"),
          show: (row: RecordRow) => row.status !== "discarded",
        },
        {
          label: "Reactivar",
          icon: RotateCcw,
          onClick: setStatus("new"),
          show: (row: RecordRow) => row.status === "discarded",
        },
      ],
    };
  }, [tab]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-6 pt-4 shrink-0">
        {TABS.map((t) => {
          const n = t.key === "all"
            ? (counts.new ?? 0) + (counts.contacted ?? 0) + (counts.discarded ?? 0)
            : counts[t.key];
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-lg text-[13px] cursor-pointer flex items-center gap-1.5 ${
                active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t.label}
              {n != null && (
                <span className={`text-[11px] font-bold tabular-nums rounded-full px-1.5 ${active ? "bg-card" : "bg-muted"}`}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        {/* key={tab}: remonta el índice con los filtros de la pestaña */}
        <RecordIndex key={tab} config={config} />
      </div>
    </div>
  );
}
