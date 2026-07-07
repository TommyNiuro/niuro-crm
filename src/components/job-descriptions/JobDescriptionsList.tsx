"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Plus, RefreshCw, ArrowRight, Building2, Loader2, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { jdStatusMeta } from "./status";
import type { JobDescriptionClient } from "@/types";

interface JdListItem {
  id: string;
  status: string | null;
  client: unknown;
  roleTitle: string | null;
  genStatus: string | null;
  createdAt: string | number | null;
}

function parseClient(value: unknown): JobDescriptionClient {
  if (value == null) return { name: "" };
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as JobDescriptionClient;
    } catch {
      return { name: value };
    }
  }
  return value as JobDescriptionClient;
}

function fmtDate(value: string | number | null): string {
  if (value == null) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return typeof value === "string" ? value : "";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

export function JobDescriptionsList() {
  const router = useRouter();
  const [items, setItems] = useState<JdListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/job-descriptions");
      const data = res.ok ? await res.json() : [];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error("No se pudieron cargar las descripciones de cargo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Polling: mientras alguna JD se esté generando, re-fetch cada 4s.
  useEffect(() => {
    const anyGenerating = items.some((i) => i.genStatus === "generating");
    if (anyGenerating) {
      pollRef.current = setTimeout(load, 4000);
      return () => {
        if (pollRef.current) clearTimeout(pollRef.current);
      };
    }
  }, [items, load]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto pb-16">
        <div className="flex items-center gap-3 mb-1">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Descripciones de cargo</h1>
          <button
            onClick={load}
            title="Actualizar"
            className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <Link
            href="/job-descriptions/new"
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nueva descripción
          </Link>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Descripciones de cargo (Job Descriptions) generadas desde las notas de una reunión con
          cliente, en PDF con marca Niuro.
        </p>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Todavía no hay descripciones de cargo. Creá la primera con el botón{" "}
            <span className="font-medium text-foreground">Nueva descripción</span>.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((jd) => {
              const client = parseClient(jd.client);
              const sm = jdStatusMeta(jd.status);
              const generating = jd.genStatus === "generating";
              const failed = jd.genStatus === "error";
              return (
                <div
                  key={jd.id}
                  onClick={() => router.push(`/job-descriptions/${jd.id}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/job-descriptions/${jd.id}`);
                  }}
                  className="group block rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:shadow-lg hover:border-border/80 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] font-semibold leading-tight truncate flex items-center gap-1.5">
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          {client.name || "Empresa por confirmar"}
                        </h3>
                        {generating ? (
                          <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0 inline-flex items-center gap-1 bg-primary/10 text-primary">
                            <Sparkles className="h-2.5 w-2.5" /> Generando
                          </span>
                        ) : failed ? (
                          <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0 bg-destructive/10 text-destructive">
                            Error
                          </span>
                        ) : (
                          <span
                            className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0"
                            style={{
                              background: `color-mix(in srgb, ${sm.color} 14%, transparent)`,
                              color: sm.color,
                            }}
                          >
                            {sm.label}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                        {jd.roleTitle && <span className="truncate max-w-[320px]">{jd.roleTitle}</span>}
                        <span className="text-muted-foreground/70">{fmtDate(jd.createdAt)}</span>
                      </div>
                    </div>
                    {generating ? (
                      <Loader2 className="h-4 w-4 text-primary animate-spin mt-1 shrink-0" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-90 transition-opacity mt-1 shrink-0" />
                    )}
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
