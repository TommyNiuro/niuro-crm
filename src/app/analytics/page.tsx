import { getStageNames, stageCfgFor } from "@/lib/stages";
import { readSettings } from "@/lib/settings";
import { formatCurrency } from "@/lib/constants";
import { getAnalyticsData } from "@/lib/analytics-cache";
import { TrendingDown, Filter, Clock } from "lucide-react";

export const dynamic = "force-dynamic";


// Categoría de pérdida: el texto libre de disqualify_reason empieza con la
// razón corta ("No quiso / no necesita. Señal previa: ...").
function lossCategory(reason: string | null): string {
  if (!reason || !reason.trim()) return "Sin razón registrada";
  const head = reason.split(/[.\n]/)[0].trim();
  return head.length > 60 ? head.slice(0, 57) + "…" : head || "Sin razón registrada";
}

export default function AnalyticsPage() {
  // Datasets crudos cacheados 60s (ver analytics-cache.ts); el cómputo va acá.
  const { allContacts, transitions, allCandidates, allTasks, allOpps, medianResponseMinutes } = getAnalyticsData();
  // Etapas y meta desde la DB (editables en Ajustes), no constantes.
  const STAGES = getStageNames();
  const GOAL_MRR = Number(readSettings(["goal_mrr"]).goal_mrr) || 20000;
  const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]));
  const activeContacts = allContacts.filter((c) => !c.archived);
  const lostContacts = allContacts.filter((c) => c.archived);

  const byStage = STAGES.map(stage => ({
    stage,
    count: activeContacts.filter(c => c.stage === stage).length,
    value: activeContacts.filter(c => c.stage === stage).reduce((s, c) => s + (c.valueCents || 0), 0),
  }));
  const maxStage = Math.max(1, ...byStage.map(s => s.count));

  const closedMRR = activeContacts.filter(c => c.stage === "Cierre" || c.stage === "Expansion").reduce((s, c) => s + (c.valueCents || 0), 0) / 100;
  const PROB: Record<string, number> = { Prospecto: 0.05, Discovery: 0.15, Propuesta: 0.3, Perfil: 0.45, Entrevistas: 0.6, Cierre: 0.9, Expansion: 1 };
  const projectedMRR = activeContacts.filter(c => c.stage !== "Cierre" && c.stage !== "Expansion").reduce((s, c) => s + ((c.valueCents || 0) / 100) * (PROB[c.stage] || 0), 0);
  const mrrPct = Math.min(100, Math.round(((closedMRR + projectedMRR) / GOAL_MRR) * 100));

  // ── Embudo: cuántos contactos llegaron a cada etapa ──
  // Un contacto "llegó" a la etapa S si su etapa actual es S o posterior,
  // o si alguna transición lo llevó a S (incluye perdidos: también entraron).
  const reachedSets: Record<string, Set<string>> = Object.fromEntries(STAGES.map((s) => [s, new Set<string>()]));
  for (const c of allContacts) {
    const order = STAGE_ORDER[c.stage] ?? 0;
    for (const s of STAGES) {
      if (STAGE_ORDER[s] <= order) reachedSets[s].add(c.id);
    }
  }
  for (const t of transitions) {
    if (reachedSets[t.toStep]) reachedSets[t.toStep].add(t.contactId);
  }
  const funnel = STAGES.map((stage, i) => {
    const reached = reachedSets[stage].size;
    const prev = i > 0 ? reachedSets[STAGES[i - 1]].size : reached;
    return {
      stage,
      reached,
      conversion: i > 0 && prev > 0 ? Math.round((reached / prev) * 100) : null,
    };
  });
  const maxReached = Math.max(1, ...funnel.map((f) => f.reached));

  // ── Tiempos por etapa: deltas entre transiciones consecutivas del mismo
  // contacto (occurred_at), complementados con duration_days cuando existe. ──
  const byContact = new Map<string, typeof transitions>();
  for (const t of transitions) {
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
      const days = (new Date(sorted[i + 1].occurredAt).getTime() - new Date(sorted[i].occurredAt).getTime()) / 86_400_000;
      staysByStage[stay].push(days);
    }
  }
  for (const t of transitions) {
    if (t.fromStep && t.durationDays != null && staysByStage[t.fromStep]) {
      staysByStage[t.fromStep].push(t.durationDays);
    }
  }
  const avgByStage = STAGES.map((stage) => {
    const stays = staysByStage[stage];
    return { stage, avg: stays.length ? Math.round((stays.reduce((s, d) => s + d, 0) / stays.length) * 10) / 10 : null, n: stays.length };
  });

  // ── Análisis de pérdida ──
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
  const totalEverActive = allContacts.length;
  const lossRate = totalEverActive > 0 ? Math.round((lostContacts.length / totalEverActive) * 100) : 0;
  // Pérdidas tardías: contactos que llegaron a Propuesta o más y se perdieron.
  const lateStageLost = lostContacts.filter((c) => (STAGE_ORDER[c.stage] ?? 0) >= STAGE_ORDER["Propuesta"]);

  // ── KPIs semanales (7d vs los 7d anteriores) ──
  const now = new Date().getTime();
  const week = 7 * 86_400_000;
  const inWindow = (d: Date | number | null, offset: 0 | 1) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t > now - week * (offset + 1) && t <= now - week * offset;
  };
  const wonAll = activeContacts.filter((c) => c.stage === "Cierre" || c.stage === "Expansion").length;
  const winRate = wonAll + lostContacts.length > 0 ? Math.round((wonAll / (wonAll + lostContacts.length)) * 100) : null;
  const kpis: { label: string; value: number | string; prev?: number }[] = [
    { label: "Leads nuevos (7d)", value: allCandidates.filter((c) => inWindow(c.createdAt, 0)).length, prev: allCandidates.filter((c) => inWindow(c.createdAt, 1)).length },
    { label: "Aprobados (7d)", value: allContacts.filter((c) => inWindow(c.createdAt, 0)).length, prev: allContacts.filter((c) => inWindow(c.createdAt, 1)).length },
    { label: "Tareas completadas (7d)", value: allTasks.filter((t) => t.status === "completed" && inWindow(t.completedAt, 0)).length, prev: allTasks.filter((t) => t.status === "completed" && inWindow(t.completedAt, 1)).length },
    { label: "Radar contactadas (7d)", value: allOpps.filter((o) => o.status === "contacted" && inWindow(o.updatedAt, 0)).length, prev: allOpps.filter((o) => o.status === "contacted" && inWindow(o.updatedAt, 1)).length },
    { label: "Win rate", value: winRate != null ? `${winRate}%` : "—" },
    {
      label: "Respuesta mediana (30d)",
      value: medianResponseMinutes == null
        ? "—"
        : medianResponseMinutes < 60
          ? `${medianResponseMinutes} min`
          : `${Math.round(medianResponseMinutes / 60)} h`,
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 fade-in">
      <h1 className="text-lg font-semibold tracking-tight mb-6">Analitica</h1>

      {/* KPIs semanales */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
        {kpis.map((k) => {
          const delta = k.prev != null && typeof k.value === "number" ? k.value - k.prev : null;
          return (
            <div key={k.label} className="rounded-xl border border-border bg-card p-4">
              <div className="text-[11px] text-muted-foreground leading-snug">{k.label}</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-[22px] font-bold tabular-nums">{k.value}</span>
                {delta != null && delta !== 0 && (
                  <span className={`text-[11px] font-semibold tabular-nums ${delta > 0 ? "text-primary" : "text-destructive"}`}>
                    {delta > 0 ? "+" : ""}{delta} vs sem. ant.
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* MRR */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Meta MRR</h2>
          <div className="flex gap-6 mb-3">
            <div><div className="text-xl font-bold tabular-nums text-primary">${closedMRR.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div><div className="text-[10px] text-muted-foreground">Cerrado</div></div>
            <div><div className="text-xl font-bold tabular-nums text-warning">${Math.round(projectedMRR).toLocaleString("en-US")}</div><div className="text-[10px] text-muted-foreground">Proyectado</div></div>
            <div><div className="text-xl font-bold tabular-nums text-muted-foreground">${Math.max(0, Math.round(GOAL_MRR - closedMRR - projectedMRR)).toLocaleString("en-US")}</div><div className="text-[10px] text-muted-foreground">Brecha</div></div>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${mrrPct}%` }} /></div>
          <div className="text-[10px] text-muted-foreground mt-1">{mrrPct}% de ${GOAL_MRR.toLocaleString("en-US")}/mes</div>
        </div>

        {/* Distribucion por etapa */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Distribucion por Etapa</h2>
          <div className="space-y-3">
            {byStage.map(s => {
              const cfg = stageCfgFor(s.stage, 0);
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: cfg.text }}>{s.stage}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{s.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(s.count / maxStage) * 100}%`, background: cfg.text }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Embudo de conversion con tiempos */}
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Embudo de conversion</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">Contactos que llegaron a cada etapa (incluye perdidos) · % de conversion desde la etapa anterior · dias promedio en la etapa</p>
          <div className="space-y-2.5">
            {funnel.map((f) => {
              const cfg = stageCfgFor(f.stage, 0);
              const avg = avgByStage.find((a) => a.stage === f.stage);
              return (
                <div key={f.stage} className="flex items-center gap-3">
                  <div className="w-[88px] text-xs shrink-0 text-right" style={{ color: cfg.text }}>{f.stage}</div>
                  <div className="flex-1 h-7 rounded-md bg-surface-3 overflow-hidden relative">
                    <div
                      className="h-full rounded-md flex items-center px-2"
                      style={{ width: `${Math.max(4, Math.round((f.reached / maxReached) * 100))}%`, background: cfg.bg, borderLeft: `3px solid ${cfg.text}` }}
                    >
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
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {avg?.avg != null ? `${avg.avg}d` : "—"}
                    </span>
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

        {/* Analisis de perdida */}
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold">Analisis de perdida</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xl font-bold tabular-nums text-destructive">{lostContacts.length}</div>
              <div className="text-[10px] text-muted-foreground">Perdidos</div>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xl font-bold tabular-nums">{lossRate}%</div>
              <div className="text-[10px] text-muted-foreground">Tasa de perdida</div>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xl font-bold tabular-nums text-warning">{lateStageLost.length}</div>
              <div className="text-[10px] text-muted-foreground">Perdidos en etapa avanzada (Propuesta+)</div>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xl font-bold tabular-nums text-muted-foreground">{formatCurrency(lostValue)}</div>
              <div className="text-[10px] text-muted-foreground">Valor perdido</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Por razon */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Por razon</h3>
              {lossReasons.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Sin perdidas registradas.</p>
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
            {/* Por etapa donde se perdio */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Por etapa donde se perdio</h3>
              {lossStages.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Sin perdidas registradas.</p>
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
                    <span className="font-semibold text-warning">Atencion:</span> {lateStageLost.length} contacto{lateStageLost.length > 1 ? "s" : ""} se perdi{lateStageLost.length > 1 ? "eron" : "o"} despues de recibir propuesta — revisar esas conversaciones para entender el quiebre.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
