"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, UploadCloud, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageLeadCard, type ImageLead } from "./ImageLeadCard";

export function ImageLeadsImporter() {
  const [leads, setLeads] = useState<ImageLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/image-leads");
      const data = res.ok ? await res.json() : [];
      setLeads(Array.isArray(data) ? data : []);
    } catch {
      toast.error("No se pudieron cargar las capturas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Polling: mientras alguna captura esté 'analyzing', refrescá cada 3s.
  const anyAnalyzing = leads.some((l) => l.status === "analyzing");
  useEffect(() => {
    if (!anyAnalyzing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [anyAnalyzing, load]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) {
        toast.error("Soltá imágenes (PNG, JPG, WebP)");
        return;
      }
      setUploading(true);
      const fd = new FormData();
      images.forEach((f) => fd.append("files", f));
      try {
        const res = await fetch("/api/image-leads/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "No se pudo subir");
        toast.success(`${data.count} captura${data.count === 1 ? "" : "s"} subida${data.count === 1 ? "" : "s"}. Analizando...`);
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al subir");
      } finally {
        setUploading(false);
      }
    },
    [load]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto pb-16">
        <div className="flex items-center gap-3 mb-1">
          <ImagePlus className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Importar leads desde captura</h1>
          <button
            onClick={load}
            title="Actualizar"
            aria-label="Actualizar capturas"
            className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Subí capturas de webs de empresas o startups. La IA evalúa si son cliente potencial de
          Niuro, extrae los datos y te deja revisar antes de aprobarlas como contacto en Prospecto.
        </p>

        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label={uploading ? "Subiendo capturas..." : "Subir capturas de pantalla. Arrastra archivos o presiona Enter para elegir"}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          className={cn(
            "rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors mb-6",
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-surface-2/40"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            aria-hidden="true"
            tabIndex={-1}
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }}
          />
          <div className="flex flex-col items-center gap-2">
            {uploading ? (
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
            ) : (
              <UploadCloud className={cn("h-7 w-7", dragOver ? "text-primary" : "text-muted-foreground")} />
            )}
            <div className="text-sm font-medium">
              {uploading ? "Subiendo..." : "Arrastrá capturas acá o hacé clic para elegir"}
            </div>
            <div className="text-xs text-muted-foreground">PNG, JPG o WebP · podés subir varias a la vez</div>
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div role="status" aria-label="Cargando capturas..." aria-busy="true" className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-36 bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            Todavía no subiste ninguna captura. Empezá arrastrando una arriba.
          </div>
        ) : (
          <div className="space-y-4">
            {leads.map((lead) => (
              <ImageLeadCard key={lead.id} lead={lead} onChange={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
