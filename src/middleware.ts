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
const PUBLIC_PREFIXES = ["/api/auth", "/_next", "/favicon", "/p/", "/api/public"];
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
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT_MAX;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && !TICK_PATHS.has(pathname)) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Demasiadas solicitudes, intenta de nuevo en un minuto" }, { status: 429 });
    }
  }

  if (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) ||
    TICK_PATHS.has(pathname)
  ) {
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
