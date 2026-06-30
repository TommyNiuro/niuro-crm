"use client";

import { useEffect, useState } from "react";
import { Plug, RefreshCw, FileText, CheckSquare, Square, Upload, Loader2 } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  leads: number;
  lastSync: string | null;
}

interface GranolaTranscript {
  id: string;
  title: string;
  date: string;
  participants: string[];
  content: string;
}

interface HubSpotSyncResult {
  ok?: boolean;
  created?: number;
  updated?: number;
  hubspot?: number;
  crm?: number;
  error?: string;
}

interface GranolaImportResult {
  imported?: number;
  skipped?: number;
  error?: string;
}

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  const [hsSyncing, setHsSyncing] = useState(false);
  const [hsResult, setHsResult] = useState<HubSpotSyncResult | null>(null);
  const [hsHasKey, setHsHasKey] = useState(false);

  const [granolaLoading, setGranolaLoading] = useState(false);
  const [granolaTranscripts, setGranolaTranscripts] = useState<GranolaTranscript[] | null>(null);
  const [granolaSelected, setGranolaSelected] = useState<Set<string>>(new Set());
  const [granolaImporting, setGranolaImporting] = useState(false);
  const [granolaResult, setGranolaResult] = useState<GranolaImportResult | null>(null);
  const [granolaAvailable, setGranolaAvailable] = useState(false);

  useEffect(() => {
    fetch("/api/integrations")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Integration[]) => {
        setItems(Array.isArray(d) ? d : []);
        const hs = d.find((i: Integration) => i.id === "hubspot");
        setHsHasKey(!!hs?.connected || false);
      })
      .finally(() => setLoading(false));

    fetch("/api/integrations/hubspot/contacts")
      .then((r) => r.json())
      .then((d: unknown[]) => setHsHasKey(Array.isArray(d) && d.length >= 0))
      .catch(() => {});

    fetch("/api/integrations/granola")
      .then((r) => r.ok ? r.json() : [])
      .then((d: GranolaTranscript[]) => {
        setGranolaAvailable(Array.isArray(d));
      })
      .catch(() => {});
  }, []);

  async function syncHubSpot() {
    setHsSyncing(true);
    setHsResult(null);
    try {
      const res = await fetch("/api/integrations/hubspot", { method: "POST" });
      const data = await res.json() as HubSpotSyncResult;
      setHsResult(data);
      if (data.ok) {
        const updated = await fetch("/api/integrations").then((r) => r.json()) as Integration[];
        setItems(Array.isArray(updated) ? updated : items);
      }
    } catch {
      setHsResult({ error: "Error de red al sincronizar" });
    } finally {
      setHsSyncing(false);
    }
  }

  async function loadGranolaTranscripts() {
    setGranolaLoading(true);
    setGranolaResult(null);
    try {
      const res = await fetch("/api/integrations/granola");
      const data = await res.json() as GranolaTranscript[];
      setGranolaTranscripts(Array.isArray(data) ? data : []);
      setGranolaSelected(new Set());
    } finally {
      setGranolaLoading(false);
    }
  }

  function toggleTranscript(id: string) {
    setGranolaSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function importSelected() {
    if (!granolaSelected.size) return;
    setGranolaImporting(true);
    setGranolaResult(null);
    try {
      const res = await fetch("/api/integrations/granola", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptIds: [...granolaSelected] }),
      });
      const data = await res.json() as GranolaImportResult;
      setGranolaResult(data);
      setGranolaSelected(new Set());
    } finally {
      setGranolaImporting(false);
    }
  }

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
            if (i.id === "hubspot") {
              return (
                <div key={i.id} role="article" aria-label={`Integracion ${i.name}: ${i.connected ? "conectado" : "desconectado"}`} className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
                  <div className="flex gap-4">
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
                          ? `Conectado${i.lastSync ? ` · ${i.lastSync}` : ""}${i.leads ? ` · ${i.leads.toLocaleString("es")} contactos` : ""}`
                          : "Desconectado"}
                      </div>
                    </div>
                  </div>
                  {!hsHasKey ? (
                    <div className="text-[11px] text-muted-foreground">
                      Agrega <code className="text-xs bg-surface-2 px-1 rounded">HUBSPOT_API_KEY</code> en <code className="text-xs bg-surface-2 px-1 rounded">.env.local</code> para sincronizar.
                    </div>
                  ) : (
                    <button
                      onClick={syncHubSpot}
                      disabled={hsSyncing}
                      aria-label={hsSyncing ? "Sincronizando HubSpot..." : "Sincronizar contactos de HubSpot"}
                      aria-busy={hsSyncing}
                      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md self-start"
                      style={{
                        background: "var(--accent-dim)",
                        color: "var(--primary)",
                        opacity: hsSyncing ? 0.6 : 1,
                        cursor: hsSyncing ? "not-allowed" : "pointer",
                      }}
                    >
                      {hsSyncing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      {hsSyncing ? "Sincronizando..." : "Sincronizar"}
                    </button>
                  )}
                  {hsResult && (
                    <div role={hsResult.error ? "alert" : "status"} className="text-[11px] rounded-md px-2 py-1.5" style={{ background: hsResult.error ? "#fee2e222" : "var(--accent-dim)", color: hsResult.error ? "#ef4444" : "var(--primary)" }}>
                      {hsResult.error
                        ? hsResult.error
                        : `Creados: ${hsResult.created ?? 0} · Actualizados: ${hsResult.updated ?? 0}`}
                    </div>
                  )}
                </div>
              );
            }

            if (i.id === "granola") {
              return (
                <div key={i.id} role="article" aria-label="Integracion Granola: transcripts de reuniones" className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 col-span-full sm:col-span-2 lg:col-span-2">
                  <div className="flex gap-4">
                    <div
                      className="h-11 w-11 rounded-lg flex items-center justify-center text-base font-bold shrink-0"
                      style={{ background: i.color + "22", color: i.color }}
                    >
                      {i.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{i.name}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                        Transcripts de reuniones
                      </div>
                    </div>
                  </div>
                  {!granolaAvailable ? (
                    <div className="text-[11px] text-muted-foreground">
                      Granola no está disponible en este entorno.
                    </div>
                  ) : (
                    <button
                      onClick={loadGranolaTranscripts}
                      disabled={granolaLoading}
                      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md self-start"
                      style={{
                        background: "var(--accent-dim)",
                        color: "var(--primary)",
                        opacity: granolaLoading ? 0.6 : 1,
                        cursor: granolaLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      {granolaLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <FileText className="h-3 w-3" />
                      )}
                      {granolaLoading ? "Cargando..." : "Ver transcripts"}
                    </button>
                  )}
                  {granolaTranscripts !== null && granolaTranscripts.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">No se encontraron transcripts.</p>
                  )}
                  {granolaTranscripts !== null && granolaTranscripts.length > 0 && (
                    <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                      {granolaTranscripts.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => toggleTranscript(t.id)}
                          aria-checked={granolaSelected.has(t.id)}
                          aria-label={`${granolaSelected.has(t.id) ? "Deseleccionar" : "Seleccionar"} transcript: ${t.title}`}
                          role="checkbox"
                          className="flex items-start gap-2 text-left px-2 py-1.5 rounded-md hover:bg-surface-2 transition-colors"
                        >
                          {granolaSelected.has(t.id) ? (
                            <CheckSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--primary)" }} />
                          ) : (
                            <Square className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium truncate">{t.title}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {t.date}{t.participants.length ? ` · ${t.participants.slice(0, 2).join(", ")}` : ""}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {granolaSelected.size > 0 && (
                    <button
                      onClick={importSelected}
                      disabled={granolaImporting}
                      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md self-start"
                      style={{
                        background: "var(--accent-dim)",
                        color: "var(--primary)",
                        opacity: granolaImporting ? 0.6 : 1,
                        cursor: granolaImporting ? "not-allowed" : "pointer",
                      }}
                    >
                      {granolaImporting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3" />
                      )}
                      {granolaImporting ? "Importando..." : `Importar ${granolaSelected.size} seleccionado${granolaSelected.size > 1 ? "s" : ""}`}
                    </button>
                  )}
                  {granolaResult && (
                    <div className="text-[11px] rounded-md px-2 py-1.5" style={{ background: granolaResult.error ? "#fee2e222" : "var(--accent-dim)", color: granolaResult.error ? "#ef4444" : "var(--primary)" }}>
                      {granolaResult.error
                        ? granolaResult.error
                        : `Importados: ${granolaResult.imported ?? 0} · Omitidos: ${granolaResult.skipped ?? 0}`}
                    </div>
                  )}
                </div>
              );
            }

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
