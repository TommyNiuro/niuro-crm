import { execFileSync } from "child_process"
import { runDigest } from "../src/lib/digest"

/**
 * send-digest.ts — genera y envía el digest diario directamente contra la DB,
 * SIN HTTP: no depende de que la .app esté corriendo, ni de auth, ni de un
 * puerto. Las credenciales de Resend salen del entorno (el wrapper de launchd
 * carga .env.local) y la DB de CRM_DATA_DIR (la .app la cifra; la llave sale
 * del Keychain). Antes le pegaba a http://127.0.0.1:3001 (el CRM viejo auto-crm),
 * por eso el digest salía de datos divergentes.
 *
 * Siempre exit 0 (launchd no debe reintentar), pero el fallo es VISIBLE
 * (auditoría 2026-06-09): log con motivo real + notificación macOS.
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
  // Credenciales de Resend desde .env.local (dotenv real: maneja comillas y
  // espacios, ej. DIGEST_FROM="Niuro CRM <x@y>"; el sourcing por shell rompía).
  try {
    process.loadEnvFile(".env.local")
  } catch {
    // sin .env.local: runDigest reporta "RESEND_API_KEY no configurado"
  }
  const resp = await runDigest()
  const data = (await resp.json().catch(() => null)) as
    | { ok?: boolean; sent?: boolean; reason?: string; error?: string }
    | null
  console.log("[digest]", JSON.stringify(data, null, 2))
  if (!data) {
    notifyFail("respuesta vacía de runDigest")
  } else if (data.ok === false) {
    notifyFail(data.error || "error desconocido")
  } else if (data.sent === false) {
    notifyFail(data.reason || "no enviado (revisar RESEND_API_KEY/DIGEST_EMAIL en .env.local)")
  } else {
    console.log("[digest] enviado OK")
  }
  process.exit(0) // launchd no debe marcar el servicio como fallido ni reintentar
}

main().catch((e) => {
  notifyFail(e instanceof Error ? e.message : String(e))
  process.exit(0)
})
