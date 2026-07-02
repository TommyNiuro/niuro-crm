/**
 * bridge-manager.ts — arranca y consulta el bridge de WhatsApp DESDE el CRM,
 * para que el usuario nunca toque una terminal: conecta y escanea el QR dentro
 * de la app. Server-only (usa child_process, fs, paths de Node).
 *
 * El binario del bridge (Go) se compila con `npm run bridge:build` y queda en
 * bridge/whatsapp-bridge (o .exe en Windows). Se lanza con cwd = <dataDir>/whatsapp,
 * ahí crea su store/ (messages.db + whatsapp.db). Autoconfiguramos las settings
 * whatsapp_* para que el resto del CRM (getStatus, sync-wa) encuentre esas DBs.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { dataDir } from "@/lib/paths";
import { writeSettings } from "@/lib/settings";
import { getSince } from "@/lib/whatsapp";

const BRIDGE_PORT = process.env.BRIDGE_PORT || "8080";
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;

/** Carpeta de trabajo del bridge (cwd): ahí vive su store/. */
function bridgeStoreDir(): string {
  return path.join(dataDir(), "whatsapp");
}

/** Ruta del binario compilado. Override con BRIDGE_BIN (lo usa la .app Tauri). */
function bridgeBinPath(): string {
  if (process.env.BRIDGE_BIN) return process.env.BRIDGE_BIN;
  const name = process.platform === "win32" ? "whatsapp-bridge.exe" : "whatsapp-bridge";
  // process.cwd() es la raíz del repo/app en `npm run local` y en dev.
  return path.join(process.cwd(), "bridge", name);
}

export type QrState = { status: string; code?: string };

/** Consulta el estado de pairing del bridge. null si el bridge no responde. */
export async function getQr(): Promise<QrState | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/qr`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as QrState;
  } catch {
    return null;
  }
}

/**
 * Garantiza que el bridge esté corriendo. Idempotente: si ya responde, no hace
 * nada. Devuelve {started, error}. No espera al pairing (eso lo poll-ea la UI).
 */
export async function ensureBridge(): Promise<{ running: boolean; error?: string }> {
  // ¿Ya corre? (lo arrancó una corrida anterior, o launchd)
  if ((await getQr()) !== null) return { running: true };

  const bin = bridgeBinPath();
  if (!fs.existsSync(bin)) {
    return {
      running: false,
      error: `Bridge no compilado. Corré 'npm run bridge:build' una vez (requiere Go). Buscado en: ${bin}`,
    };
  }

  const cwd = bridgeStoreDir();
  fs.mkdirSync(cwd, { recursive: true });

  // Autoconfig: el bridge crea store/ bajo su cwd; apuntamos el CRM ahí.
  writeSettings({
    whatsapp_bridge_url: BRIDGE_URL,
    whatsapp_db_path: path.join(cwd, "store", "messages.db"),
    whatsapp_store_db_path: path.join(cwd, "store", "whatsapp.db"),
  });

  try {
    const child = spawn(bin, [], {
      cwd,
      env: { ...process.env, BRIDGE_PORT, WHATSAPP_SINCE: getSince() },
      detached: true, // sobrevive al request; el bridge es un daemon
      stdio: "ignore",
    });
    child.unref();
  } catch (e) {
    return { running: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Esperar a que /api/qr responda (arranque del REST + primer QR). ~10s máx.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if ((await getQr()) !== null) return { running: true };
  }
  return { running: false, error: "El bridge arrancó pero no respondió a tiempo" };
}
