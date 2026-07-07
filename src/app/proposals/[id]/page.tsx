"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  FileDown,
  Pencil,
  Check,
  ChevronDown,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  DollarSign,
  Copy,
  ListChecks,
  MoreHorizontal,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProposalRenderer } from "@/components/proposals/ProposalRenderer";
import {
  ProposalContentEditor,
  type EditableProposal,
} from "@/components/proposals/ProposalContentEditor";
import {
  toRenderData,
  type ProposalRenderData,
  type ProposalRowLike,
} from "@/components/proposals";
import {
  PROPOSAL_STATUSES,
  statusMeta,
  modeLabel,
  modeColor,
} from "@/components/proposals/status";
import { ProposalChatPanel } from "@/components/proposals/ProposalChatPanel";
import { ProposalChecklistPanel } from "@/components/proposals/ProposalChecklistPanel";
import { ProposalVersionsMenu } from "@/components/proposals/ProposalVersionsMenu";
import { ProposalLinkContact } from "@/components/proposals/ProposalLinkContact";
import { ProposalSummaryEmailDialog } from "@/components/proposals/ProposalSummaryEmailDialog";
import { ProposalSendDialog } from "@/components/proposals/ProposalSendDialog";
import { ProposalHtmlView } from "@/components/proposals/ProposalHtmlView";
import type { ProposalStatus } from "@/types";
import type { SerializedProposal } from "@/lib/proposals";

// La fila serializada incluye el estado de la generacion IA (background) y los
// timestamps en epoch ms (los usa el contador de progreso de la generacion).
type ProposalRow = ProposalRowLike & {
  contactId?: string | null;
  genStatus?: string | null;
  genError?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
};

// Formatea segundos a "m:ss" para el contador de progreso de la generacion.
function fmtElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

export default function ProposalDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const searchParams = useSearchParams();
  // ?edit=1 (desde el boton "Editar" del listado /proposals): abre el editor
  // de contenido apenas carga, sin pasar primero por la vista previa. Ref (no
  // state) para que dispare UNA sola vez al llegar el primer dato, y no
  // reabra el editor si el usuario lo cierra y despues el chat actualiza `data`.
  const autoEditPending = useRef(searchParams.get("edit") === "1");

  const [row, setRow] = useState<ProposalRow | null>(null);
  const [data, setData] = useState<ProposalRenderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [showChecklist, setShowChecklist] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  // La IA deja el pricing en null a proposito (no inventa montos). Este form
  // permite cargarlo a mano sobre la propuesta ya generada, sin re-generar.
  const [priceForm, setPriceForm] = useState({
    currency: "USD",
    monthlyMin: "",
    monthlyMax: "",
    total: "",
    startDate: "",
    // Clausula de incorporacion directa al payroll (solo staff-aug, opcional).
    // Siempre pago unico (17% anualizado, sin cuotas): regla de voz de Niuro.
    absorptionEnabled: false,
  });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Si un poll (no inicial) falla, cortamos el polling para no reintentar
  // infinito: el effect lee este flag ademas de genStatus.
  const [pollFailed, setPollFailed] = useState(false);
  // Reloj que avanza cada segundo solo mientras se genera, para el contador
  // "Lleva m:ss" del progreso. Se detiene cuando la generacion termina.
  const [now, setNow] = useState(() => Date.now());

  // initial=true muestra el spinner de carga; los polls posteriores son silenciosos.
  const load = useCallback(
    async (initial = false) => {
      if (!id) return;
      if (initial) setLoading(true);
      try {
        const res = await fetch(`/api/proposals/${id}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = (await res.json()) as ProposalRow;
        setRow(json);
        setData(toRenderData(json));
      } catch {
        if (initial) {
          toast.error("No se pudo cargar la propuesta");
        } else {
          // Falla en un poll de fondo: detener el polling y avisar una vez.
          setPollFailed(true);
          toast.error("Se perdio la conexion mientras se generaba. Refresca para reintentar.");
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

  // ?edit=1: abre el editor de contenido apenas hay datos listos (una sola vez).
  useEffect(() => {
    if (autoEditPending.current && data) {
      setEditingContent(true);
      autoEditPending.current = false;
    }
  }, [data]);

  // Polling: mientras la IA genera en background, refrescamos cada 5s. Se DETIENE
  // cuando genStatus deja de ser 'generating' (ready/error) o si un poll fallo.
  useEffect(() => {
    if (row?.genStatus === "generating" && !pollFailed) {
      pollRef.current = setTimeout(() => load(false), 5000);
      return () => {
        if (pollRef.current) clearTimeout(pollRef.current);
      };
    }
  }, [row, load, pollFailed]);

  // Reloj de progreso: tick cada 1s solo durante la generacion (para el contador).
  useEffect(() => {
    if (row?.genStatus !== "generating") return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [row?.genStatus]);

  const changeStatus = useCallback(
    async (status: ProposalStatus) => {
      if (!id || updating) return;
      setUpdating(true);
      setStatusOpen(false);
      try {
        const res = await fetch(`/api/proposals/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "No se pudo cambiar el estado");
        toast.success(`Estado: ${statusMeta(status).label}`);
        setRow((prev) => (prev ? { ...prev, status } : prev));
        setData((prev) => (prev ? { ...prev, status } : prev));
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
      const res = await fetch(`/api/proposals/${id}/regenerate`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo reintentar");
      toast.success("Reintentando la generacion...");
      setRow((prev) => (prev ? { ...prev, genStatus: "generating", genError: null } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al reintentar");
    } finally {
      setRetrying(false);
    }
  }, [id, retrying]);

  // Guarda SOLO el pricing via PUT (no regenera, no cambia status). El render del
  // viewer (SummarySection) muestra el highlight de inversion en cuanto hay monto.
  const savePricing = useCallback(async () => {
    if (!id || savingPrice) return;
    setSavingPrice(true);
    try {
      // Tolerante a "$", separadores de miles y espacios; vacio -> null.
      const num = (s: string): number | null => {
        const digits = s.replace(/[^\d]/g, "");
        if (!digits) return null;
        const n = parseInt(digits, 10);
        return Number.isFinite(n) ? n : null;
      };
      const pricing =
        row?.mode === "sprint"
          ? {
              currency: priceForm.currency,
              total: num(priceForm.total),
              iva: true,
              startDate: priceForm.startDate || null,
            }
          : {
              currency: priceForm.currency,
              monthlyMin: num(priceForm.monthlyMin),
              monthlyMax: num(priceForm.monthlyMax),
              iva: true,
              // installments fijo en 1: la clausula siempre es pago unico.
              absorption: { enabled: priceForm.absorptionEnabled, installments: 1 as const },
            };
      const res = await fetch(`/api/proposals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo guardar el precio");
      setRow(json);
      setData(toRenderData(json));
      setPricingOpen(false);
      toast.success("Precio actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el precio");
    } finally {
      setSavingPrice(false);
    }
  }, [id, savingPrice, row, priceForm]);

  const duplicate = useCallback(async () => {
    if (!id || duplicating) return;
    setDuplicating(true);
    try {
      const res = await fetch(`/api/proposals/${id}/duplicate`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo duplicar");
      toast.success("Propuesta duplicada");
      router.push(`/proposals/${json.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al duplicar");
      setDuplicating(false);
    }
  }, [id, duplicating, router]);

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
          <p>No encontramos esta propuesta.</p>
          <Link
            href="/proposals"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-3")}
          >
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  const clientName = data?.client?.name || "Cliente por confirmar";

  // ── Estado: generando en background ──────────────────────────────────────
  if (row.genStatus === "generating") {
    // Tiempo transcurrido desde que arranco la generacion (createdAt, o
    // updatedAt si un reintento la reseteo). Solo display relativo.
    const startedAt = row.createdAt ?? row.updatedAt ?? null;
    const elapsedSec = startedAt != null ? (now - startedAt) / 1000 : null;
    return (
      <div className="h-full grid place-items-center px-6">
        <div className="max-w-md text-center flex flex-col items-center gap-4">
          <div className="relative">
            <Sparkles className="h-10 w-10 text-primary" />
            <Loader2 className="h-16 w-16 text-primary/30 animate-spin absolute -top-3 -left-3" />
          </div>
          <h1 className="text-lg font-semibold">Generando la propuesta</h1>
          <p className="text-sm text-muted-foreground">
            La IA esta redactando la propuesta completa para{" "}
            <span className="font-medium text-foreground">{clientName}</span>. La pantalla se
            actualiza sola cuando este lista; podes irte a otra seccion mientras tanto.
          </p>
          {elapsedSec != null && (
            <p className="text-[13px] text-muted-foreground">
              Lleva{" "}
              <span className="font-medium text-foreground tabular-nums">
                {fmtElapsed(elapsedSec)}
              </span>
              , suele tardar unos 4 minutos.
            </p>
          )}
          <p className="text-[12.5px] text-muted-foreground">
            Mientras esperas, podes adelantar el mail de resumen del requerimiento:
          </p>
          <div className="flex items-center gap-2 mt-1">
            <ProposalSummaryEmailDialog proposalId={id!} clientName={clientName} />
            <Link href="/proposals" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Volver al listado
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Estado: la generacion fallo ──────────────────────────────────────────
  if (row.genStatus === "error") {
    return (
      <div className="h-full grid place-items-center px-6">
        <div className="max-w-md text-center flex flex-col items-center gap-4">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <h1 className="text-lg font-semibold">No se pudo generar la propuesta</h1>
          <p className="text-sm text-muted-foreground break-words">
            {row.genError || "La generacion con IA fallo. Podes reintentar."}
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
            <ProposalSummaryEmailDialog proposalId={id!} clientName={clientName} />
            <Link
              href="/proposals"
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              Volver al listado
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Estado: lista (ready / manual / migrada) ─────────────────────────────
  if (!data) {
    return (
      <div className="h-full grid place-items-center text-center text-sm text-muted-foreground">
        <div>
          <p>Esta propuesta no tiene contenido para mostrar.</p>
          <Link
            href="/proposals"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-3")}
          >
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  const sm = statusMeta(row.status);
  const mc = modeColor(row.mode);

  // Precarga el form de precio desde el pricing actual (parseado en el GET).
  const openPricing = () => {
    const p = (row.pricing ?? {}) as Record<string, unknown>;
    const absorption = (p.absorption ?? {}) as Record<string, unknown>;
    setPriceForm({
      currency: typeof p.currency === "string" ? p.currency : "USD",
      monthlyMin: p.monthlyMin != null ? String(p.monthlyMin) : "",
      monthlyMax: p.monthlyMax != null ? String(p.monthlyMax) : "",
      total: p.total != null ? String(p.total) : "",
      startDate: typeof p.startDate === "string" ? p.startDate : "",
      absorptionEnabled: absorption.enabled === true,
    });
    setStatusOpen(false);
    setPricingOpen((o) => !o);
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* Toolbar de acciones (no se imprime) */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            onClick={() => router.push("/proposals")}
            title="Volver"
            className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold truncate">{clientName}</div>
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span
                className="rounded-md px-1.5 py-0.5 font-medium"
                style={{
                  background: `color-mix(in srgb, ${mc} 12%, transparent)`,
                  color: mc,
                }}
              >
                {modeLabel(row.mode)}
              </span>
              {row.date && <span>{row.date}</span>}
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {/* Cambiar estado */}
            <div className="relative">
              <button
                onClick={() => setStatusOpen((o) => !o)}
                disabled={updating}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "cursor-pointer",
                )}
                style={{ color: sm.color }}
              >
                {updating ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : null}
                {sm.label}
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </button>
              {statusOpen && (
                <div className="absolute right-0 mt-1 w-44 rounded-xl border border-border bg-popover shadow-lg py-1 z-20">
                  {PROPOSAL_STATUSES.map((s) => {
                    const meta = statusMeta(s);
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
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: meta.color }}
                        />
                        {meta.label}
                        {active && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Precio (carga manual de montos, la IA no los inventa) */}
            <div className="relative">
              <button
                onClick={openPricing}
                disabled={savingPrice}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
              >
                {savingPrice ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <DollarSign className="h-3.5 w-3.5 mr-1" />
                )}
                Precio
              </button>
              {pricingOpen && (
                <div className="absolute right-0 mt-1 w-64 rounded-xl border border-border bg-popover shadow-lg p-3 z-20 space-y-2">
                  <div className="text-[12px] font-medium text-muted-foreground">
                    {row.mode === "sprint"
                      ? "Precio cerrado del sprint"
                      : "Inversion mensual (staff aug)"}
                  </div>
                  <label className="block text-[12px] text-muted-foreground">
                    Moneda
                    <select
                      value={priceForm.currency}
                      onChange={(e) => setPriceForm((f) => ({ ...f, currency: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] text-foreground"
                    >
                      {["USD", "CLP", "MXN", "EUR"].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  {row.mode === "sprint" ? (
                    <>
                      <label className="block text-[12px] text-muted-foreground">
                        Total
                        <input
                          inputMode="numeric"
                          value={priceForm.total}
                          onChange={(e) => setPriceForm((f) => ({ ...f, total: e.target.value }))}
                          placeholder="Ej: 30000"
                          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] text-foreground"
                        />
                      </label>
                      <label className="block text-[12px] text-muted-foreground">
                        Fecha de inicio (opcional)
                        <input
                          type="date"
                          value={priceForm.startDate}
                          onChange={(e) => setPriceForm((f) => ({ ...f, startDate: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] text-foreground"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="block text-[12px] text-muted-foreground">
                        Mensual minimo
                        <input
                          inputMode="numeric"
                          value={priceForm.monthlyMin}
                          onChange={(e) => setPriceForm((f) => ({ ...f, monthlyMin: e.target.value }))}
                          placeholder="Ej: 4500"
                          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] text-foreground"
                        />
                      </label>
                      <label className="block text-[12px] text-muted-foreground">
                        Mensual maximo (opcional)
                        <input
                          inputMode="numeric"
                          value={priceForm.monthlyMax}
                          onChange={(e) => setPriceForm((f) => ({ ...f, monthlyMax: e.target.value }))}
                          placeholder="Ej: 5500"
                          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] text-foreground"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-[12px] text-foreground pt-1 border-t border-border">
                        <input
                          type="checkbox"
                          checked={priceForm.absorptionEnabled}
                          onChange={(e) =>
                            setPriceForm((f) => ({ ...f, absorptionEnabled: e.target.checked }))
                          }
                          className="cursor-pointer"
                        />
                        Cláusula de incorporación directa al payroll (17% anualizado, pago único)
                      </label>
                    </>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => setPricingOpen(false)}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer")}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={savePricing}
                      disabled={savingPrice}
                      className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer")}
                    >
                      {savingPrice ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                      Guardar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!row.contactId && (
              <ProposalLinkContact
                proposalId={id!}
                onLinked={(c) => setRow((prev) => (prev ? { ...prev, contactId: c.id } : prev))}
              />
            )}

            <ProposalVersionsMenu
              proposalId={id!}
              onRestored={(json) => {
                setRow(json as ProposalRow);
                setData(toRenderData(json as ProposalRowLike));
              }}
            />

            {/* Editar contenido (in-place, sin regenerar) */}
            <button
              onClick={() => {
                setStatusOpen(false);
                setPricingOpen(false);
                setEditingContent(true);
              }}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer")}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
            </button>

            {/* Exportar PDF: descarga por blob (no target=_blank). En el webview
                de la .app un <a target=_blank> a un endpoint no dispara descarga;
                fetch + createObjectURL + a.download si funciona en todos lados. */}
            <button
              onClick={async () => {
                if (downloadingPdf) return;
                setDownloadingPdf(true);
                try {
                  const res = await fetch(`/api/proposals/${id}/pdf`);
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
                  a.download = m ? m[1] : "propuesta-niuro.pdf";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error al descargar el PDF");
                } finally {
                  setDownloadingPdf(false);
                }
              }}
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

            {/* Mas: acciones secundarias agrupadas para no saturar la barra. */}
            <div className="relative">
              <button
                onClick={() => {
                  setStatusOpen(false);
                  setPricingOpen(false);
                  setMoreOpen((o) => !o);
                }}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
              >
                <MoreHorizontal className="h-3.5 w-3.5 mr-1" /> Más
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </button>
              {moreOpen && (
                <div className="absolute right-0 mt-1 w-56 rounded-xl border border-border bg-popover shadow-lg py-1 z-20">
                  {/* Mail de resumen abre su propio dialog (modal), no rompe el menu. */}
                  <ProposalSummaryEmailDialog proposalId={id!} clientName={clientName} asMenuItem />
                  <button
                    onClick={() => {
                      setShowChecklist((v) => !v);
                      setMoreOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 cursor-pointer hover:bg-muted"
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    {showChecklist ? "Ocultar checklist" : "Checklist"}
                  </button>
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      duplicate();
                    }}
                    disabled={duplicating}
                    className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 cursor-pointer hover:bg-muted disabled:opacity-50"
                  >
                    {duplicating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Duplicar
                  </button>
                  <Link
                    href={`/proposals/new?id=${id}`}
                    className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 cursor-pointer hover:bg-muted"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Regenerar
                  </Link>
                </div>
              )}
            </div>

            <ProposalSendDialog proposalId={id!} clientName={clientName} />
          </div>
        </div>
      </div>

      {/* Render de la propuesta (o editor de contenido in-place) */}
      {editingContent ? (
        <ProposalContentEditor
          proposal={row as unknown as EditableProposal}
          onCancel={() => setEditingContent(false)}
          onSaved={(json) => {
            setRow(json as ProposalRow);
            setData(toRenderData(json as ProposalRowLike));
            setEditingContent(false);
          }}
        />
      ) : (
        <div className="flex flex-col md:flex-row gap-4 p-4 md:p-6 max-w-[1400px] mx-auto">
          {/* Panel lateral: chat de ajustes + checklist. Sticky en desktop para
              que quede a la vista mientras se scrollea la propuesta larga. */}
          <div className="md:w-[320px] shrink-0 flex flex-col gap-3 md:sticky md:top-[76px] md:max-h-[calc(100vh-96px)]">
            <div className="min-h-[320px] md:flex-1">
              <ProposalChatPanel
                proposalId={id!}
                onUpdated={(json) => {
                  setRow(json as ProposalRow);
                  setData(toRenderData(json as ProposalRowLike));
                }}
              />
            </div>
            {showChecklist && (
              <ProposalChecklistPanel proposal={row as unknown as SerializedProposal} />
            )}
          </div>

          {/* Contenido principal: vista previa renderizada o codigo HTML. */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-3 rounded-lg border border-border p-0.5 w-fit">
              <button
                onClick={() => setActiveTab("preview")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[12.5px] font-medium cursor-pointer",
                  activeTab === "preview" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                )}
              >
                Vista previa
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[12.5px] font-medium cursor-pointer",
                  activeTab === "code" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                )}
              >
                Codigo HTML
              </button>
            </div>

            {activeTab === "preview" ? (
              // Lienzo: la hoja (.proposal-doc ya tiene max-width 880 + margin
              // auto) flota sobre un fondo tenue con aire y scroll propio, como
              // un editor de documentos.
              <div className="rounded-xl bg-muted/40 border border-border p-4 md:p-8 overflow-auto max-h-[calc(100vh-170px)]">
                <ProposalRenderer proposal={data} />
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden h-[calc(100vh-220px)]">
                <ProposalHtmlView
                  proposalId={id!}
                  role={row.role}
                  mode={row.mode ?? "staff-aug"}
                  clientName={clientName}
                  createdAt={row.createdAt}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
