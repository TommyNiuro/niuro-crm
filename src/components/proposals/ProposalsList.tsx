"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Plus, RefreshCw, ArrowRight, Building2, Pencil } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { statusMeta, modeLabel, modeColor } from "./status";
import type { ProposalClient } from "@/types";

/* Item del listado tal como lo devuelve GET /api/proposals. Campos JSON pueden
 * venir parseados o como string; client lo normalizamos al render. */
interface ProposalListItem {
  id: string;
  mode: string | null;
  status: string | null;
  date: string | null;
  client: unknown;
  role: string | null;
  duration: string | null;
  createdAt: string | number | null;
  updatedAt: string | number | null;
}

function parseClient(value: unknown): ProposalClient {
  if (value == null) return { name: "" };
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as ProposalClient;
    } catch {
      return { name: value };
    }
  }
  return value as ProposalClient;
}

function fmtDate(value: string | number | null): string {
  if (value == null) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return typeof value === "string" ? value : "";
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ProposalsList() {
  const router = useRouter();
  const [items, setItems] = useState<ProposalListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/proposals");
      const data = res.ok ? await res.json() : [];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error("No se pudieron cargar las propuestas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto pb-16">
        <div className="flex items-center gap-3 mb-1">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Propuestas</h1>
          <button
            onClick={load}
            title="Actualizar"
            className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <Link
            href="/proposals/new"
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nueva propuesta
          </Link>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Propuestas comerciales generadas para los contactos del CRM. Staff Augmentation
          (perfil mensual) o Project Sprint (precio cerrado).
        </p>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Todavia no hay propuestas. Crea la primera con el boton{" "}
            <span className="font-medium text-foreground">Nueva propuesta</span>.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((p) => {
              const client = parseClient(p.client);
              const sm = statusMeta(p.status);
              const mc = modeColor(p.mode);
              const subtitle = p.mode === "sprint" ? p.duration : p.role;
              return (
                <div
                  key={p.id}
                  onClick={() => router.push(`/proposals/${p.id}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/proposals/${p.id}`);
                  }}
                  className="group block rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:shadow-lg hover:border-border/80 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] font-semibold leading-tight truncate flex items-center gap-1.5">
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          {client.name || "Cliente por confirmar"}
                        </h3>
                        <span
                          className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0"
                          style={{
                            background: `color-mix(in srgb, ${sm.color} 14%, transparent)`,
                            color: sm.color,
                          }}
                        >
                          {sm.label}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                        <span
                          className="rounded-md px-1.5 py-0.5 font-medium"
                          style={{
                            background: `color-mix(in srgb, ${mc} 12%, transparent)`,
                            color: mc,
                          }}
                        >
                          {modeLabel(p.mode)}
                        </span>
                        {subtitle && (
                          <span className="truncate max-w-[280px]">{subtitle}</span>
                        )}
                        <span className="text-muted-foreground/70">
                          {p.date || fmtDate(p.createdAt)}
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/proposals/${p.id}?edit=1`}
                      onClick={(e) => e.stopPropagation()}
                      title="Editar contenido"
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-90 transition-opacity mt-1 shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
