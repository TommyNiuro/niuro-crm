import { getStages } from "@/lib/stages";
import { getAnalyticsData } from "@/lib/analytics-cache";
import { SectionHeader, KpiGrid, StageBars, type Kpi } from "@/components/analytics/blocks";

export const dynamic = "force-dynamic";

export default function ClientesAnalyticsPage() {
  const { allContacts } = getAnalyticsData();
  const stages = getStages("clientes");

  const clients = allContacts.filter((c) => c.contactType === "client" && !c.archived);
  const mrrClientes = clients.reduce((s, c) => s + (c.valueCents || 0), 0) / 100;
  const enRiesgo = clients.filter((c) => c.stage === "En riesgo").length;
  const now = new Date().getTime();
  const nuevos30d = clients.filter((c) => c.createdAt && new Date(c.createdAt).getTime() > now - 30 * 86_400_000).length;

  const kpis: Kpi[] = [
    { label: "Clientes activos", value: clients.length },
    { label: "MRR de clientes", value: `$${mrrClientes.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
    { label: "En riesgo", value: enRiesgo },
    { label: "Nuevos (30d)", value: nuevos30d },
  ];

  const rows = stages.map((s) => ({
    label: s.name,
    color: s.color,
    count: clients.filter((c) => c.stage === s.name).length,
  }));

  return (
    <div className="max-w-5xl">
      <SectionHeader title="Clientes" description="El ciclo post-venta: cuántos clientes hay en cada etapa y cuánto MRR representan." />
      <KpiGrid kpis={kpis} />
      <div className="rounded-xl border border-border bg-card p-5 max-w-2xl">
        <h2 className="text-sm font-semibold mb-4">Distribución por etapa</h2>
        {clients.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Todavía no hay clientes. Cuando ganes un negocio, convertí el contacto en cliente (tipo de contacto) y su
            ciclo post-venta arranca en el kanban de Clientes.
          </p>
        ) : (
          <StageBars rows={rows} />
        )}
      </div>
    </div>
  );
}
