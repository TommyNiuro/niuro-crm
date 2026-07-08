"use client";

/* Enviar la propuesta ya generada:
 *  - Mail: abre el cliente de correo del sistema (Outlook) con un mail
 *    predeterminado, CC fijo a carlos@niuro.io, y descarga el PDF para
 *    adjuntarlo (mailto no soporta adjuntos por spec).
 *  - WhatsApp: link publico /p/[token] via el bridge (solo texto). */
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Mail, MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
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
};

export function ProposalSendDialog({ proposalId, clientName }: Props) {
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState(
    `Hola! Te comparto la propuesta de Niuro${clientName ? " para " + clientName : ""}.`,
  );
  const [sending, setSending] = useState(false);

  // CC opcional en todo mail de propuesta. Configurable por env (build-time,
  // client component): seteá NEXT_PUBLIC_PROPOSAL_CC antes de buildear para
  // CCear siempre a esa casilla. Vacío por default (sin CC).
  const CC_FIJO = process.env.NEXT_PUBLIC_PROPOSAL_CC || "";

  // Descarga el PDF por blob (para adjuntarlo en Outlook: mailto no lleva adjuntos).
  const downloadPdf = async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/proposals/${proposalId}/pdf`);
      if (!res.ok) return false;
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m ? m[1] : "propuesta-niuro.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  };

  const send = async () => {
    if (channel === "email") {
      // Abre Outlook (cliente de correo del sistema) con el mail predeterminado.
      setSending(true);
      try {
        const pdfOk = await downloadPdf();
        const subject = `Propuesta Niuro${clientName ? " · " + clientName : ""}`;
        const ccPart = CC_FIJO ? `cc=${encodeURIComponent(CC_FIJO)}&` : "";
        const mailto =
          `mailto:${encodeURIComponent(to.trim())}?` +
          ccPart +
          `subject=${encodeURIComponent(subject)}` +
          `&body=${encodeURIComponent(message)}`;
        const a = document.createElement("a");
        a.href = mailto;
        document.body.appendChild(a);
        a.click();
        a.remove();
        const ccNota = CC_FIJO ? ` con copia a ${CC_FIJO}` : "";
        toast.success(
          pdfOk
            ? `Abrí el correo${ccNota}. El PDF se descargó para que lo adjuntes.`
            : `Abrí el correo${ccNota}.`,
        );
      } finally {
        setSending(false);
      }
      return;
    }

    // WhatsApp: manda el link publico via el bridge.
    if (!to.trim()) {
      toast.error("Ingresa el telefono (con codigo de pais)");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/send-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: to.trim(), message }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo enviar");
      toast.success("Mensaje de WhatsApp enviado");
      setTo("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer")}>
        <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar propuesta</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1.5 mb-1">
          <button
            onClick={() => {
              // Reset del campo al cambiar de canal: un telefono no es un mail
              // (bug: al pasar de WhatsApp a Mail quedaba el +569... en el campo).
              setChannel("email");
              setTo("");
            }}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-[12.5px] flex items-center justify-center gap-1.5 cursor-pointer",
              channel === "email" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            )}
          >
            <Mail className="h-3.5 w-3.5" /> Mail (Outlook)
          </button>
          <button
            onClick={() => {
              setChannel("whatsapp");
              setTo("");
            }}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-[12.5px] flex items-center justify-center gap-1.5 cursor-pointer",
              channel === "whatsapp" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            )}
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp (link)
          </button>
        </div>

        <label className="block text-[12px] text-muted-foreground">
          {channel === "email" ? "Mail del destinatario (opcional)" : "Telefono (con codigo de pais)"}
          <input
            type={channel === "email" ? "email" : "tel"}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={channel === "email" ? "mail@cliente.com" : "+56912345678"}
            className="mt-1 w-full bg-background rounded-lg px-2.5 py-1.5 text-[13px] border border-input focus:border-ring outline-none"
          />
        </label>

        <label className="block text-[12px] text-muted-foreground">
          Mensaje
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="mt-1 w-full bg-background rounded-lg px-2.5 py-1.5 text-[13px] border border-input focus:border-ring outline-none resize-y"
          />
        </label>
        {channel === "email" ? (
          <p className="text-[11px] text-muted-foreground">
            Abre Outlook con el mail listo y copia (CC) a {CC_FIJO}. El PDF se descarga
            para que lo adjuntes (el correo no permite adjuntar automaticamente).
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            El bridge de WhatsApp solo manda texto: se agrega automaticamente un link a la propuesta.
          </p>
        )}

        <button
          onClick={send}
          disabled={sending}
          className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer w-full mt-1")}
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
          Enviar
        </button>
      </DialogContent>
    </Dialog>
  );
}
