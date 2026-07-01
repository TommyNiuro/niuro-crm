/**
 * sync-crm.ts — Sync (Fase A: SOLO LECTURA) con otra instancia de Niuro CRM
 * via su API REST (ver src/lib/crm-sync.ts para el motor real). Nunca escribe
 * en la instancia remota ni toca su DB directamente.
 *
 * Uso: npx tsx scripts/sync-crm.ts
 * Requiere CRM_SYNC_URL (env) o crm_settings.crm_sync_url ya configurado
 * (ver onboarding). Sin eso, no hace nada (sync desactivado).
 */
import Database from "better-sqlite3";
import fs from "fs";
import { dbPath } from "../src/lib/paths";
import { runFullSync } from "../src/lib/crm-sync";

// Lock cross-process (mismo patron que scripts/sync-wa.ts): evita que dos
// corridas (ej. el tick periodico y un disparo manual) se pisen escribiendo.
const LOCK_PATH = "/tmp/niuro-crm-sync.lock";

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function acquireLock(): number | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(LOCK_PATH, "wx");
      fs.writeSync(fd, String(process.pid));
      return fd;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      let owner = NaN;
      try {
        owner = Number(fs.readFileSync(LOCK_PATH, "utf8").trim());
      } catch {
        /* se borro entre medio: reintentar */
      }
      if (Number.isFinite(owner) && owner > 0 && processAlive(owner)) return null;
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {
        /* otra corrida lo reclamo primero */
      }
    }
  }
  return null;
}

function releaseLock(fd: number | null): void {
  if (fd === null) return;
  try {
    fs.closeSync(fd);
  } catch {
    /* ya cerrado */
  }
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* ya borrado */
  }
}

async function main() {
  const lockFd = acquireLock();
  if (lockFd === null) {
    console.log("[sync-crm] otra corrida en curso, salgo");
    return;
  }

  try {
    const db = new Database(dbPath(), { timeout: 15000 });
    try {
      db.pragma("busy_timeout = 15000");
      const results = await runFullSync(db);
      let anyFailed = false;
      for (const [table, stats] of Object.entries(results)) {
        if (stats.failed === -1) {
          anyFailed = true;
          continue;
        }
        console.log(
          `[sync-crm] ${table}: +${stats.created} creados, ~${stats.updated} actualizados, ` +
            `${stats.skipped} sin cambios${stats.failed ? `, ${stats.failed} fallidos` : ""}`
        );
      }
      if (anyFailed) process.exitCode = 1;
    } finally {
      db.close();
    }
  } finally {
    releaseLock(lockFd);
  }
}

main().catch((e) => {
  console.error("[sync-crm] error fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
