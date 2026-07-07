"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  FileDown,
  Check,
  ChevronDown,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  MoreHorizontal,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  JobDescriptionRenderer,
  type JdRenderData,
} from "@/components/job-descriptions/JobDescriptionRenderer";
import { JobDescriptionChatPanel } from "@/components/job-descriptions/JobDescriptionChatPanel";
import { JobDescriptionViabilityBanner } from "@/components/job-descriptions/JobDescriptionViabilityBanner";
import { JOB_DESCRIPTION_STATUSES, jdStatusMeta } from "@/components/job-descriptions/status";
import type { JobDescriptionStatus, JobDescriptionViability } from "@/types";

// La fila serializada de GET /api/job-descriptions/[id]: JdRenderData + metadata.
type JdRow = JdRenderData & {
  id: string;
  status: string | null;
  genStatus?: string | null;
  genError?: string | null;
  viability: JobDescriptionViability | null;
  createdAt?: number | null;
  updatedAt?: number | null;
};

function fmtElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function JobDescriptionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [row, setRow] = useState<JdRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (initial = false) => {
      if (!id) return;
      if (initial) setLoading(true);
      try {
        const res = await fetch(`/api/job-descriptions/${id}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        setRow((await res.json()) as JdRow);
      } catch {
        if (initial) {
          toast.error("No se pudo cargar la descripción de cargo");
        } else {
          setPollFailed(true);
          toast.error("Se perdió la conexión mientras se generaba. Refrescá para reintentar.");
        }
      } finally {
        if (initial) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  // Polling mientras la IA genera en background.
  useEffect(() => {
    if (row?.genStatus === "generating" && !pollFailed) {
      pollRef.current = setTimeout(() => load(false), 5000);
      return () => {
        if (pollRef.current) clearTimeout(pollRef.current);
      };
    }
  }, [row, load, pollFailed]);

  // Reloj de progreso durante la generación.
  useEffect(() => {
    if (row?.genStatus !== "generating") return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [row?.genStatus]);

  const changeStatus = useCallback(
    async (status: JobDescriptionStatus) => {
      if (!id || updating) return;
      setUpdating(true);
      setStatusOpen(false);
      try {
        const res = await fetch(`/api/job-descriptions/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "No se pudo cambiar el estado");
        toast.success(`Estado: ${jdStatusMeta(status).label}`);
        setRow((prev) => (prev ? { ...prev, status } : prev));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al cambiar estado");
      } finally {
        setUpdating(false);
      }
    },
    [id, updating],
  );

  const retry = useCallback(async () => {
    if (!id || retrying) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/job-descriptions/${id}/regenerate`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo reintentar");
      toast.success("Reintentando la generación...");
      setRow((prev) => (prev ? { ...prev, genStatus: "generating", genError: null } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al reintentar");
    } finally {
      setRetrying(false);
    }
  }, [id, retrying]);

  const downloadPdf = useCallback(async () => {
    if (!id || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/job-descriptions/${id}/pdf`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "No se pudo generar el PDF");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m ? m[1] : "descripcion-de-cargo-niuro.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al descargar el PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }, [id, downloadingPdf]);

  if (loading) {
    return (
      <div className="h-full grid place-items-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (notFound || !row) {
    return (
      <div className="h-full grid place-items-center text-center text-sm text-muted-foreground">
        <div>
          <p>No encontramos esta descripción de cargo.</p>
          <Link
            href="/job-descriptions"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-3")}
          >
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  const clientName = row.client?.name || "Empresa por confirmar";

  // ── Estado: generando ────────────────────────────────────────────────────
  if (row.genStatus === "generating") {
    const startedAt = row.createdAt ?? row.updatedAt ?? null;
    const elapsedSec = startedAt != null ? (now - startedAt) / 1000 : null;
    return (
      <div className="h-full grid place-items-center px-6">
        <div className="max-w-md text-center flex flex-col items-center gap-4">
          <div className="relative">
            <Sparkles className="h-10 w-10 text-primary" />
            <Loader2 className="h-16 w-16 text-primary/30 animate-spin absolute -top-3 -left-3" />
          </div>
          <h1 className="text-lg font-semibold">Generando la descripción de cargo</h1>
          <p className="text-sm text-muted-foreground">
            La IA está aterrizando el rol y redactando la descripción para{" "}
            <span className="font-medium text-foreground">{clientName}</span>. La pantalla se
            actualiza sola cuando esté lista.
          </p>
          {elapsedSec != null && (
            <p className="text-[13px] text-muted-foreground">
              Lleva{" "}
              <span className="font-medium text-foreground tabular-nums">{fmtElapsed(elapsedSec)}</span>
              , suele tardar menos de un minuto.
            </p>
          )}
          <Link
            href="/job-descriptions"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-1")}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  // ── Estado: error ────────────────────────────────────────────────────────
  if (row.genStatus === "error") {
    return (
      <div className="h-full grid place-items-center px-6">
        <div className="max-w-md text-center flex flex-col items-center gap-4">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold">No se pudo generar la descripción</h1>
          <p className="text-sm text-muted-foreground break-words">
            {row.genError || "La generación con IA falló. Podés reintentar."}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={retry}
              disabled={retrying}
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer")}
            >
              {retrying ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Reintentar
            </button>
            <Link
              href="/job-descriptions"
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              Volver al listado
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const sm = jdStatusMeta(row.status);

  // ── Estado: lista ────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            onClick={() => router.push("/job-descriptions")}
            title="Volver"
            className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold truncate">
              {row.roleTitle || clientName}
            </div>
            <div className="text-[12px] text-muted-foreground truncate">{clientName}</div>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {/* Cambiar estado */}
            <div className="relative">
              <button
                onClick={() => {
                  setMoreOpen(false);
                  setStatusOpen((o) => !o);
                }}
                disabled={updating}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
                style={{ color: sm.color }}
              >
                {updating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                {sm.label}
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </button>
              {statusOpen && (
                <div className="absolute right-0 mt-1 w-44 rounded-xl border border-border bg-popover shadow-lg py-1 z-20">
                  {JOB_DESCRIPTION_STATUSES.map((s) => {
                    const meta = jdStatusMeta(s);
                    const active = s === row.status;
                    return (
                      <button
                        key={s}
                        onClick={() => changeStatus(s)}
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-[13px] flex items-center gap-2 cursor-pointer hover:bg-muted",
                          active && "font-medium",
                        )}
                      >
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: meta.color }} />
                        {meta.label}
                        {active && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Exportar PDF (descarga por blob) */}
            <button
              onClick={downloadPdf}
              disabled={downloadingPdf}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
            >
              {downloadingPdf ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5 mr-1.5" />
              )}
              PDF
            </button>

            {/* Más: acciones secundarias */}
            <div className="relative">
              <button
                onClick={() => {
                  setStatusOpen(false);
                  setMoreOpen((o) => !o);
                }}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
              >
                <MoreHorizontal className="h-3.5 w-3.5 mr-1" /> Más
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </button>
              {moreOpen && (
                <div className="absolute right-0 mt-1 w-52 rounded-xl border border-border bg-popover shadow-lg py-1 z-20">
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      retry();
                    }}
                    disabled={retrying}
                    className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 cursor-pointer hover:bg-muted disabled:opacity-50"
                  >
                    {retrying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Regenerar desde la transcripción
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 p-4 md:p-6 max-w-[1400px] mx-auto">
        {/* Panel lateral: chat de ajustes (sticky en desktop). */}
        <div className="md:w-[320px] shrink-0 flex flex-col gap-3 md:sticky md:top-[76px] md:max-h-[calc(100vh-96px)]">
          <div className="min-h-[320px] md:flex-1">
            <JobDescriptionChatPanel
              jobDescriptionId={id!}
              onUpdated={(json) => setRow(json as JdRow)}
            />
          </div>
        </div>

        {/* Contenido principal: banner de viabilidad (interno) + preview. */}
        <div className="flex-1 min-w-0 space-y-3">
          <JobDescriptionViabilityBanner viability={row.viability} />
          {/* Lienzo: la hoja flota sobre un fondo tenue con scroll propio. */}
          <div className="rounded-xl bg-muted/40 border border-border p-4 md:p-8 overflow-auto max-h-[calc(100vh-170px)]">
            <div className="mx-auto max-w-[820px] rounded-md shadow-sm" style={{ background: "#FFFFFF" }}>
              <div className="p-8">
                <JobDescriptionRenderer jd={row} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
