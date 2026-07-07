"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Search,
  Check,
  ArrowLeft,
  ChevronDown,
  ImagePlus,
  X,
  Users,
  Zap,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Contact, ProposalMode } from "@/types";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/* Tipografia editorial de marca (Fraunces / JetBrains Mono ya cargadas por el
 * @import global de globals.css para el modulo de propuestas). Se usan inline
 * para no depender del scope .niuro-proposal, que trae toda la paleta print. */
const displayFont = { fontFamily: "'Fraunces', Georgia, serif" } as const;
const monoFont = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" } as const;

/* Label de campo estilo Cotizador: etiqueta mono a la izquierda + hint mono
 * atenuado a la derecha. */
function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2">
      <label
        htmlFor={htmlFor}
        style={monoFont}
        className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground"
      >
        {children}
      </label>
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

/**
 * Builder de propuestas · "modo turbo". Flujo: pegar transcript + notas (lo
 * unico obligatorio), clausulas y logo opcionales, modo, y listo. La IA
 * extrae cliente/industria/pais de la transcripcion y genera la propuesta
 * completa EN BACKGROUND (~1 min); el viewer hace polling hasta que este lista.
 *
 * Vincular un contacto del CRM es OPCIONAL (colapsado): no bloquea armar una
 * propuesta si el contacto no esta cargado todavia.
 *
 * Modo edicion: con ?id=<id> precarga los inputs de una propuesta existente y
 * al regenerar actualiza ESA propuesta (PUT + regenerate), sin crear una nueva.
 */
export function ProposalBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [showContactPicker, setShowContactPicker] = useState(false);

  const [mode, setMode] = useState<ProposalMode>("staff-aug");
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");
  // Clausula de incorporacion directa al payroll (solo staff-aug). Solo en
  // modo crear: en edicion se maneja desde el popover de Precio del detalle.
  const [absorption, setAbsorption] = useState(false);
  // Logo del cliente: data URL local, la IA lo preserva (run-generation.ts).
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Click programatico sobre el input (ref, no semantica de <label>): en el
  // webview de la .app (Tauri/WKWebView) el forwarding label->input de type=file
  // no es confiable; el .click() directo si.
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [generating, setGenerating] = useState(false);
  const [loadingProposal, setLoadingProposal] = useState<boolean>(!!editId);

  const acceptLogoFile = useCallback((file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("El logo tiene que ser una imagen (PNG, JPG, SVG, WEBP)");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("El logo pesa mas de 2 MB, elegi uno mas liviano");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(reader.result as string);
    reader.onerror = () => toast.error("No se pudo leer el logo");
    reader.readAsDataURL(file);
  }, []);

  // Pegar el logo con Cmd+V: agarra la primera imagen del portapapeles. Se
  // ignora si el paste va dirigido a un campo de texto (transcript/notas).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        acceptLogoFile(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptLogoFile]);

  // 1. Cargar contactos del CRM (para el vinculo opcional).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/contacts?limit=500");
        const data = res.ok ? await res.json() : [];
        if (alive) setContacts(Array.isArray(data) ? data : []);
      } catch {
        if (alive) toast.error("No se pudieron cargar los contactos");
      } finally {
        if (alive) setLoadingContacts(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 1b. Modo edicion: precargar los inputs de la propuesta existente por id.
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/proposals/${editId}`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const p = (await res.json()) as {
          contactId?: string | null;
          mode?: ProposalMode;
          transcript?: string | null;
          notes?: string | null;
        };
        if (!alive) return;
        if (p.contactId) setContactId(p.contactId);
        if (p.mode) setMode(p.mode);
        if (typeof p.transcript === "string") setTranscript(p.transcript);
        if (typeof p.notes === "string") setNotes(p.notes);
      } catch {
        if (alive) toast.error("No se pudo cargar la propuesta para editar");
      } finally {
        if (alive) setLoadingProposal(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [editId]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === contactId) ?? null,
    [contacts, contactId],
  );

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts.slice(0, 50);
    return contacts
      .filter((c) =>
        [c.name, c.company, c.email]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
      .slice(0, 50);
  }, [contacts, search]);

  const generate = useCallback(async () => {
    if (generating) return;
    if (!transcript.trim()) {
      toast.error("Pega la transcripcion de la reunion");
      return;
    }
    setGenerating(true);
    try {
      if (editId) {
        const putRes = await fetch(`/api/proposals/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId, mode, transcript, notes }),
        });
        if (!putRes.ok) {
          const e = await putRes.json().catch(() => ({}));
          throw new Error(e.error || "No se pudieron guardar los cambios");
        }
        const regenRes = await fetch(`/api/proposals/${editId}/regenerate`, {
          method: "POST",
        });
        if (!regenRes.ok) {
          const e = await regenRes.json().catch(() => ({}));
          throw new Error(e.error || "No se pudo regenerar la propuesta");
        }
        toast.success("Regenerando la propuesta con tus cambios.");
        router.push(`/proposals/${editId}`);
      } else {
        const res = await fetch("/api/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generate: true,
            contactId,
            mode,
            transcript,
            notes,
            logoSrc: logoDataUrl,
            absorption,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "No se pudo iniciar la generacion");
        const id = (data as { id?: string }).id;
        if (!id) throw new Error("La respuesta no trajo el id de la propuesta");
        toast.success("Generando la propuesta. Te llevo a verla.");
        router.push(`/proposals/${id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar");
      setGenerating(false);
    }
  }, [generating, contactId, mode, transcript, notes, logoDataUrl, absorption, router, editId]);

  if (editId && loadingProposal) {
    return (
      <div className="h-full grid place-items-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-10 max-w-2xl mx-auto pb-24">
        {/* ── Hero editorial ── */}
        <button
          onClick={() => router.push(editId ? `/proposals/${editId}` : "/proposals")}
          className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {editId ? "Volver a la propuesta" : "Propuestas"}
        </button>

        <div
          style={monoFont}
          className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary mb-3"
        >
          <span className="inline-block w-7 h-px bg-primary" />
          Modo turbo {editId ? "· Regenerar" : "· Nueva propuesta"}
        </div>
        <h1
          style={displayFont}
          className="text-[32px] leading-[1.1] font-medium tracking-tight text-foreground"
        >
          Pegá la transcripción{" "}
          <em className="text-primary font-normal">y la IA arma todo</em>
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground max-w-lg">
          La IA lee la transcripción y las notas, extrae{" "}
          <strong className="text-foreground font-semibold">
            cliente, industria, país, rol, pricing y stakeholders
          </strong>
          , y arma la propuesta completa con voz Niuro en un minuto.
        </p>

        {/* ── Transcripcion ── */}
        <section className="mt-9">
          <FieldLabel htmlFor="proposal-transcript" hint="Granola · Fireflies · Otter · cualquier texto">
            Transcripción de la reunión
          </FieldLabel>
          <Textarea
            id="proposal-transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={9}
            placeholder="Pega aca la transcripcion completa de la reunion con el cliente..."
            aria-label="Transcripcion de la reunion con el cliente"
            className="text-sm leading-relaxed rounded-xl"
          />
          <div
            style={monoFont}
            className="mt-1.5 text-right text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground"
          >
            {transcript.length.toLocaleString("es-CL")} caracteres
          </div>
        </section>

        {/* ── Notas ── */}
        <section className="mt-5">
          <FieldLabel htmlFor="proposal-notes" hint="Opcional">
            Notas, conclusiones o PRD
          </FieldLabel>
          <Textarea
            id="proposal-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Resumen de la reunion, descripcion de cargo, presupuesto, urgencia, contexto adicional..."
            aria-label="Notas extra para la IA (opcional)"
            className="text-sm leading-relaxed rounded-xl"
          />
        </section>

        {/* ── Clausula payroll (solo staff-aug, solo al crear) ── */}
        {!editId && mode === "staff-aug" && (
          <section className="mt-7">
            <FieldLabel hint="Opcional · 17% del valor anualizado">
              Cláusula de incorporación directa al payroll
            </FieldLabel>
            <label
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors",
                absorption
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              <input
                type="checkbox"
                checked={absorption}
                onChange={(e) => setAbsorption(e.target.checked)}
                className="mt-0.5 cursor-pointer accent-current"
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-foreground">
                  Incluir cláusula
                </span>
                <span className="block mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  Solo actívala si el cliente pidió la opción de quedarse con el talento.
                  Si no la pidió, dejala fuera. Pago único, sin cuotas.
                </span>
              </span>
            </label>
          </section>
        )}

        {/* ── Logo del cliente (dropzone) ── */}
        <section className="mt-7">
          <FieldLabel hint="Opcional · PNG · JPG · SVG · WEBP · máx 2 MB">
            Logo del cliente
          </FieldLabel>
          {logoDataUrl ? (
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview de un data URL local */}
              <img
                src={logoDataUrl}
                alt="Logo del cliente"
                className="h-14 w-14 rounded-lg border border-border object-contain bg-background p-1"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-foreground">Logo cargado</div>
                <div className="text-[12px] text-muted-foreground">
                  Va en la portada de la propuesta, junto al logo de Niuro.
                </div>
              </div>
              <button
                onClick={() => setLogoDataUrl(null)}
                title="Quitar logo"
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Input FUERA de la zona clickeable: el .click() programatico
                  dispara un evento que burbujea, y adentro re-dispararia el
                  onClick de la zona en loop. */}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  acceptLogoFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <div
                role="button"
                tabIndex={0}
                aria-label="Subir logo del cliente"
                onClick={() => logoInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    logoInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  acceptLogoFile(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-8 px-4 cursor-pointer transition-colors text-center",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/40",
                )}
              >
                <span className="grid place-items-center h-10 w-10 rounded-full bg-primary/10 text-primary">
                  <ImagePlus className="h-5 w-5" />
                </span>
                <span className="text-[13px] text-muted-foreground">
                  Arrastra el logo,{" "}
                  <span className="font-semibold text-foreground">haz click para subirlo</span> o
                  pégalo con ⌘V
                </span>
              </div>
            </>
          )}
        </section>

        {/* ── Modo ── */}
        <section className="mt-7">
          <FieldLabel>Modelo de servicio</FieldLabel>
          <div role="group" aria-label="Modelo de servicio" className="grid grid-cols-2 gap-3">
            {(
              [
                {
                  m: "staff-aug" as ProposalMode,
                  icon: Users,
                  title: "Staff Augmentation",
                  desc: "Perfil dedicado, valor mensual renovable.",
                },
                {
                  m: "sprint" as ProposalMode,
                  icon: Zap,
                  title: "Project Sprint",
                  desc: "Proyecto cerrado, precio fijo por entregables.",
                },
              ] as const
            ).map(({ m, icon: Icon, title, desc }) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl border p-4 text-left cursor-pointer transition-all",
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/40",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "grid place-items-center h-7 w-7 rounded-lg",
                        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[13.5px] font-semibold text-foreground">{title}</span>
                    {active && <Check className="h-4 w-4 text-primary ml-auto shrink-0" />}
                  </div>
                  <div className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{desc}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Contacto opcional (colapsado) ── */}
        <section className="mt-7">
          <button
            type="button"
            onClick={() => setShowContactPicker((v) => !v)}
            style={monoFont}
            className="w-full flex items-center justify-between gap-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <span>Vincular contacto del CRM</span>
            <span className="flex items-center gap-2">
              <span className="text-[9.5px] tracking-[0.12em]">Opcional</span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showContactPicker && "rotate-180")}
              />
            </span>
          </button>
          {selectedContact && (
            <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[12.5px]">
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-medium text-foreground truncate">{selectedContact.name}</span>
              {selectedContact.company && (
                <span className="text-muted-foreground truncate">· {selectedContact.company}</span>
              )}
              <button
                onClick={() => setContactId(null)}
                className="ml-auto text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                title="Quitar contacto"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {showContactPicker && (
            <div className="mt-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, empresa o email..."
                  aria-label="Buscar contacto por nombre, empresa o email"
                  className="w-full bg-background rounded-lg pl-8 pr-2.5 py-2 text-sm border border-input focus:border-ring outline-none"
                />
              </div>
              <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {loadingContacts ? (
                  <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando contactos...
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    Sin resultados para esa busqueda.
                  </div>
                ) : (
                  filteredContacts.map((c) => {
                    const active = c.id === contactId;
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setContactId(c.id);
                          setShowContactPicker(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors",
                          active ? "bg-primary/10" : "hover:bg-muted",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium truncate">{c.name}</div>
                          <div className="text-[12px] text-muted-foreground truncate">
                            {[c.company, c.email].filter(Boolean).join(" · ") || "Sin datos"}
                          </div>
                        </div>
                        {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </section>

        {/* ── CTA ── */}
        <div className="mt-9 flex flex-col items-start gap-2.5">
          <button
            onClick={generate}
            disabled={generating || !transcript.trim()}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[14.5px] font-semibold transition-all cursor-pointer",
              "bg-primary text-primary-foreground hover:bg-primary-hover shadow-lg shadow-primary/20",
              "disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none",
            )}
          >
            {generating ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <Sparkles className="h-4.5 w-4.5" />
            )}
            {editId ? "Regenerar propuesta" : "Generar propuesta con IA"}
          </button>
          <span className="text-[12px] text-muted-foreground">
            Tarda alrededor de un minuto y corre en segundo plano: podés seguir en otra pantalla.
          </span>
        </div>
      </div>
    </div>
  );
}
