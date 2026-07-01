"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

// Next.js App Router: catch-all de errores no controlados por segmento
// (auditoria SaaS 2026-07-01, antes ningun segmento lo tenia y un error
// revienta a pantalla blanca de Next por defecto).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("app.error-boundary", error.message, { digest: error.digest, stack: error.stack });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-1">Algo salio mal</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">
        Ocurrio un error inesperado. El equipo ya quedo registrado en los logs.
      </p>
      <Button onClick={reset} className="cursor-pointer">
        Reintentar
      </Button>
    </div>
  );
}
