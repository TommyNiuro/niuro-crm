import { execFileSync } from "child_process"

/**
 * send-digest.ts — dispara el digest diario vía la API local.
 * Siempre exit 0 (launchd no debe reintentar), pero el fallo es VISIBLE
 * (auditoría 2026-06-09): log con motivo real + notificación macOS.
 * El digest llevaba días fallando con Resend 401 sin que nadie lo supiera.
 */

function notifyFail(reason: string) {
  console.error(`[digest] FALLO: ${reason}`)
  try {
    execFileSync("/usr/bin/osascript", [
      "-e",
      `display notification ${JSON.stringify(reason.slice(0, 120))} with title "Niuro CRM: digest NO enviado"`,
    ])
  } catch {
    // sin entorno gráfico: el log basta
  }
}

async function main() {
  const res = await fetch("http://127.0.0.1:3001/api/digest/send", { method: "POST" })
  const data = await res.json().catch(() => null)
  console.log("[digest]", JSON.stringify(data, null, 2))
  if (!res.ok) {
    const detail = data && typeof data === "object" && "error" in data ? String(data.error) : `HTTP ${res.status}`
    notifyFail(`${detail} — revisar RESEND_API_KEY en .env.local`)
  } else {
    console.log("[digest] enviado OK")
  }
  process.exit(0) // launchd no debe marcar el servicio como fallido ni reintentar
}

main().catch((e) => {
  notifyFail(e instanceof Error ? e.message : String(e))
  process.exit(0)
})
