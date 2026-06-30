"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Sparkles,
  Check,
  X,
  Phone,
  ArrowRight,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Flame,
  Thermometer,
  Snowflake,
  Loader2,
  Archive,
  RotateCcw,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Candidate {
  id: string;
  name: string;
  phone: string | null;
  chatJid: string;
  score: number;
  temperature: "cold" | "warm" | "hot";
  reason: string | null;
  nextAction: string | null;
  breakdown: string | null;
}

interface Counts {
  hot: number;
  warm: number;
  cold: number;
}

const DIMS: { key: string; label: string; max: number }[] = [
  { key: "intention", label: "Int", max: 35 },
  { key: "authority", label: "Aut", max: 20 },
  { key: "need", label: "Nec", max: 20 },
  { key: "urgency", label: "Urg", max: 15 },
  { key: "budget", label: "Pre", max: 10 },
];

function Breakdown({ raw }: { raw: string | null }) {
  if (!raw) return null;
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(raw);
  } catch {
    return null;
  }
  const signals = (b.signals ?? null) as Record<string, unknown> | null;
  return (
    <div className="mt-2 space-y-1.5">
      {signals && (
        <div className="flex flex-wrap gap-1.5">
          {signals.companyToken ? (
            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              Empresa: {String(signals.companyTokenText ?? "")}
            </span>
          ) : null}
          {signals.ownerSelling ? (
            <span
              title={`${signals.ownerSellKw ?? 0} señales de venta`}
              className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
            >
              Operador vendiendo
            </span>
          ) : null}
          {typeof signals.docsSent === "number" && signals.docsSent > 0 ? (
            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground">
              Propuesta/JD ({signals.docsSent})
            </span>
          ) : null}
          {signals.reciprocity ? (
            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              Reciprocidad
            </span>
          ) : null}
          {signals.refinedBy === "criterio" ? (
            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
              Criterio
            </span>
          ) : null}
          {signals.override ? (
            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300">
              Descartado: {String(signals.override)}
            </span>
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {DIMS.map((d) => {
          const v = Number(b[d.key] ?? b[d.key.replace("y", "ión")] ?? 0);
          const full = v >= d.max;
          const zero = v === 0;
          return (
            <span
              key={d.key}
              title={`${d.label} ${v}/${d.max}`}
              className={cn(
                "text-[11px] px-1.5 py-0.5 rounded font-medium tabular-nums",
                zero
                  ? "bg-muted text-muted-foreground/50"
                  : full
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {d.label} {v}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const TABS: { key: "hot" | "warm" | "cold"; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "hot", label: "Calientes", icon: Flame },
  { key: "warm", label: "Tibios", icon: Thermometer },
  { key: "cold", label: "Frios", icon: Snowflake },
];

const TEMP_STYLE: Record<string, { badge: string; border: string }> = {
  hot: {
    badge: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    border: "border-red-200/30 dark:border-red-900/30",
  },
  warm: {
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
    border: "border-orange-200/30 dark:border-orange-900/30",
  },
  cold: {
    badge: "bg-muted text-muted-foreground",
    border: "",
  },
};

const PAGE_SIZE = 50;

export function LeadCandidates() {
  const [tab, setTab] = useState<"hot" | "warm" | "cold">("hot");
  const [items, setItems] = useState<Candidate[]>([]);
  const [counts, setCounts] = useState<Counts>({ hot: 0, warm: 0, cold: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadCounts = useCallback(() => {
    fetch("/api/whatsapp/candidates?status=pending&count=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { temperature: string; count: number }[]) => {
        const c: Counts = { hot: 0, warm: 0, cold: 0 };
        for (const row of rows) {
          if (row.temperature === "hot") c.hot = row.count;
          if (row.temperature === "warm") c.warm = row.count;
          if (row.temperature === "cold") c.cold = row.count;
        }
        setCounts(c);
      })
      .catch(() => {});
  }, []);

  const loadItems = useCallback(
    (t: "hot" | "warm" | "cold", p: number) => {
      setLoading(true);
      fetch(
        `/api/whatsapp/candidates?status=pending&temperature=${t}&limit=${PAGE_SIZE}&offset=${p * PAGE_SIZE}`
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setItems(Array.isArray(d) ? d : []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Un solo efecto (auditoría 2026-06-09): los dos efectos anteriores disparaban
  // hasta 3 cargas por cambio de tab (tab → load, page vieja → load, page=0 → load).
  const prevTab = useRef(tab);
  useEffect(() => {
    const tabChanged = prevTab.current !== tab;
    prevTab.current = tab;
    if (tabChanged) {
      setSelected(new Set());
      if (page !== 0) {
        setPage(0); // el re-render con page=0 hace la única carga
        return;
      }
    }
    loadItems(tab, page);
  }, [tab, page, loadItems]);

  const refresh = () => {
    loadCounts();
    loadItems(tab, page);
    setSelected(new Set());
  };

  const act = async (id: string, action: "approve" | "dismiss", name: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/whatsapp/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      toast.success(action === "approve" ? `${name} agregado a Contactos` : `${name} descartado`);
      setItems((prev) => prev.filter((c) => c.id !== id));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setCounts((prev) => ({ ...prev, [tab]: Math.max(0, prev[tab] - 1) }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  const bulkDismiss = async (ids?: string[]) => {
    setBulkBusy(true);
    try {
      const body = ids
        ? { ids, action: "dismiss" }
        : { action: "dismiss", temperature: tab };
      const res = await fetch("/api/whatsapp/candidates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const count = ids ? ids.length : counts[tab];
      toast.success(`${count} leads descartados`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((c) => c.id)));
    }
  };

  const totalPages = Math.ceil(counts[tab] / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-emerald-500" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight leading-tight">Leads detectados</h1>
            <p className="text-sm text-muted-foreground">
              {counts.hot + counts.warm + counts.cold} pendientes de revisar
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="cursor-pointer">
          Actualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border border-border rounded-xl p-1 bg-muted/30 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
              tab === key
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            <span
              className={cn(
                "text-[11px] px-1.5 py-0.5 rounded-full font-semibold tabular-nums",
                tab === key && key === "hot"
                  ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                  : tab === key && key === "warm"
                  ? "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"
                  : tab === key
                  ? "bg-muted text-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Bulk actions bar */}
      {items.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={toggleAll}
            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer underline underline-offset-2"
          >
            {selected.size === items.length ? "Deseleccionar todo" : `Seleccionar todos (${items.length})`}
          </button>
          {selected.size > 0 && (
            <>
              <span className="text-muted-foreground text-sm">{selected.size} seleccionados</span>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => bulkDismiss(Array.from(selected))}
                className="cursor-pointer text-destructive hover:text-destructive"
              >
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <X className="h-3.5 w-3.5 mr-1" />}
                Descartar seleccionados
              </Button>
            </>
          )}
          {tab === "cold" && selected.size === 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={() => bulkDismiss()}
              className="cursor-pointer text-destructive hover:text-destructive"
            >
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <X className="h-3.5 w-3.5 mr-1" />}
              Descartar todos los frios ({counts.cold})
            </Button>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center">
          <MessageCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="font-medium">No hay leads {tab === "hot" ? "calientes" : tab === "warm" ? "tibios" : "frios"} pendientes</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {items.map((c) => {
            const style = TEMP_STYLE[c.temperature] || TEMP_STYLE.cold;
            const isSelected = selected.has(c.id);
            return (
              <div
                key={c.id}
                onClick={() => toggleSelect(c.id)}
                className={cn(
                  "border rounded-xl p-4 bg-card flex flex-col sm:flex-row sm:items-start gap-4 cursor-pointer transition-all",
                  isSelected
                    ? "border-emerald-500/50 bg-emerald-950/10 ring-1 ring-emerald-500/20"
                    : cn("border-border hover:border-border/80", style.border)
                )}
              >
                {/* Checkbox */}
                <div className="flex items-start pt-0.5 shrink-0">
                  <div
                    className={cn(
                      "h-4 w-4 rounded border-2 flex items-center justify-center transition-colors",
                      isSelected
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{c.name}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums", style.badge)}>
                      {c.score}
                    </span>
                    {c.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {c.phone}
                      </span>
                    )}
                  </div>
                  {c.reason && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{c.reason}</p>
                  )}
                  <Breakdown raw={c.breakdown} />
                  {c.nextAction && (
                    <p className="text-xs mt-1.5 flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      {c.nextAction}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div
                  className="flex gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    href={`/whatsapp?chat=${encodeURIComponent(c.chatJid)}`}
                    title="Ver conversacion"
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer h-8 px-2")}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </Link>
                  {c.temperature !== "cold" && (
                    <Button
                      size="sm"
                      disabled={busy === c.id}
                      onClick={() => act(c.id, "approve", c.name)}
                      className="cursor-pointer h-8 px-3 text-xs"
                    >
                      {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === c.id}
                    onClick={() => act(c.id, "dismiss", c.name)}
                    className="cursor-pointer h-8 px-3 text-xs text-destructive hover:text-destructive"
                  >
                    {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginacion */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            Pagina {page + 1} de {totalPages} ({counts[tab]} total)
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
