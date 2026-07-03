import { getStages } from "@/lib/stages";
import { getAnalyticsData } from "@/lib/analytics-cache";
import { SectionHeader, KpiGrid, StageBars, type Kpi } from "@/components/analytics/blocks";

export const dynamic = "force-dynamic";

export default function IngenierosAnalyticsPage() {
  const { allContacts } = getAnalyticsData();
  const stages = getStages("ingenieros");

  const engineers = allContacts.filter((c) => c.contactType === "engineer" && !c.archived);
  const now = new Date().getTime();
  const week = 7 * 86_400_000;
  const nuevos7d = engineers.filter((c) => c.createdAt && new Date(c.createdAt).getTime() > now - week).length;
  const lastStage = stages[stages.length - 1]?.name; // p.ej. Colocado
  const colocados = lastStage ? engineers.filter((c) => c.stage === lastStage).length : 0;

  const kpis: Kpi[] = [
    { label: "Ingenieros en el pool", value: engineers.length },
    { label: "Nuevos (7d)", value: nuevos7d },
    { label: lastStage ? `En ${lastStage}` : "En etapa final", value: colocados },
    { label: "Disponibles para colocar", value: engineers.filter((c) => c.stage === "Disponible").length },
  ];

  const rows = stages.map((s) => ({
    label: s.name,
    color: s.color,
    count: engineers.filter((c) => c.stage === s.name).length,
  }));

  return (
    <div className="max-w-5xl">
      <SectionHeader title="Ingenieros" description="El pool de talento: cuántos hay en cada etapa del pipeline de reclutamiento." />
      <KpiGrid kpis={kpis} />
      <div className="rounded-xl border border-border bg-card p-5 max-w-2xl">
        <h2 className="text-sm font-semibold mb-4">Distribución por etapa</h2>
        {engineers.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Todavía no hay ingenieros en el pool. Marcá contactos con &quot;Es un ingeniero&quot; en Conversaciones, o corré
            <code className="mx-1">npx tsx scripts/backfill-engineers.ts</code> para detectarlos en tu historial.
          </p>
        ) : (
          <StageBars rows={rows} />
        )}
      </div>
    </div>
  );
}
