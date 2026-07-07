import { NextRequest, NextResponse } from "next/server";
import { hasAccount, verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

// Gate de auth real (el "upgrade path" que dejamos anotado en page.tsx cuando
// hicimos el gate de onboarding). Necesita runtime nodejs (no Edge): usa
// better-sqlite3, un modulo nativo que Edge no puede cargar.

const PUBLIC_PATHS = new Set(["/setup-account", "/login"]);
// /p/ y /api/public: pagina de share de una propuesta (link que se manda a un
// cliente externo por mail/WhatsApp, sin sesion de CRM). Solo expone lo que
// GET /api/public/proposals/[token] decide devolver (nunca transcript/notas/
// contactId/etc), scopeado por shareToken, no por id.
const PUBLIC_PREFIXES = ["/api/auth", "/_next", "/favicon", "/p/", "/api/public", "/api/webhook"];
// Pensados para que los dispare launchd/cron LOCAL sin sesion de browser,
// igual que ya funcionaban antes de este gate.
const TICK_PATHS = new Set(["/api/workflows/tick", "/api/sync/tick", "/api/whatsapp/tick"]);

// Rate limiting basico por IP (auditoria SaaS 2026-07-01): ningun endpoint bajo
// /api/ limitaba requests. Map en memoria, ventana fija de 60s.
// ponytail: alcanza para single-process local/LAN; si esto se vuelve multi-instancia
// detras de un balanceador, mover a un store compartido (Redis) para que el limite
// sea por-cuenta y no por-proceso.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
// Login: límite global fijo (una sola cuenta por instalación), independiente de
// headers del cliente. Frena fuerza bruta aunque falsifiquen X-Forwarded-For.
const LOGIN_MAX = 10;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string, max = RATE_LIMIT_MAX): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count++;
  return bucket.count > max;
}

// Comparación de tiempo constante para secretos (sin depender de node:crypto acá).
function safeEqual(a: string | null | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ticks: los dispara launchd/cron local. Opt-in de secreto compartido: si
  // CRM_TICK_SECRET está seteado, exigir el header x-tick-secret (defensa por si
  // el server se expone fuera de 127.0.0.1); sin secreto configurado, comportamiento
  // previo. Siguen exentos del rate limit (frecuencia baja y controlada).
  if (TICK_PATHS.has(pathname)) {
    const secret = process.env.CRM_TICK_SECRET;
    if (secret && !safeEqual(request.headers.get("x-tick-secret"), secret)) {
      return NextResponse.json({ error: "no autorizado" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Demasiadas solicitudes, intenta de nuevo en un minuto" }, { status: 429 });
    }
    // Login: bucket global fijo, no evadible falsificando X-Forwarded-For.
    if (pathname === "/api/auth/login" && request.method === "POST" && isRateLimited("login-global", LOGIN_MAX)) {
      return NextResponse.json({ error: "Demasiados intentos de inicio de sesión, esperá un minuto" }, { status: 429 });
    }
  }

  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!hasAccount()) {
    return NextResponse.redirect(new URL("/setup-account", request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
