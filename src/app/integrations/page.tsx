"use client";

import { useEffect, useState } from "react";
import { Plug } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  leads: number;
  lastSync: string | null;
}

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/integrations")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Integration[]) => setItems(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 fade-in">
      <h1 className="text-lg font-semibold tracking-tight mb-6">Integraciones</h1>
      {loading ? (
        <div role="status" aria-label="Cargando integraciones..." aria-busy="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => {
            return (
              <div key={i.id} role="article" aria-label={`Integracion ${i.name}: ${i.connected ? "conectado" : "desconectado"}`} className="rounded-xl border border-border bg-card p-5 flex gap-4">
                <div
                  className="h-11 w-11 rounded-lg flex items-center justify-center text-base font-bold shrink-0"
                  style={{ background: i.color + "22", color: i.color }}
                >
                  {i.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{i.name}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: i.connected ? "var(--primary)" : "var(--muted-foreground)" }}>
                    {i.connected
                      ? `Conectado${i.lastSync ? ` · ${i.lastSync}` : ""}${i.leads ? ` · ${i.leads.toLocaleString("es")} msgs` : ""}`
                      : "Desconectado"}
                  </div>
                  <div className="mt-3">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md"
                      style={{
                        background: i.connected ? "var(--accent-dim)" : "var(--surface-2)",
                        color: i.connected ? "var(--primary)" : "var(--muted-foreground)",
                      }}
                    >
                      <Plug className="h-3 w-3" />
                      {i.connected ? "Activa" : "Configurar"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-6">
        El estado se verifica en vivo: WhatsApp (puente local), Anthropic y Resend (segun tu API key en .env.local).
      </p>
    </div>
  );
}
