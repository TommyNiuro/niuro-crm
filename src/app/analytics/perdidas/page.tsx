import { getStageNames, stageCfgFor } from "@/lib/stages";
import { formatCurrency } from "@/lib/constants";
import { getAnalyticsData } from "@/lib/analytics-cache";
import { SectionHeader, KpiGrid, type Kpi } from "@/components/analytics/blocks";

export const dynamic = "force-dynamic";

// Categoría de pérdida: el texto libre de disqualify_reason empieza con la
// razón corta ("No quiso / no necesita. Señal previa: ...").
function lossCategory(reason: string | null): string {
  if (!reason || !reason.trim()) return "Sin razón registrada";
  const head = reason.split(/[.\n]/)[0].trim();
  return head.length > 60 ? head.slice(0, 57) + "…" : head || "Sin razón registrada";
}

export default function PerdidasAnalyticsPage() {
  const { allContacts } = getAnalyticsData();
  const STAGES = getStageNames("prospectos");
  const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]));

  const sales = allContacts.filter((c) => (c.contactType || "lead") === "lead");
  const lostContacts = sales.filter((c) => c.archived);

  const lostValue = lostContacts.reduce((s, c) => s + (c.valueCents || 0), 0);
  const lossByReason = new Map<string, number>();
  for (const c of lostContacts) {
    const cat = lossCategory(c.disqualifyReason);
    lossByReason.set(cat, (lossByReason.get(cat) || 0) + 1);
  }
  const lossReasons = [...lossByReason.entries()].sort((a, b) => b[1] - a[1]);
  const lossByStage = new Map<string, number>();
  for (const c of lostContacts) {
    lossByStage.set(c.stage, (lossByStage.get(c.stage) || 0) + 1);
  }
  const lossStages = STAGES.filter((s) => lossByStage.has(s)).map((s) => ({ stage: s, count: lossByStage.get(s)! }));
  const lossRate = sales.length > 0 ? Math.round((lostContacts.length / sales.length) * 100) : 0;
  const lateStageLost = lostContacts.filter((c) => (STAGE_ORDER[c.stage] ?? 0) >= (STAGE_ORDER["Propuesta"] ?? 2));

  const kpis: Kpi[] = [
    { label: "Perdidos", value: lostContacts.length },
    { label: "Tasa de pérdida", value: `${lossRate}%` },
    { label: "Perdidos en etapa avanzada (Propuesta+)", value: lateStageLost.length },
    { label: "Valor perdido", value: formatCurrency(lostValue) },
  ];

  return (
    <div className="max-w-5xl">
      <SectionHeader title="Pérdidas" description="Dónde y por qué se caen los prospectos: la materia prima para calibrar el playbook." />
      <KpiGrid kpis={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Por razón</h3>
          {lossReasons.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Sin pérdidas registradas.</p>
          ) : (
            <div className="space-y-2">
              {lossReasons.map(([reason, count]) => (
                <div key={reason}>
                  <div className="flex items-center justify-between mb-0.5 gap-2">
                    <span className="text-[12px] truncate">{reason}</span>
                    <span className="text-[12px] text-muted-foreground tabular-nums shrink-0">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full bg-destructive/60" style={{ width: `${Math.round((count / lostContacts.length) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Por etapa donde se perdió</h3>
          {lossStages.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Sin pérdidas registradas.</p>
          ) : (
            <div className="space-y-2">
              {lossStages.map(({ stage, count }) => {
                const cfg = stageCfgFor(stage, 0);
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[12px]" style={{ color: cfg.text }}>{stage}</span>
                      <span className="text-[12px] text-muted-foreground tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round((count / lostContacts.length) * 100)}%`, background: cfg.text }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {lateStageLost.length > 0 && (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-2.5">
              <p className="text-[11px] leading-snug">
                <span className="font-semibold text-warning">Atención:</span> {lateStageLost.length} contacto{lateStageLost.length > 1 ? "s" : ""} se perdi{lateStageLost.length > 1 ? "eron" : "ó"} después de recibir propuesta — revisar esas conversaciones para entender el quiebre.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
