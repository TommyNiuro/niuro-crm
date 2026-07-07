/**
 * backup-db.ts — Backup diario de la DB de la .app (SQLCipher).
 *
 * Reemplaza a auto-crm/scripts/backup-db.sh: ese usaba `sqlite3 .backup`,
 * que NO puede abrir la DB de la .app (cifrada con SQLCipher vía
 * better-sqlite3-multiple-ciphers).
 *
 * El método `.backup()` nativo de better-sqlite3 NO sirve acá: crea el
 * destino en texto plano, y SQLCipher reserva bytes extra por página (HMAC)
 * que un archivo plano no tiene — sqlite tira "incompatible source and
 * target databases" (probado). Como el cifrado es a nivel de página del
 * archivo en disco (no una capa aparte), una copia de bytes cruda del .db
 * YA es un backup cifrado válido, siempre que no haya escritura en vuelo:
 * por eso se fuerza `wal_checkpoint(TRUNCATE)` antes de copiar, para que
 * todo lo pendiente en el -wal quede volcado al .db principal.
 *
 * Corre vía launchd: com.niuro.db-backup (diario 03:30), wrapper
 * run-db-backup.sh con CRM_DATA_DIR de la .app.
 */
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, copyFileSync } from "fs";
import path from "path";
import os from "os";
import { openDb } from "../src/lib/db-open";
import { dbPath } from "../src/lib/paths";

const DEST_DIR = path.join(os.homedir(), "niuro", "backups", "crm");
const KEEP = 14;

/**
 * Rotación pura: dado un listado de backups (nombre + mtime) y cuántos
 * conservar, devuelve los nombres a borrar (los más viejos primero).
 * Sin fs: testeable sin tocar disco.
 */
export function selectBackupsToDelete(
  files: { name: string; mtime: number }[],
  keep: number
): string[] {
  return files
    .slice()
    .sort((a, b) => b.mtime - a.mtime)
    .slice(keep)
    .map((f) => f.name);
}

function notifyFail(msg: string): never {
  console.error(`[db-backup] ERROR: ${msg}`);
  try {
    execFileSync("/usr/bin/osascript", ["-e",
      `display notification ${JSON.stringify(msg)} with title "Niuro CRM: backup FALLÓ"`]);
  } catch { /* sin sesión gráfica */ }
  process.exit(1);
}

async function main() {
  const src = dbPath();
  if (!existsSync(src)) notifyFail(`No existe ${src}`);
  mkdirSync(DEST_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, 19);
  const out = path.join(DEST_DIR, `crm-${stamp}.db`);

  // Checkpoint + copia cruda de bytes (ver comentario de arriba: .backup()
  // no es compatible con el formato de página de SQLCipher).
  try {
    const db = openDb(src, { timeout: 30000 });
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    copyFileSync(src, out);
  } catch (e) {
    try { unlinkSync(out); } catch { /* puede no haberse creado */ }
    notifyFail(`checkpoint/copia falló: ${e instanceof Error ? e.message : e}`);
  }

  // Verificación de integridad: abrir el snapshot con la misma key y correr
  // integrity_check. Si la DB no tiene key (dev), openDb igual la abre en plano.
  try {
    const check = openDb(out, { readonly: true });
    const ok = (check.pragma("integrity_check", { simple: true }) as unknown) === "ok";
    check.close();
    if (!ok) { unlinkSync(out); notifyFail("integrity_check del backup no devolvió ok"); }
  } catch (e) {
    unlinkSync(out);
    notifyFail(`no se pudo verificar el backup: ${e instanceof Error ? e.message : e}`);
  }

  execFileSync("/usr/bin/gzip", ["-f", out]);
  const gz = `${out}.gz`;

  // Rotación: conservar las KEEP más recientes.
  const files = readdirSync(DEST_DIR)
    .filter((f) => f.startsWith("crm-") && f.endsWith(".db.gz"))
    .map((f) => ({ name: f, mtime: statSync(path.join(DEST_DIR, f)).mtimeMs }));
  for (const name of selectBackupsToDelete(files, KEEP)) {
    unlinkSync(path.join(DEST_DIR, name));
    console.log(`[db-backup] rotado: ${name}`);
  }
  const remaining = Math.min(files.length, KEEP);

  const sizeKb = Math.round(statSync(gz).size / 1024);
  console.log(`[db-backup] OK: ${path.basename(gz)} (${sizeKb} KB) — ${remaining} copias en ${DEST_DIR}`);
}

// ponytail: no correr main() al importar el módulo desde tests (Vitest importa
// selectBackupsToDelete de acá; sin el gate, main() pisaba data/crm.db real).
if (!process.env.VITEST) {
  main().catch((e) => notifyFail(e instanceof Error ? e.message : String(e)));
}
