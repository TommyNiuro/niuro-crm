"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Target, Flame, Radar, AlertTriangle, MessageCircle,
  Check, Clock, ArrowRight, CheckCircle2, X,
} from "lucide-react";
import { Avatar } from "@/components/ds";
import { STAGE_CFG } from "@/lib/crm-ui";
import { cn } from "@/lib/utils";

type MyDayItem = {
  id: string;
  kind: "task_overdue" | "task_today" | "hot_lead" | "radar" | "at_risk";
  title: string;
  subtitle: string;
  contactId?: string;
  contactName?: string;
  taskId?: string;
  chatJid?: string;
  href?: string;
  score?: number;
  stage?: string;
  dueAt?: string | null;
};

type MyDayData = {
  items: MyDayItem[];
  counts: { overdue: number; today: number; hotLeads: number; radar: number; atRisk: number };
};

const KIND_CFG: Record<MyDayItem["kind"], { label: string; icon: typeof Target; color: string }> = {
  task_overdue: { label: "Vencida", icon: AlertTriangle, color: "var(--destructive)" },
  task_today: { label: "Hoy", icon: Target, color: "var(--primary)" },
  hot_lead: { label: "Caliente", icon: Flame, color: "var(--destructive)" },
  radar: { label: "Radar", icon: Radar, color: "var(--info)" },
  at_risk: { label: "Sin paso", icon: AlertTriangle, color: "var(--warning)" },
};

export default function MyDay() {
  const [data, setData] = useState<MyDayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = () =>
    fetch("/api/my-day")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const removeItem = (id: string) =>
    setData((prev) => prev ? { ...prev, items: prev.items.filter((i) => i.id !== id) } : prev);

  const completeTask = async (item: MyDayItem) => {
    if (!item.taskId) return;
    setBusy(item.id);
    try {
      const r = await fetch(`/api/tasks/${item.taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      removeItem(item.id);
      toast.success(`Tarea completada: ${item.title}`);
    } catch {
      toast.error("No se pudo completar la tarea");
    } finally {
      setBusy(null);
    }
  };

  // Acciones del radar sin salir de Inicio: id viene como "radar:<oppId>".
  const setOppStatus = async (item: MyDayItem, status: "contacted" | "discarded") => {
    const oppId = item.id.split(":")[1];
    if (!oppId) return;
    setBusy(item.id);
    try {
      const r = await fetch(`/api/opportunities/${oppId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      removeItem(item.id);
      toast.success(status === "contacted" ? "Marcada como contactada" : "Descartada");
    } catch {
      toast.error("No se pudo actualizar la oportunidad");
    } finally {
      setBusy(null);
    }
  };

  const snoozeTask = async (item: MyDayItem) => {
    if (!item.taskId) return;
    setBusy(item.id);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    try {
      const r = await fetch(`/api/tasks/${item.taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueAt: tomorrow.toISOString() }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      removeItem(item.id);
      toast.success("Tarea pospuesta para mañana");
    } catch {
      toast.error("No se pudo posponer la tarea");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="h-5 w-24 bg-muted rounded animate-pulse mb-3" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const visible = showAll ? data.items : data.items.slice(0, 8);
  const isTask = (k: MyDayItem["kind"]) => k === "task_overdue" || k === "task_today";

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Mi día</h2>
          <span className="text-[11px] text-muted-foreground">
            {data.items.length} acción{data.items.length === 1 ? "" : "es"} pendiente{data.items.length === 1 ? "" : "s"}
          </span>
        </div>
        <Link href="/calendar" className="text-xs text-muted-foreground hover:text-foreground">Ver agenda</Link>
      </div>

      {data.items.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg p-3 bg-primary/5 border border-primary/15">
          <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-[13px]">Día despejado. Buen momento para nutrir cuentas activas o revisar el radar.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {visible.map((item) => {
              const cfg = KIND_CFG[item.kind];
              const stageCfg = item.stage ? STAGE_CFG[item.stage] : null;
              const Icon = cfg.icon;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 px-2 py-2 -mx-2 rounded-lg hover:bg-hover transition-opacity",
                    busy === item.id && "opacity-50 pointer-events-none",
                  )}
                >
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 w-[58px] text-center"
                    style={{ background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`, color: cfg.color }}
                  >
                    {cfg.label}
                  </span>
                  {item.contactName ? (
                    <Avatar name={item.contactName} size={26} />
                  ) : (
                    <Icon className="h-4 w-4 shrink-0" style={{ color: cfg.color }} />
                  )}
                  <div className="flex-1 min-w-0">
                    {item.href ? (
                      <Link href={item.href} className="text-[13px] font-medium truncate block hover:underline">{item.title}</Link>
                    ) : (
                      <span className="text-[13px] font-medium truncate block">{item.title}</span>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground truncate">{item.subtitle}</span>
                      {stageCfg && item.kind !== "at_risk" && (
                        <span className="text-[9px] px-1 py-px rounded shrink-0" style={{ background: stageCfg.bg, color: stageCfg.text }}>{item.stage}</span>
                      )}
                    </div>
                  </div>
                  {item.score != null && item.score > 0 && (
                    <span className="text-[11px] font-semibold rounded px-1.5 py-0.5 bg-primary/10 text-primary tabular-nums shrink-0">{item.score}</span>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    {item.chatJid && (
                      <Link
                        href={`/whatsapp?chat=${encodeURIComponent(item.chatJid)}`}
                        className="p-1.5 rounded hover:bg-surface-3 cursor-pointer"
                        title="Abrir chat"
                      >
                        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
                    )}
                    {isTask(item.kind) && (
                      <>
                        <button
                          onClick={() => snoozeTask(item)}
                          className="p-1.5 rounded hover:bg-surface-3 cursor-pointer"
                          title="Posponer a mañana"
                        >
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => completeTask(item)}
                          className="p-1.5 rounded hover:bg-primary/15 cursor-pointer"
                          title="Marcar completada"
                        >
                          <Check className="h-3.5 w-3.5 text-primary" />
                        </button>
                      </>
                    )}
                    {item.kind === "radar" && (
                      <>
                        <button
                          onClick={() => setOppStatus(item, "discarded")}
                          className="p-1.5 rounded hover:bg-surface-3 cursor-pointer"
                          title="Descartar"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => setOppStatus(item, "contacted")}
                          className="p-1.5 rounded hover:bg-primary/15 cursor-pointer"
                          title="Marcar contactada"
                        >
                          <Check className="h-3.5 w-3.5 text-primary" />
                        </button>
                      </>
                    )}
                    {!isTask(item.kind) && item.href && (
                      <Link href={item.href} className="p-1.5 rounded hover:bg-surface-3 cursor-pointer" title="Ir">
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {data.items.length > 8 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {showAll ? "Mostrar menos" : `Mostrar ${data.items.length - 8} más`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
