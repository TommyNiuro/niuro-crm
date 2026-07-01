/**
 * Resolución central de rutas de datos escribibles.
 *
 * En dev y en `npm run local`, cae en `<cwd>/data` (el comportamiento de siempre).
 *
 * En la app de escritorio (Tauri), el server standalone de Next hace
 * `process.chdir(__dirname)` al arrancar, y dentro del `.app` ese directorio es
 * de SOLO LECTURA. Por eso cualquier escritura relativa al cwd (crear la DB,
 * guardar uploads, escribir recovery de propuestas) fallaba con 500. El launcher
 * de Tauri setea `CRM_DATA_DIR` a una carpeta escribible del usuario
 * (Application Support), y todo lo que escribe la app pasa por acá.
 *
 * Server-only: usa `path` de Node. No importar desde Client Components.
 */
import path from "path";

/** Carpeta base de datos escribible. */
export function dataDir(): string {
  return process.env.CRM_DATA_DIR || path.join(process.cwd(), "data");
}

/** Ruta del archivo SQLite del CRM. CRM_DB_PATH tiene prioridad (compat). */
export function dbPath(): string {
  return process.env.CRM_DB_PATH || path.join(dataDir(), "crm.db");
}

/** Carpeta de archivos subidos (imágenes de leads, adjuntos). */
export function uploadsDir(): string {
  return path.join(dataDir(), "uploads");
}

/** Carpeta de recovery de generación de propuestas (best-effort). */
export function recoveryDir(): string {
  return path.join(dataDir(), "recovery");
}
