import { getAnalyticsData } from "@/lib/analytics-cache";
import { SectionHeader, KpiGrid, formatMinutes, type Kpi } from "@/components/analytics/blocks";

export const dynamic = "force-dynamic";

export default function ActividadAnalyticsPage() {
  const { allTasks, allOpps, waStats } = getAnalyticsData();

  const now = new Date().getTime();
  const week = 7 * 86_400_000;
  const inWindow = (d: Date | number | null, offset: 0 | 1) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t > now - week * (offset + 1) && t <= now - week * offset;
  };

  const kpis: Kpi[] = [
    { label: "Tareas completadas (7d)", value: allTasks.filter((t) => t.status === "completed" && inWindow(t.completedAt, 0)).length, prev: allTasks.filter((t) => t.status === "completed" && inWindow(t.completedAt, 1)).length },
    { label: "Radar contactadas (7d)", value: allOpps.filter((o) => o.status === "contacted" && inWindow(o.updatedAt, 0)).length, prev: allOpps.filter((o) => o.status === "contacted" && inWindow(o.updatedAt, 1)).length },
    { label: "Tareas abiertas", value: allTasks.filter((t) => t.status === "open").length },
    { label: "Respuesta mediana (30d)", value: formatMinutes(waStats.medianResponseMinutes) },
  ];

  const waKpis: Kpi[] = [
    { label: "Mensajes enviados (30d)", value: waStats.sent30 },
    { label: "Mensajes recibidos (30d)", value: waStats.received30 },
    { label: "Chats activos (30d)", value: waStats.activeChats30 },
    {
      label: "Ratio enviado/recibido",
      value: waStats.received30 > 0 ? (waStats.sent30 / waStats.received30).toFixed(1) : "—",
    },
  ];

  return (
    <div className="max-w-5xl">
      <SectionHeader title="Actividad" description="Tu ritmo de ejecución: tareas, radar y conversación por WhatsApp (solo chats 1 a 1, sin grupos)." />
      <KpiGrid kpis={kpis} />
      <h2 className="text-sm font-semibold mb-3 mt-2">WhatsApp (últimos 30 días)</h2>
      <KpiGrid kpis={waKpis} />
      <p className="text-[11px] text-muted-foreground">
        La respuesta mediana mide cuánto tardás en contestar el primer mensaje entrante de cada conversación. Los grupos no cuentan.
      </p>
    </div>
  );
}
