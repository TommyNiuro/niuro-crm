"use client";

/* Guardar/listar/restaurar versiones (snapshots manuales). Sin diff visual
 * (no pedido): guardar + restaurar alcanza para deshacer un cambio que no
 * gusto, igual que el "undo" de Cotizador Niuro. */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { History, Loader2, Save, ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VersionRow = { id: string; label: string | null; createdAt: number };

type Props = {
  proposalId: string;
  onRestored: (proposal: unknown) => void;
};

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProposalVersionsMenu({ proposalId, onRestored }: Props) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/versions`);
      const data = res.ok ? await res.json() : [];
      setVersions(Array.isArray(data) ? data : []);
    } catch {
      toast.error("No se pudieron cargar las versiones");
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const saveVersion = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error("No se pudo guardar la version");
      toast.success("Version guardada");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar la version");
    } finally {
      setSaving(false);
    }
  }, [proposalId, load]);

  const restore = useCallback(
    async (versionId: string) => {
      setRestoringId(versionId);
      try {
        const res = await fetch(`/api/proposals/${proposalId}/versions/${versionId}/restore`, {
          method: "POST",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "No se pudo restaurar");
        onRestored(json);
        toast.success("Version restaurada");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al restaurar");
      } finally {
        setRestoringId(null);
      }
    },
    [proposalId, onRestored],
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
      >
        <History className="h-3.5 w-3.5 mr-1" /> Versiones
        <ChevronDown className="h-3.5 w-3.5 ml-1" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 rounded-xl border border-border bg-popover shadow-lg z-20">
          <button
            onClick={saveVersion}
            disabled={saving}
            className="w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 cursor-pointer hover:bg-muted border-b border-border"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar version ahora
          </button>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-3 text-[12.5px] text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando...
              </div>
            ) : versions.length === 0 ? (
              <div className="px-3 py-3 text-[12.5px] text-muted-foreground">
                Todavia no hay versiones guardadas.
              </div>
            ) : (
              versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => restore(v.id)}
                  disabled={restoringId === v.id}
                  className="w-full text-left px-3 py-2 text-[12.5px] flex items-center justify-between gap-2 cursor-pointer hover:bg-muted"
                >
                  <span className="truncate">{v.label || fmt(v.createdAt)}</span>
                  {restoringId === v.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  ) : (
                    <span className="text-[11px] text-primary shrink-0">Restaurar</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
