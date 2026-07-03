/**
 * Bloques visuales compartidos de Analítica v2 (server-safe, sin estado).
 * Mismo lenguaje visual que la página única anterior: cards, barras y KPIs.
 */

export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export type Kpi = { label: string; value: number | string; prev?: number };

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {kpis.map((k) => {
        const delta = k.prev != null && typeof k.value === "number" ? k.value - k.prev : null;
        return (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] text-muted-foreground leading-snug">{k.label}</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-[22px] font-bold tabular-nums">{k.value}</span>
              {delta != null && delta !== 0 && (
                <span
                  className={`text-[11px] font-semibold tabular-nums ${delta > 0 ? "text-primary" : "text-destructive"}`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta} vs sem. ant.
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type StageBarRow = { label: string; color: string; count: number; suffix?: string };

export function StageBars({ rows }: { rows: StageBarRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs" style={{ color: r.color }}>{r.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {r.count}
              {r.suffix ? ` ${r.suffix}` : ""}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Formato humano de una mediana en minutos. */
export function formatMinutes(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  return `${Math.round(mins / 60)} h`;
}
