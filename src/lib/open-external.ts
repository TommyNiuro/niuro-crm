"use client";

/** Abre una URL externa en el navegador del sistema. En la .app (webview de
 *  Tauri) window.open/target=_blank no hacen nada, así que se delega al server
 *  local (/api/open ejecuta `open`). Fallback a window.open fuera de la app. */
export function openExternal(url: string) {
  fetch("/api/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => window.open(url, "_blank"));
}
