import { getStageNames, stageCfgFor } from "@/lib/stages";
import { readSettings } from "@/lib/settings";
import { getAnalyticsData } from "@/lib/analytics-cache";
import { SectionHeader, KpiGrid, StageBars, type Kpi } from "@/components/analytics/blocks";
import { Filter, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default function VentasAnalyticsPage() {
  const { allContacts, transitions, allCandidates } = getAnalyticsData();
  const STAGES = getStageNames("prospectos");
  const GOAL_MRR = Number(readSettings(["goal_mrr"]).goal_mrr) || 20000;
  const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]));

  // Solo el pipeline de ventas: ingenieros y clientes tienen su sección.
  const sales = allContacts.filter((c) => (c.contactType || "lead") === "lead");
  const activeContacts = sales.filter((c) => !c.archived);
  const lostContacts = sales.filter((c) => c.archived);

  const byStage = STAGES.map((stage, i) => ({
    label: stage,
    color: stageCfgFor(stage, i).text,
    count: activeContacts.filter((c) => c.stage === stage).length,
  }));

  const closedMRR = activeContacts.filter((c) => c.stage === "Cierre" || c.stage === "Expansion").reduce((s, c) => s + (c.valueCents || 0), 0) / 100;
  const PROB: Record<string, number> = { Prospecto: 0.05, Discovery: 0.15, Propuesta: 0.3, Perfil: 0.45, Entrevistas: 0.6, Cierre: 0.9, Expansion: 1 };
  const projectedMRR = activeContacts.filter((c) => c.stage !== "Cierre" && c.stage !== "Expansion").reduce((s, c) => s + ((c.valueCents || 0) / 100) * (PROB[c.stage] || 0), 0);
  const mrrPct = Math.min(100, Math.round(((closedMRR + projectedMRR) / GOAL_MRR) * 100));

  // ── Embudo: cuántos contactos llegaron a cada etapa (incluye perdidos) ──
  const reachedSets: Record<string, Set<string>> = Object.fromEntries(STAGES.map((s) => [s, new Set<string>()]));
  for (const c of sales) {
    const order = STAGE_ORDER[c.stage] ?? 0;
    for (const s of STAGES) {
      if (STAGE_ORDER[s] <= order) reachedSets[s].add(c.id);
    }
  }
  const salesIds = new Set(sales.map((c) => c.id));
  for (const t of transitions) {
    if (reachedSets[t.toStep] && salesIds.has(t.contactId)) reachedSets[t.toStep].add(t.contactId);
  }
  const funnel = STAGES.map((stage, i) => {
    const reached = reachedSets[stage].size;
    const prev = i > 0 ? reachedSets[STAGES[i - 1]].size : reached;
    return { stage, reached, conversion: i > 0 && prev > 0 ? Math.round((reached / prev) * 100) : null };
  });
  const maxReached = Math.max(1, ...funnel.map((f) => f.reached));

  // ── Tiempos por etapa (transiciones consecutivas + duration_days) ──
  const byContact = new Map<string, typeof transitions>();
  for (const t of transitions) {
    if (!salesIds.has(t.contactId)) continue;
    const list = byContact.get(t.contactId) || [];
    list.push(t);
    byContact.set(t.contactId, list);
  }
  const staysByStage: Record<string, number[]> = Object.fromEntries(STAGES.map((s) => [s, []]));
  for (const list of byContact.values()) {
    const sorted = [...list].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const stay = sorted[i].toStep;
      if (!staysByStage[stay]) continue;
      staysByStage[stay].push((new Date(sorted[i + 1].occurredAt).getTime() - new Date(sorted[i].occurredAt).getTime()) / 86_400_000);
    }
  }
  for (const t of transitions) {
    if (t.fromStep && t.durationDays != null && staysByStage[t.fromStep] && salesIds.has(t.contactId)) {
      staysByStage[t.fromStep].push(t.durationDays);
    }
  }
  const avgByStage = STAGES.map((stage) => {
    const stays = staysByStage[stage];
    return { stage, avg: stays.length ? Math.round((stays.reduce((s, d) => s + d, 0) / stays.length) * 10) / 10 : null };
  });

  // ── KPIs (7d vs 7d anteriores) ──
  const now = new Date().getTime();
  const week = 7 * 86_400_000;
  const inWindow = (d: Date | number | null, offset: 0 | 1) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t > now - week * (offset + 1) && t <= now - week * offset;
  };
  const wonAll = activeContacts.filter((c) => c.stage === "Cierre" || c.stage === "Expansion").length;
  const winRate = wonAll + lostContacts.length > 0 ? Math.round((wonAll / (wonAll + lostContacts.length)) * 100) : null;
  const kpis: Kpi[] = [
    { label: "Leads nuevos (7d)", value: allCandidates.filter((c) => inWindow(c.createdAt, 0)).length, prev: allCandidates.filter((c) => inWindow(c.createdAt, 1)).length },
    { label: "Aprobados (7d)", value: sales.filter((c) => inWindow(c.createdAt, 0)).length, prev: sales.filter((c) => inWindow(c.createdAt, 1)).length },
    { label: "Win rate", value: winRate != null ? `${winRate}%` : "—" },
    { label: "Meta del mes", value: `${mrrPct}%` },
  ];

  return (
    <div className="max-w-5xl">
      <SectionHeader title="Ventas" description="El funnel de prospectos: meta, distribución, conversión y velocidad por etapa." />
      <KpiGrid kpis={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Meta MRR</h2>
          <div className="flex gap-6 mb-3">
            <div><div className="text-xl font-bold tabular-nums text-primary">${closedMRR.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div><div className="text-[10px] text-muted-foreground">Cerrado</div></div>
            <div><div className="text-xl font-bold tabular-nums text-warning">${Math.round(projectedMRR).toLocaleString("en-US")}</div><div className="text-[10px] text-muted-foreground">Proyectado</div></div>
            <div><div className="text-xl font-bold tabular-nums text-muted-foreground">${Math.max(0, Math.round(GOAL_MRR - closedMRR - projectedMRR)).toLocaleString("en-US")}</div><div className="text-[10px] text-muted-foreground">Brecha</div></div>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${mrrPct}%` }} /></div>
          <div className="text-[10px] text-muted-foreground mt-1">{mrrPct}% de ${GOAL_MRR.toLocaleString("en-US")}/mes · la meta se edita en Ajustes &gt; Negocio</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Distribución por etapa</h2>
          <StageBars rows={byStage} />
        </div>

        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Embudo de conversión</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">Contactos que llegaron a cada etapa (incluye perdidos) · % de conversión desde la etapa anterior · días promedio en la etapa</p>
          <div className="space-y-2.5">
            {funnel.map((f, i) => {
              const cfg = stageCfgFor(f.stage, i);
              const avg = avgByStage.find((a) => a.stage === f.stage);
              return (
                <div key={f.stage} className="flex items-center gap-3">
                  <div className="w-[88px] text-xs shrink-0 text-right" style={{ color: cfg.text }}>{f.stage}</div>
                  <div className="flex-1 h-7 rounded-md bg-surface-3 overflow-hidden relative">
                    <div className="h-full rounded-md flex items-center px-2" style={{ width: `${Math.max(4, Math.round((f.reached / maxReached) * 100))}%`, background: cfg.bg, borderLeft: `3px solid ${cfg.text}` }}>
                      <span className="text-[12px] font-bold tabular-nums" style={{ color: cfg.text }}>{f.reached}</span>
                    </div>
                  </div>
                  <div className="w-[64px] shrink-0 text-right">
                    {f.conversion != null ? (
                      <span className={`text-[12px] font-semibold tabular-nums ${f.conversion >= 50 ? "text-primary" : f.conversion >= 25 ? "text-warning" : "text-destructive"}`}>{f.conversion}%</span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="w-[88px] shrink-0 text-right flex items-center justify-end gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[12px] tabular-nums text-muted-foreground">{avg?.avg != null ? `${avg.avg}d` : "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
            <span>{transitions.length} transiciones registradas</span>
            <span>Los tiempos se calculan con las transiciones de etapa de cada contacto</span>
          </div>
        </div>
      </div>
    </div>
  );
}
