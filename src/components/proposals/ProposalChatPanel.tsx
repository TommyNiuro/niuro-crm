"use client";

/* Chat lateral de ajustes (modo turbo, estilo Cotizador Niuro). Pide un cambio
 * puntual en lenguaje natural y aplica un PATCH parcial via
 * POST /api/proposals/[id]/refine, sin regenerar la propuesta completa.
 *
 * El historial del chat es efimero (solo en memoria de esta sesion): lo que
 * persiste es el CONTENIDO de la propuesta (la fuente de verdad), no la
 * conversacion. Refrescar la pagina limpia el chat pero no pierde ningun
 * cambio ya aplicado.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; text: string };

const QUICK_SUGGESTIONS = [
  "Completa los campos pendientes con lo que dice la transcripcion",
  "Sube el tono competitivo del resumen",
  "Agrega un riesgo de presupuesto",
  "Acorta el resumen ejecutivo",
];

type Props = {
  proposalId: string;
  disabled?: boolean;
  onUpdated: (proposal: unknown) => void;
};

export function ProposalChatPanel({ proposalId, disabled, onUpdated }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Pedime un cambio en lenguaje natural (ej. \"subi el tono competitivo\") y lo aplico sobre la propuesta.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (instruction: string) => {
      const text = instruction.trim();
      if (!text || sending || disabled) return;
      setMessages((m) => [...m, { role: "user", text }]);
      setInput("");
      setSending(true);
      try {
        const res = await fetch(`/api/proposals/${proposalId}/refine`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: text }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "No se pudo aplicar el cambio");
        setMessages((m) => [...m, { role: "assistant", text: json.explanation || "Listo." }]);
        onUpdated(json.proposal);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al aplicar el cambio";
        setMessages((m) => [...m, { role: "assistant", text: msg }]);
        toast.error(msg);
      } finally {
        setSending(false);
      }
    },
    [proposalId, sending, disabled, onUpdated],
  );

  return (
    <div className="flex flex-col h-full border border-border rounded-xl bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center gap-1.5 shrink-0">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-[12.5px] font-semibold">Chat de ajustes</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        {messages.length === 1 ? (
          // Empty state: aun no hay conversacion. Centrado, en vez de una burbuja
          // suelta arriba dejando un vacio grande debajo.
          <div className="h-full flex flex-col items-center justify-center text-center gap-2.5 px-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 grid place-items-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-[240px]">
              Pedime un cambio en lenguaje natural (ej.{" "}
              <span className="text-foreground">&quot;subi el tono competitivo&quot;</span>) y lo
              aplico sobre la propuesta.
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              Probá una sugerencia de abajo ↓
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "text-[12.5px] leading-relaxed rounded-lg px-2.5 py-1.5 max-w-[92%]",
                  m.role === "user"
                    ? "bg-primary/10 text-foreground ml-auto"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {m.text}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Aplicando el cambio...
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border flex flex-wrap gap-1.5 shrink-0">
        {QUICK_SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            disabled={sending || disabled}
            className="text-[11px] rounded-full border border-border px-2 py-1 hover:bg-muted cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="p-2 border-t border-border flex items-center gap-1.5 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          disabled={sending || disabled}
          placeholder='Pedi un cambio: "reescribe el contexto enfocado en data"...'
          className="flex-1 bg-background rounded-lg px-2.5 py-2 text-[12.5px] border border-input focus:border-ring outline-none disabled:opacity-50"
        />
        <button
          onClick={() => send(input)}
          disabled={sending || disabled || !input.trim()}
          className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer shrink-0")}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
