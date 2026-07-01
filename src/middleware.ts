import { NextRequest, NextResponse } from "next/server";
import { hasAccount, verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

// Gate de auth real (el "upgrade path" que dejamos anotado en page.tsx cuando
// hicimos el gate de onboarding). Necesita runtime nodejs (no Edge): usa
// better-sqlite3, un modulo nativo que Edge no puede cargar.

const PUBLIC_PATHS = new Set(["/setup-account", "/login"]);
const PUBLIC_PREFIXES = ["/api/auth", "/_next", "/favicon"];
// Pensados para que los dispare launchd/cron LOCAL sin sesion de browser,
// igual que ya funcionaban antes de este gate.
const TICK_PATHS = new Set(["/api/workflows/tick", "/api/sync/tick", "/api/whatsapp/tick"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
