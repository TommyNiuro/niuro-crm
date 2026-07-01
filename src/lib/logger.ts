/**
 * Logging estructurado minimo (auditoria SaaS 2026-07-01). No hay logging
 * centralizado (Datadog/Honeycomb) porque eso requiere una cuenta externa que
 * el operador todavia no eligio; esto cierra el hueco barato mientras tanto:
 * una linea JSON por evento en vez de console.error disperso sin contexto,
 * para poder grep/parsear los logs que ya captura launchd hoy.
 */
type Level = "info" | "warn" | "error";

function emit(level: Level, scope: string, msg: string, meta?: Record<string, unknown>): void {
  const payload = { ts: new Date().toISOString(), level, scope, msg, ...meta };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  // "Errores fuera de la maquina" (quick win #1 de la auditoria): si hay un
  // endpoint configurado, se postea el error. No-op sin ERROR_WEBHOOK_URL, asi
  // que no agrega dependencia ni cuenta externa hasta que el operador elija una
  // (Sentry ingest URL, un webhook de Slack, lo que sea). Fire-and-forget: el
  // logging nunca debe romper el request. ponytail: el SDK de Sentry es el
  // upgrade si se quieren breadcrumbs/source maps/releases.
  if (level === "error" && process.env.ERROR_WEBHOOK_URL) {
    fetch(process.env.ERROR_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: line,
    }).catch(() => { /* best-effort: la red del sink no debe tumbar el flujo */ });
  }
}

export const logger = {
  info: (scope: string, msg: string, meta?: Record<string, unknown>) => emit("info", scope, msg, meta),
  warn: (scope: string, msg: string, meta?: Record<string, unknown>) => emit("warn", scope, msg, meta),
  error: (scope: string, msg: string, meta?: Record<string, unknown>) => emit("error", scope, msg, meta),
};
