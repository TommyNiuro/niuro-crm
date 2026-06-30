"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles, Search, Check, ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { modeLabel } from "./status";
import type { Contact, ProposalMode } from "@/types";

/**
 * Builder de propuestas. Flujo: elegir contacto, modo y pegar el contexto, y la
 * IA genera la propuesta EN BACKGROUND. Al disparar, crea la propuesta en estado
 * 'generating' y redirige al viewer /proposals/[id], que hace polling hasta que
 * este lista. No bloquea: la generacion con Claude tarda varios minutos.
 *
 * Modo edicion: con ?id=<id> en la URL precarga los inputs de una propuesta
 * existente (contacto, modo, transcript, notas). Al regenerar, actualiza ESA
 * misma propuesta (PUT) y re-dispara la IA (regenerate), sin crear una nueva.
 */
export function ProposalBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);

  const [mode, setMode] = useState<ProposalMode>("staff-aug");
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");

  const [generating, setGenerating] = useState(false);
  // Modo edicion (?id=...): precargamos la propuesta existente antes de mostrar.
  const [loadingProposal, setLoadingProposal] = useState<boolean>(!!editId);

  // 1. Cargar contactos del CRM para elegir destinatario.
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

  // 4. Generar: en modo crear hace POST (nueva propuesta + IA en background). En
  // modo edicion actualiza la propuesta existente (PUT) y re-dispara la IA
  // (regenerate). En ambos redirige al viewer, que hace polling hasta que termina.
  const generate = useCallback(async () => {
    if (generating) return;
    if (!contactId) {
      toast.error("Elegi un contacto primero");
      return;
    }
    if (!transcript.trim()) {
      toast.error("Pega el transcript de la conversacion");
      return;
    }
    setGenerating(true);
    try {
      if (editId) {
        // Editar: guardar los inputs ajustados y regenerar la MISMA propuesta.
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
          body: JSON.stringify({ generate: true, contactId, mode, transcript, notes }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "No se pudo iniciar la generacion");
        const id = (data as { id?: string }).id;
        if (!id) throw new Error("La respuesta no trajo el id de la propuesta");
        toast.success("Generando la propuesta. Te llevo a verla.");
        router.push(`/proposals/${id}`);
      }
      // No reseteamos generating: la pagina se desmonta al redirigir.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar");
      setGenerating(false);
    }
  }, [generating, contactId, mode, transcript, notes, router, editId]);

  // Modo edicion: esperar a tener los inputs precargados antes de mostrar el form.
  if (editId && loadingProposal) {
    return (
      <div className="h-full grid place-items-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto pb-16">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => router.push(editId ? `/proposals/${editId}` : "/proposals")}
            title="Volver"
            className="p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">
            {editId ? "Editar propuesta" : "Nueva propuesta"}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          {editId
            ? "Ajusta el contacto, el modo o el contexto y regenera la propuesta con la IA. Se actualiza la misma propuesta, no se crea una nueva."
            : "Elegi el contacto, el modo y pega el contexto de la conversacion. La IA arma la propuesta completa en segundo plano y te lleva a verla."}
        </p>

        {/* Paso 1: contacto */}
        <section className="mb-5">
          <label
            htmlFor="proposal-contact-search"
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            1 · Contacto del CRM
          </label>
          <div className="mt-2 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              id="proposal-contact-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, empresa o email..."
              aria-label="Buscar contacto por nombre, empresa o email"
              className="w-full bg-background rounded-lg pl-8 pr-2.5 py-2 text-sm border border-input focus:border-ring outline-none"
            />
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border">
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
                    onClick={() => setContactId(c.id)}
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
          {selectedContact && (
            <div className="mt-2 text-[12.5px] text-muted-foreground">
              Seleccionado:{" "}
              <span className="font-medium text-foreground">{selectedContact.name}</span>
              {selectedContact.company ? ` (${selectedContact.company})` : ""}
            </div>
          )}
        </section>

        {/* Paso 2: modo */}
        <section className="mb-5">
          <span
            id="proposal-mode-label"
            className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            2 · Modo
          </span>
          <div
            role="group"
            aria-labelledby="proposal-mode-label"
            className="mt-2 grid grid-cols-2 gap-2"
          >
            {(["staff-aug", "sprint"] as ProposalMode[]).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={active}
                  aria-label={`Modo: ${modeLabel(m)}`}
                  className={cn(
                    "rounded-xl border p-3 text-left cursor-pointer transition-all",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="text-[13.5px] font-semibold flex items-center gap-1.5">
                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                    {modeLabel(m)}
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">
                    {m === "sprint"
                      ? "Proyecto cerrado, precio fijo por entregables."
                      : "Perfil dedicado, valor mensual renovable."}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Paso 3: transcript + notas */}
        <section className="mb-5">
          <label
            htmlFor="proposal-transcript"
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            3 · Contexto de la conversacion
          </label>
          <Textarea
            id="proposal-transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={8}
            placeholder="Pega aca el transcript de la llamada o el hilo de mensajes con el cliente..."
            aria-label="Transcript de la conversacion con el cliente"
            className="mt-2 text-sm"
          />
          <label htmlFor="proposal-notes" className="sr-only">
            Notas extra para la IA (opcional)
          </label>
          <Textarea
            id="proposal-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Notas extra para la IA (opcional): presupuesto, stack, urgencia, stakeholders..."
            aria-label="Notas extra para la IA (opcional)"
            className="mt-2 text-sm"
          />
        </section>

        {/* Paso 4: generar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={generate}
            disabled={generating || !contactId || !transcript.trim()}
            className={cn(buttonVariants({ variant: "default" }), "cursor-pointer")}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{" "}
                {editId ? "Guardando..." : "Iniciando..."}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1.5" />{" "}
                {editId ? "Regenerar propuesta" : "Generar propuesta"}
              </>
            )}
          </button>
          <span className="text-[12px] text-muted-foreground">
            La IA trabaja en segundo plano. Podes seguir en otra pantalla mientras se arma.
          </span>
        </div>
      </div>
    </div>
  );
}
