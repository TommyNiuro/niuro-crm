/**
 * Apertura central de la DB del CRM con cifrado en reposo (SQLCipher).
 *
 * Todo el codigo server-only que abre crm.db pasa por openDb(), no por
 * `new Database(...)` directo. Motivo: con la DB cifrada, la llave tiene que
 * aplicarse (PRAGMA key) apenas se abre la conexion y ANTES de cualquier otra
 * sentencia, o la lectura falla. Un solo lugar que lo garantice evita el bug de
 * "me olvide de keyar la conexion X".
 *
 * El binario nativo es better-sqlite3-multiple-ciphers, aliasado en package.json
 * al nombre "better-sqlite3" (mismo import, misma API, mismos tipos). El cifrado
 * por defecto es ChaCha20-Poly1305; no fijamos PRAGMA cipher, asi que el mismo
 * default aplica al exportar (migracion) y al abrir.
 *
 * IMPORTANTE: esto NO cubre el store de WhatsApp (whatsapp.ts open(), lid.ts),
 * que es una DB externa del bridge Go, en texto plano y ajena a la app. Esos
 * siguen con `new Database(...)` sin llave.
 *
 * Resolucion de la llave (resolveKey), en orden:
 *   1. process.env.CRM_DB_KEY   -> la inyecta el launcher Tauri al hacer spawn.
 *   2. macOS Keychain           -> `security find-generic-password` (caso scripts
 *      tsx, que no reciben la env del launcher pero corren en la Mac del operador).
 *   3. null                     -> sin llave: la DB queda en texto plano (dev, CI
 *      en Linux, tests con :memory:). Cero cambios de comportamiento sin llave.
 */
import Database from "better-sqlite3";
import fs from "fs";
import { execFileSync } from "child_process";
import { dbPath } from "./paths";

/** Service/account de la entrada en el Keychain. Coincide con el identifier de
 * la app Tauri (tauri.conf.json) y con lo que escribe el launcher Rust. */
const KEYCHAIN_SERVICE = "io.niuro.crm";
const KEYCHAIN_ACCOUNT = "db-key";

/** Header de un archivo SQLite en texto plano: "SQLite format 3\0" (16 bytes).
 * Una DB cifrada arranca con bytes opacos, asi que esto distingue plano de
 * cifrado sin depender de intentar abrir con llave. */
const PLAINTEXT_HEADER = Buffer.from("SQLite format 3\0", "latin1");

let _keyResolved = false;
let _key: string | null = null;

/** Lee la llave del Keychain de macOS. Devuelve null en cualquier otro SO, si la
 * entrada no existe, o si `security` no esta disponible. */
function keyFromKeychain(): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const key = out.trim();
    return key.length > 0 ? key : null;
  } catch {
    // No existe la entrada o el comando fallo: no hay llave por esta via.
    return null;
  }
}

/**
 * Llave de cifrado activa, o null si no hay (la DB va en texto plano). Cacheada
 * por proceso: hay muchas aperturas y no queremos spawnear `security` en cada
 * una. Un cambio de llave requiere reiniciar el proceso, que es lo esperable.
 */
export function resolveKey(): string | null {
  if (_keyResolved) return _key;
  // Bajo Vitest nunca ciframos: los tests crean sus DBs en texto plano (tmp o
  // :memory:) con `new Database`, y si en la Mac del operador hubiera una llave
  // en el Keychain (de haber corrido la .app), openDb intentaria keyar esas DBs
  // planas y los tests romperian. El gate lo evita sin depender del entorno.
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    _key = null;
    _keyResolved = true;
    return _key;
  }
  const fromEnv = process.env.CRM_DB_KEY?.trim();
  _key = fromEnv && fromEnv.length > 0 ? fromEnv : keyFromKeychain();
  _keyResolved = true;
  return _key;
}

/** true si el archivo existe y arranca con el header de SQLite en texto plano. */
function isPlaintextDb(file: string): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(16);
    const read = fs.readSync(fd, buf, 0, 16, 0);
    return read === 16 && buf.equals(PLAINTEXT_HEADER);
  } catch {
    return false;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

/** Escapa una ruta para meterla en un literal SQL entre comillas simples. */
function sqlQuote(s: string): string {
  return s.replace(/'/g, "''");
}

let _migrateChecked = false;

/**
 * Migra crm.db de texto plano a cifrado, UNA sola vez, si hace falta. Idempotente:
 * (1) un flag por proceso evita repetir el chequeo, y (2) la deteccion por header
 * hace que un segundo arranque vea la DB ya opaca y no re-keye.
 *
 * Mecanismo: PRAGMA rekey de SQLite3MultipleCiphers, que cifra la DB plana
 * IN-PLACE (este binario NO tiene sqlcipher_export, que es especifico de SQLCipher;
 * verificado empiricamente). Red de seguridad: se copia el plano a .plain-bak antes
 * del rekey; si el rekey falla, o si la DB cifrada resultante no se puede leer con
 * la llave, se restaura del backup. Si todo sale bien, el .plain-bak se BORRA para
 * no dejar una copia sin cifrar de los datos al lado de la DB cifrada.
 */
export function migrateToEncryptedIfNeeded(file: string, key: string): void {
  if (!fs.existsSync(file)) return; // DB nueva: nace cifrada en la primera apertura keyed
  if (!isPlaintextDb(file)) return; // ya cifrada (o header desconocido): no tocar

  const bak = `${file}.plain-bak`;
  if (fs.existsSync(bak)) fs.rmSync(bak, { force: true });
  fs.copyFileSync(file, bak); // backup del plano antes del rekey in-place

  const db = new Database(file, { timeout: 15000 });
  try {
    // Doblar el WAL sobre el archivo principal antes del rekey, para no perder
    // datos que vivan solo en el -wal.
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.pragma("journal_mode = DELETE");
    } catch {
      // no critico: si no hay WAL, seguimos
    }
    // rekey cifra la DB plana in-place con el cipher por defecto (el mismo que
    // aplica openDb al abrir con PRAGMA key).
    db.pragma(`rekey = '${sqlQuote(key)}'`);
    db.close();
  } catch (e) {
    try { db.close(); } catch { /* ya cerrada */ }
    try {
      fs.copyFileSync(bak, file);
      fs.rmSync(bak, { force: true }); // restore OK: quitar la copia plana (no dejar datos sin cifrar)
    } catch { /* restore fallo: NO borrar el backup, es la única copia intacta */ }
    throw new Error(
      `migrateToEncryptedIfNeeded: fallo el rekey, DB restaurada del backup: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  // Sidecars WAL/SHM del plano: ya no aplican a la DB cifrada.
  for (const side of [`${file}-wal`, `${file}-shm`]) {
    if (fs.existsSync(side)) fs.rmSync(side, { force: true });
  }

  // Verificar que la DB cifrada abre y lee con la llave ANTES de descartar el
  // backup plano; si no, restaurar (no perder datos por un rekey a medias).
  try {
    const check = new Database(file, { timeout: 15000 });
    check.pragma(`key = '${sqlQuote(key)}'`);
    check.prepare("SELECT count(*) FROM sqlite_master").get(); // fuerza una lectura real
    check.close();
  } catch (e) {
    try {
      fs.copyFileSync(bak, file);
      fs.rmSync(bak, { force: true }); // restore OK: quitar la copia plana
    } catch { /* restore fallo: NO borrar el backup, es la única copia intacta */ }
    throw new Error(
      `migrateToEncryptedIfNeeded: DB cifrada ilegible con la llave, restaurada del backup: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  // Cifrado OK y verificado: borrar el backup plano (no dejar datos sin cifrar).
  fs.rmSync(bak, { force: true });
}

/**
 * Abre una conexion a crm.db aplicando la llave si hay cifrado activo. Reemplazo
 * directo de `new Database(dbPath(), opts)` en todo el codigo que toca crm.db.
 *
 * @param file Ruta de la DB. Por defecto dbPath() (la crm.db del CRM). Los
 *   distintos call sites que resuelven su propia ruta (CRM_DB en scripts, etc.)
 *   la pasan explicita; siempre es la MISMA base de datos logica del CRM.
 * @param opts Opciones de better-sqlite3 (readonly, fileMustExist, timeout...).
 */
export function openDb(
  file: string = dbPath(),
  opts: Database.Options = {}
): Database.Database {
  const key = resolveKey();

  // Migracion perezosa una vez por proceso: cubre el caso de que el primer
  // opener sea readonly (settings, cache de IA), que por si solo no podria
  // migrar. migrateToEncryptedIfNeeded abre su propia conexion de escritura.
  if (key && !_migrateChecked) {
    _migrateChecked = true;
    try {
      migrateToEncryptedIfNeeded(file, key);
    } catch (e) {
      // Loguear crudo: si la migracion falla no queremos enmascararla, pero
      // tampoco tirar el proceso desde aca. La apertura keyed de abajo fallara
      // ruidosamente si la DB sigue en texto plano, que es la senal correcta.
      console.error(`[db-open] ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const db = new Database(file, opts);
  if (key) {
    // PRIMERA sentencia sobre la conexion: sin esto, cualquier lectura sobre una
    // DB cifrada devuelve "file is not a database".
    db.pragma(`key = '${sqlQuote(key)}'`);
  }
  return db;
}
