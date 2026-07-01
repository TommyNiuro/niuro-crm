"use client";

import { useEffect, useCallback } from "react";

// Poller en background que alimenta el historial de /status: le pega a
// /api/whatsapp/tick cada minuto para que el historial se llene solo, sin
// pedirle a cada usuario del OSS que configure un cron aparte. Mismo patron
// que NotificationChecker.
export function BridgeStatusPoller() {
  const tick = useCallback(async () => {
    try {
      await fetch("/api/whatsapp/tick", { method: "POST" });
    } catch {
      // silencioso: es solo telemetria de estado, no critico
    }
  }, []);

  useEffect(() => {
    tick();
    const interval = setInterval(tick, 60 * 1000);
    return () => clearInterval(interval);
  }, [tick]);

  return null;
}
