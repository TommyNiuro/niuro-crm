"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Loader2, Smartphone, RefreshCw } from "lucide-react";

// Gate de conexión: si WhatsApp ya está pareado muestra el inbox (children).
// Si no, ofrece conectar y escanear el QR DENTRO de la app (el bridge se
// arranca solo; el usuario nunca toca una terminal).
type Phase = "checking" | "offline" | "connecting" | "qr" | "connected" | "error";

export function ConnectWhatsApp({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Lee /api/whatsapp/qr y actualiza el estado visual. Devuelve el status crudo.
  const refreshQr = useCallback(async (): Promise<string> => {
    try {
      const r = await fetch("/api/whatsapp/qr", { cache: "no-store" });
      const d = (await r.json()) as { status: string; code?: string };
      if (d.status === "connected") {
        setPhase("connected");
        stopPoll();
      } else if (d.status === "qr" && d.code) {
        setQrDataUrl(await QRCode.toDataURL(d.code, { width: 264, margin: 1 }));
        setPhase("qr");
      } else if (d.status === "timeout") {
        setError("El QR expiró. Volvé a conectar.");
        setPhase("error");
        stopPoll();
      } else if (d.status === "offline") {
        setPhase((p) => (p === "checking" ? "offline" : p));
      }
      return d.status;
    } catch {
      setPhase((p) => (p === "checking" ? "offline" : p));
      return "offline";
    }
  }, [stopPoll]);

  // Chequeo inicial: ¿ya está conectado o hay que ofrecer conectar? refreshQr
  // ya resuelve el estado (offline/qr/connected) por sí solo.
  useEffect(() => {
    // refreshQr es async: sus setState ocurren tras el await, no de forma
    // síncrona en el effect (false positive de la regla).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshQr();
    return stopPoll;
  }, [refreshQr, stopPoll]);

  const connect = useCallback(async () => {
    setPhase("connecting");
    setError("");
    try {
      const r = await fetch("/api/whatsapp/connect", { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? "No se pudo arrancar el bridge de WhatsApp.");
        setPhase("error");
        return;
      }
      await refreshQr();
      stopPoll();
      pollRef.current = setInterval(refreshQr, 2000); // esperar el escaneo
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
      setPhase("error");
    }
  }, [refreshQr, stopPoll]);

  if (phase === "connected") return <>{children}</>;

  if (phase === "checking") {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verificando WhatsApp...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <Smartphone className="h-12 w-12 text-muted-foreground" />
      <div>
        <h2 className="text-lg font-semibold">Conectá tu WhatsApp</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Escaneá el código con tu teléfono (WhatsApp {">"} Dispositivos vinculados {">"} Vincular
          dispositivo). Tus mensajes se descargan a tu máquina y se categorizan solos.
        </p>
      </div>

      {phase === "qr" && qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="Código QR de WhatsApp" className="rounded-lg border" width={264} height={264} />
      )}

      {(phase === "connecting" || (phase === "qr" && !qrDataUrl)) && (
        <div className="flex items-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {phase === "connecting" ? "Arrancando WhatsApp..." : "Generando código..."}
        </div>
      )}

      {phase === "qr" && (
        <p className="text-xs text-muted-foreground">Esperando el escaneo...</p>
      )}

      {phase === "error" && <p className="max-w-md text-sm text-destructive">{error}</p>}

      {(phase === "offline" || phase === "error") && (
        <button
          onClick={connect}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" />
          {phase === "error" ? "Reintentar" : "Conectar WhatsApp"}
        </button>
      )}
    </div>
  );
}
