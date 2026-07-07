"use client";

/* Mail de resumen de requerimiento post-reunion. Independiente de la
 * propuesta comercial: se puede generar apenas hay transcripcion, sin
 * esperar los ~4 min de la generacion completa (ver
 * /api/proposals/[id]/summary-email). Stateless: se regenera on-demand, no se
 * persiste (si el vendedor edita la transcripcion, no queda una version vieja
 * dando vueltas). */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Sparkles, Copy, Send } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  proposalId: string;
  clientName?: string;
  // Renderiza el trigger como item de un menu (fila full-width) en vez de boton.
  asMenuItem?: boolean;
};

export function ProposalSummaryEmailDialog({ proposalId, clientName, asMenuItem }: Props) {
  const [generating, setGenerating] = useState(false);
  const [email, setEmail] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/summary-email`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo generar el mail");
      setEmail(json.email || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar el mail");
    } finally {
      setGenerating(false);
    }
  }, [proposalId]);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(email).then(() => toast.success("Copiado"));
  }, [email]);

  const sendViaEmail = useCallback(async () => {
    if (!to.trim()) {
      toast.error("Ingresa el mail del destinatario");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: `Resumen del requerimiento${clientName ? " · " + clientName : ""}`,
          message: email,
          attachPdf: false,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo enviar el mail");
      toast.success("Mail enviado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar el mail");
    } finally {
      setSending(false);
    }
  }, [proposalId, to, email, clientName]);

  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          "cursor-pointer",
          asMenuItem
            ? "w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 hover:bg-muted"
            : cn(buttonVariants({ variant: "outline", size: "sm" })),
        )}
      >
        <Mail className="h-3.5 w-3.5 mr-1" /> Mail de resumen
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mail de resumen de requerimiento</DialogTitle>
        </DialogHeader>

        {!email ? (
          <div className="py-4 text-center">
            <p className="text-[13px] text-muted-foreground mb-3">
              Genera un mail para validar con el cliente el requerimiento entendido, a partir de la
              transcripcion cargada. No hace falta esperar a que la propuesta este lista.
            </p>
            <button
              onClick={generate}
              disabled={generating}
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer")}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              Generar mail
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <Textarea
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              rows={14}
              className="text-[12.5px] font-mono"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={generate}
                disabled={generating}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer")}
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                )}
                Regenerar
              </button>
              <button
                onClick={copy}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer")}
              >
                <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
              </button>
            </div>
            <div className="flex items-center gap-1.5 pt-1 border-t border-border">
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="mail@cliente.com"
                className="flex-1 bg-background rounded-lg px-2.5 py-1.5 text-[12.5px] border border-input focus:border-ring outline-none mt-2"
              />
              <button
                onClick={sendViaEmail}
                disabled={sending}
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer mt-2")}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1" />
                )}
                Enviar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
