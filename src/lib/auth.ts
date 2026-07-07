/**
 * Auth de UNA sola cuenta por instalación (email+password), no multi-usuario:
 * cada persona que corre su propia instancia del OSS protege SU instancia.
 * Password: scrypt (stdlib de Node, sin dependencia nueva) + salt random,
 * comparación en tiempo constante. Sesiones: tabla auth_sessions — el token
 * crudo va en la cookie, en DB solo se guarda su hash (nunca el token en claro
 * server-side, mismo principio que un password).
 */
import crypto from "crypto";
import Database from "better-sqlite3";
import { dbPath } from "./paths";
import { openDb as openEncrypted } from "./db-open";
import { readSettings, writeSettings } from "./settings";
import { appendAudit } from "./audit";

/** Actor para el audit log: el email de la cuenta, o "operador" si no hay. */
function actorEmail(): string {
  return readSettings(["auth_email"]).auth_email ?? "operador";
}

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
export const SESSION_COOKIE = "niuro_session";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hashHex) return false;
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const storedBuf = Buffer.from(hashHex, "hex");
  if (hash.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(hash, storedBuf);
}

function openDb(): Database.Database {
  return openEncrypted(dbPath(), { timeout: 15000 });
}

export function hasAccount(): boolean {
  return !!readSettings(["auth_password_hash"]).auth_password_hash;
}

/** Crea la cuenta (falla si ya existe una — una sola cuenta por instalación). */
export function createAccount(email: string, password: string): void {
  if (hasAccount()) throw new Error("ya existe una cuenta en esta instalación");
  writeSettings({ auth_email: email, auth_password_hash: hashPassword(password) });
  appendAudit({ actor: email, action: "auth.account_created" });
}

export function verifyAccountPassword(password: string): boolean {
  const hash = readSettings(["auth_password_hash"]).auth_password_hash;
  return !!hash && verifyPassword(password, hash);
}

export function changePassword(newPassword: string): void {
  writeSettings({ auth_password_hash: hashPassword(newPassword) });
  // ponytail: invalidar todas las sesiones al cambiar la contraseña (igual que
  // deleteAccount). Sin esto una cookie robada seguía viva hasta su TTL de 30 días.
  const db = openDb();
  try {
    db.prepare("DELETE FROM auth_sessions").run();
  } finally {
    db.close();
  }
  appendAudit({ actor: actorEmail(), action: "auth.password_changed" });
}

/** Borra la credencial (no toca datos de negocio) y todas las sesiones. */
export function deleteAccount(): void {
  const actor = actorEmail(); // capturar antes de borrar la credencial
  const db = openDb();
  try {
    db.prepare("DELETE FROM crm_settings WHERE key IN ('auth_email', 'auth_password_hash')").run();
    db.prepare("DELETE FROM auth_sessions").run();
  } finally {
    db.close();
  }
  appendAudit({ actor, action: "auth.account_deleted" });
}

export function createSession(): string {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  const db = openDb();
  try {
    // ponytail: limpieza oportunista de sesiones vencidas en vez de un cron
    // aparte — barato, alcanza para el volumen de una sola cuenta.
    db.prepare("DELETE FROM auth_sessions WHERE expires_at < ?").run(now);
    db.prepare(
      "INSERT INTO auth_sessions (id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)"
    ).run(crypto.randomUUID(), tokenHash, now, now + SESSION_TTL_MS);
  } finally {
    db.close();
  }
  appendAudit({ actor: actorEmail(), action: "auth.login" });
  return token;
}

// TTL corto: alcanza para un render (Playwright navega, espera fuentes, saca
// el PDF/HTML y cierra). No es un login real del operador: sin appendAudit,
// para no ensuciar el log de auth con una entrada por cada export.
const INTERNAL_RENDER_SESSION_TTL_MS = 2 * 60 * 1000;

/**
 * Sesion efimera para llamadas internas server-to-server (Playwright
 * renderizando /proposals/[id]/print para el PDF o el HTML standalone). Sin
 * esto, el middleware de auth bloquea esa navegacion (browser headless sin
 * cookie) y el render sale vacio ("No se pudo cargar la propuesta").
 */
export function createInternalRenderSession(): string {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  const db = openDb();
  try {
    db.prepare("DELETE FROM auth_sessions WHERE expires_at < ?").run(now);
    db.prepare(
      "INSERT INTO auth_sessions (id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)"
    ).run(crypto.randomUUID(), tokenHash, now, now + INTERNAL_RENDER_SESSION_TTL_MS);
  } finally {
    db.close();
  }
  return token;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  try {
    const db = openDb();
    try {
      const row = db
        .prepare("SELECT expires_at FROM auth_sessions WHERE token_hash = ?")
        .get(tokenHash) as { expires_at: number } | undefined;
      return !!row && row.expires_at > Date.now();
    } finally {
      db.close();
    }
  } catch {
    return false; // DB no disponible aun (pre-init): tratar como no autenticado
  }
}

export function destroySession(token: string | undefined | null): void {
  if (!token) return;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const db = openDb();
  try {
    db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash);
  } finally {
    db.close();
  }
  appendAudit({ actor: actorEmail(), action: "auth.logout" });
}
