"use client";

/* Nueva descripción de cargo · modo turbo. Flujo: pegar la transcripción/notas
 * de la reunión con el cliente (único campo obligatorio), logo opcional, y
 * listo. La IA extrae empresa/rol/condiciones y genera la JD EN BACKGROUND; el
 * detalle hace polling hasta que esté lista. Espejo lean de ProposalBuilder.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles, ArrowLeft, ImagePlus, X } from "lucide-react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const displayFont = { fontFamily: "'Fraunces', Georgia, serif" } as const;
const monoFont = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" } as const;

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2">
      <span
        style={monoFont}
        className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground"
      >
        {children}
      </span>
      {hint && (
        <span
          style={monoFont}
          className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground shrink-0"
        >
          {hint}
        </span>
      )}
    </div>
  );
}

export default function NewJobDescriptionPage() {
  const router = useRouter();
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [template, setTemplate] = useState<"compact" | "intermediate" | "full">("intermediate");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const acceptLogoFile = useCallback((file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("El logo tiene que ser una imagen (PNG, JPG, SVG, WEBP)");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("El logo pesa más de 2 MB, elegí uno más liviano");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(reader.result as string);
    reader.onerror = () => toast.error("No se pudo leer el logo");
    reader.readAsDataURL(file);
  }, []);

  // Pegar el logo con Cmd+V (ignora si el paste va a un textarea/input).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        acceptLogoFile(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptLogoFile]);

  const generate = useCallback(async () => {
    if (generating) return;
    if (!transcript.trim()) {
      toast.error("Pegá la transcripción o las notas de la reunión");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/job-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          notes: notes.trim() || undefined,
          template,
          logoSrc: logoDataUrl || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo generar la descripción");
      router.push(`/job-descriptions/${json.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar");
      setGenerating(false);
    }
  }, [generating, transcript, notes, template, logoDataUrl, router]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-5 py-8 pb-20">
        <Link
          href="/job-descriptions"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Descripciones de cargo
        </Link>

        <div style={monoFont} className="text-[10.5px] uppercase tracking-[0.16em] text-primary mb-2">
          Nueva descripción de cargo
        </div>
        <h1 style={displayFont} className="text-[30px] leading-tight font-semibold mb-2">
          De la reunión a la Job Description
        </h1>
        <p className="text-sm text-muted-foreground mb-7">
          Pegá las notas o la transcripción de la reunión con el cliente. La IA aterriza el rol,
          arma la descripción con marca Niuro y te la deja lista en PDF (máx 3 páginas).
        </p>

        <div className="space-y-6">
          <div>
            <FieldLabel hint={`${transcript.length} caracteres`}>Transcripción / notas *</FieldLabel>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Pegá acá lo que dijo el cliente: qué rol necesita, stack, seniority, compensación, modalidad, a quién reporta, la cultura del equipo..."
              className="min-h-[220px] text-[13.5px] leading-relaxed"
            />
          </div>

          <div>
            <FieldLabel hint="opcional">Notas adicionales</FieldLabel>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Conclusiones tuyas post-reunión, prioridades, cosas a resaltar..."
              className="min-h-[90px] text-[13.5px] leading-relaxed"
            />
          </div>

          <div>
            <FieldLabel hint="define profundidad y largo">Plantilla</FieldLabel>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: "compact", name: "Compacta", desc: "1-2 págs · lo esencial" },
                  { key: "intermediate", name: "Intermedia", desc: "2-3 págs · completa" },
                  { key: "full", name: "Completa", desc: "3 págs · + onboarding" },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTemplate(t.key)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors cursor-pointer",
                    template === t.key
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <div className="text-[13px] font-semibold">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel hint="opcional · PNG/JPG, ⌘V para pegar">Logo del cliente</FieldLabel>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => acceptLogoFile(e.target.files?.[0])}
            />
            {logoDataUrl ? (
              <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoDataUrl} alt="Logo cliente" className="h-10 w-auto object-contain" />
                <span className="text-[12.5px] text-muted-foreground flex-1">Logo cargado</span>
                <button
                  onClick={() => setLogoDataUrl(null)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
                  title="Quitar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => logoInputRef.current?.click()}
                className="w-full rounded-xl border border-dashed border-border p-4 text-[12.5px] text-muted-foreground hover:bg-muted/50 cursor-pointer flex items-center justify-center gap-2"
              >
                <ImagePlus className="h-4 w-4" /> Subir logo del cliente
              </button>
            )}
          </div>

          <button
            onClick={generate}
            disabled={generating || !transcript.trim()}
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "w-full cursor-pointer disabled:opacity-50",
            )}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generar descripción de cargo
          </button>
        </div>
      </div>
    </div>
  );
}
