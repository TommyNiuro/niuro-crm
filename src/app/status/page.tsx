import { rawDb } from "@/db";
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface StatusRow {
  id: string;
  status: string;
  detail: string | null;
  checked_at: number;
}

const HOURS = 24;

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Página de estado del bridge de WhatsApp, estilo status.claude.com: banner +
// fila de componente + tira de barras por hora + lista de incidentes. Sin
// librería de gráficos (no hay ninguna instalada): divs + Tailwind, mismo
// espíritu que las barras del pipeline en el home.
export default function StatusPage() {
  const rows = rawDb
    .prepare("SELECT id, status, detail, checked_at FROM bridge_status_log ORDER BY checked_at ASC")
    .all() as StatusRow[];

  const latest = rows[rows.length - 1];
  const isUp = latest?.status === "up";
  const hasData = rows.length > 0;

  // Una barra por hora de las últimas 24h: el color es el último estado
  // conocido ANTES o durante esa hora (log de transiciones, no de checks).
  const now = Date.now();
  const buckets = Array.from({ length: HOURS }, (_, i) => {
    const bucketEnd = now - (HOURS - 1 - i) * 60 * 60 * 1000;
    let status: string | null = null;
    for (const r of rows) {
      if (r.checked_at <= bucketEnd) status = r.status;
      else break;
    }
    return { bucketEnd, status };
  });

  const incidents = rows.filter((r) => r.status === "down").slice(-10).reverse();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Estado</h1>
        <p className="text-sm text-muted-foreground">Conexión con el bridge de WhatsApp.</p>
      </div>

      <div
        className={cn(
          "rounded-lg p-4 flex items-center gap-3 border",
          !hasData
            ? "bg-muted border-border"
            : isUp
              ? "bg-success/10 border-success/30"
              : "bg-destructive/10 border-destructive/30"
        )}
      >
        {!hasData ? (
          <HelpCircle className="h-5 w-5 text-muted-foreground shrink-0" />
        ) : isUp ? (
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
        ) : (
          <XCircle className="h-5 w-5 text-destructive shrink-0" />
        )}
        <div>
          <p className="text-sm font-medium">
            {!hasData ? "Sin datos todavía" : isUp ? "Todos los sistemas operativos" : "Bridge de WhatsApp caído"}
          </p>
          {latest?.detail && <p className="text-xs text-muted-foreground">{latest.detail}</p>}
        </div>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Bridge de WhatsApp</span>
          <span className={cn("text-xs font-medium", isUp ? "text-success" : "text-destructive")}>
            {hasData ? (isUp ? "Operativo" : "Caído") : "—"}
          </span>
        </div>
        <div className="flex gap-[3px]">
          {buckets.map((b, i) => (
            <div
              key={i}
              title={new Date(b.bucketEnd).toLocaleString("es-CL")}
              className={cn(
                "h-6 flex-1 rounded-sm",
                b.status === null ? "bg-muted" : b.status === "up" ? "bg-success" : "bg-destructive"
              )}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>hace 24h</span>
          <span>ahora</span>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Incidentes recientes</h2>
        {incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin incidentes registrados.</p>
        ) : (
          <div className="space-y-2">
            {incidents.map((inc) => (
              <div key={inc.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="font-medium">{fmtTime(inc.checked_at)}</span>
                </div>
                {inc.detail && <p className="text-xs text-muted-foreground mt-1">{inc.detail}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
